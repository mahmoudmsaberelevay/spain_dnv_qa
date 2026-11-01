-- Immutable financial audit snapshots.
-- This migration is additive: it does not delete, rewrite, or recalculate an
-- existing payment, transaction amount, exchange rate, receipt, or contract value.

ALTER TABLE `contracts`
  ADD COLUMN `originalContractValueEur` DECIMAL(12,2) NULL,
  ADD COLUMN `netContractValueEur` DECIMAL(12,2) NULL;

ALTER TABLE `invoices`
  ADD COLUMN `actualReceivedAmount` DECIMAL(14,2) NULL,
  ADD COLUMN `actualReceivedCurrency` VARCHAR(3) NULL,
  ADD COLUMN `paymentEurEquivalent` DECIMAL(12,2) NULL,
  ADD COLUMN `netContractValueEur` DECIMAL(12,2) NULL,
  ADD COLUMN `remainingBeforeEur` DECIMAL(12,2) NULL,
  ADD COLUMN `remainingAfterEur` DECIMAL(12,2) NULL;

ALTER TABLE `payments`
  ADD COLUMN `actualReceivedAmount` DECIMAL(14,2) NULL,
  ADD COLUMN `actualReceivedCurrency` VARCHAR(3) NULL,
  ADD COLUMN `paymentEurEquivalent` DECIMAL(12,2) NULL;

ALTER TABLE `finTransactions`
  ADD COLUMN `transactionCurrency` VARCHAR(3) NULL,
  ADD COLUMN `eurEquivalent` DECIMAL(14,2) NULL;

-- Preserve current contract economics as explicit original/net snapshots.
-- For old contracts, contractValue is already the stored net and discountValue
-- is the existing one-time discount, so original = net + discount.
UPDATE `contracts`
SET
  `originalContractValueEur` = CAST(`contractValue` AS DECIMAL(12,2)) + COALESCE(CAST(`discountValue` AS DECIMAL(12,2)), 0),
  `netContractValueEur` = CAST(`contractValue` AS DECIMAL(12,2))
WHERE `originalContractValueEur` IS NULL OR `netContractValueEur` IS NULL;

-- Preserve historical Finance Income context without using a fixed rate.
-- Rows with no recorded rate remain unknown rather than being silently restated.
UPDATE `finTransactions` ft
LEFT JOIN `finAccounts` fa ON fa.`id` = ft.`accountId`
SET
  ft.`transactionCurrency` = COALESCE(ft.`transactionCurrency`, UPPER(fa.`currency`)),
  ft.`exchangeRate` = CASE
    WHEN UPPER(fa.`currency`) = 'EUR' AND ft.`exchangeRate` IS NULL THEN 1
    ELSE ft.`exchangeRate`
  END,
  ft.`eurEquivalent` = CASE
    WHEN ft.`eurEquivalent` IS NOT NULL THEN ft.`eurEquivalent`
    WHEN UPPER(fa.`currency`) = 'EUR' THEN ft.`amount`
    WHEN ft.`exchangeRate` IS NOT NULL AND ft.`exchangeRate` > 0 THEN ROUND(ft.`amount` / ft.`exchangeRate`, 2)
    ELSE NULL
  END
WHERE ft.`type` = 'income';

-- Existing receipts retain their recorded amounts, currencies, and rates. The
-- values below only copy that evidence into the new immutable snapshot columns.
UPDATE `invoices` i
LEFT JOIN `contracts` c ON c.`id` = i.`contractId`
SET
  i.`actualReceivedAmount` = COALESCE(i.`actualReceivedAmount`, i.`actualPaidAmountEgp`, i.`amountEgp`, i.`amountEur`),
  i.`actualReceivedCurrency` = COALESCE(i.`actualReceivedCurrency`, CASE WHEN i.`actualPaidAmountEgp` IS NOT NULL OR i.`amountEgp` IS NOT NULL THEN 'EGP' ELSE 'EUR' END),
  i.`paymentEurEquivalent` = COALESCE(i.`paymentEurEquivalent`, CASE WHEN i.`actualPaidAmountEgp` IS NOT NULL AND i.`exchangeRate` IS NOT NULL AND i.`exchangeRate` > 0 THEN ROUND(i.`actualPaidAmountEgp` / i.`exchangeRate`, 2) ELSE i.`amountEur` END),
  i.`netContractValueEur` = COALESCE(i.`netContractValueEur`, c.`netContractValueEur`, c.`contractValue`)
WHERE i.`status` = 'paid';

UPDATE `payments` p
INNER JOIN `invoices` i ON i.`id` = p.`invoiceId`
SET
  p.`actualReceivedAmount` = COALESCE(p.`actualReceivedAmount`, i.`actualReceivedAmount`, i.`actualPaidAmountEgp`, p.`amountEgp`, p.`amountEur`),
  p.`actualReceivedCurrency` = COALESCE(p.`actualReceivedCurrency`, i.`actualReceivedCurrency`, CASE WHEN i.`actualPaidAmountEgp` IS NOT NULL OR p.`amountEgp` IS NOT NULL THEN 'EGP' ELSE 'EUR' END),
  p.`paymentEurEquivalent` = COALESCE(p.`paymentEurEquivalent`, i.`paymentEurEquivalent`, p.`amountEur`)
WHERE p.`actualReceivedAmount` IS NULL OR p.`actualReceivedCurrency` IS NULL OR p.`paymentEurEquivalent` IS NULL;

-- Rebuild only derived Client Database totals from immutable receipt payments
-- and recorded Finance Income rows. Payment and transaction ledger rows stay
-- unchanged; Paid EGP is the sum of actual recorded EGP payments/income.
UPDATE `finClients` fc
LEFT JOIN (
  SELECT
    `contractId`,
    SUM(COALESCE(`paymentEurEquivalent`, `amountEur`, 0)) AS receiptPaidEur,
    SUM(CASE WHEN `actualReceivedCurrency` = 'EGP' THEN COALESCE(`actualReceivedAmount`, `amountEgp`, 0) ELSE 0 END) AS receiptPaidEgp
  FROM `payments`
  GROUP BY `contractId`
) p ON p.`contractId` = fc.`contractId`
LEFT JOIN (
  SELECT
    `finClientId`,
    SUM(COALESCE(`eurEquivalent`, 0)) AS incomePaidEur,
    SUM(CASE WHEN `transactionCurrency` = 'EGP' THEN `amount` ELSE 0 END) AS incomePaidEgp
  FROM `finTransactions`
  WHERE `type` = 'income' AND `finClientId` IS NOT NULL
  GROUP BY `finClientId`
) t ON t.`finClientId` = fc.`id`
SET
  fc.`paidAmountEur` = ROUND(GREATEST(0, COALESCE(fc.`basePaidAmountEur`, 0)) + COALESCE(p.receiptPaidEur, 0) + COALESCE(t.incomePaidEur, 0), 2),
  fc.`paidAmountEgp` = ROUND(COALESCE(p.receiptPaidEgp, 0) + COALESCE(t.incomePaidEgp, 0), 2),
  fc.`remainingAmountEur` = GREATEST(0, ROUND(COALESCE(fc.`contractValueEur`, fc.`contractValue`, 0) - (GREATEST(0, COALESCE(fc.`basePaidAmountEur`, 0)) + COALESCE(p.receiptPaidEur, 0) + COALESCE(t.incomePaidEur, 0)), 2));

-- Legacy rows with a negative paid base and no payment ledger cannot represent
-- a payment. Reset only those derived totals to zero; receipts and transactions
-- remain untouched. Complete a missing current EUR net value from its stored
-- contract value when one is available.
UPDATE `finClients` fc
LEFT JOIN `finTransactions` ft ON ft.`finClientId` = fc.`id` AND ft.`type` = 'income'
LEFT JOIN `payments` p ON p.`contractId` = fc.`contractId`
SET
  fc.`basePaidAmountEur` = 0,
  fc.`paidAmountEur` = 0,
  fc.`paidAmountEgp` = 0,
  fc.`remainingAmountEur` = COALESCE(fc.`contractValueEur`, fc.`contractValue`, 0)
WHERE fc.`isLegacy` = 1
  AND fc.`basePaidAmountEur` < 0
  AND ft.`id` IS NULL
  AND p.`id` IS NULL;

UPDATE `finClients`
SET `contractValueEur` = `contractValue`,
    `remainingAmountEur` = COALESCE(`remainingAmountEur`, `contractValue`)
WHERE `isLegacy` = 0
  AND `contractValueEur` IS NULL
  AND `contractValue` IS NOT NULL;
