-- Keep the receipt's EUR/EGP due-rate distinct from the rate used to convert
-- the actual received currency into its EUR payment credit.
-- Existing values are copied as historical evidence only; no recorded payment,
-- receipt amount, contract value, or balance is recalculated by this migration.

ALTER TABLE `invoices`
  ADD COLUMN `paymentExchangeRate` DECIMAL(10,4) NULL;

ALTER TABLE `payments`
  ADD COLUMN `paymentExchangeRate` DECIMAL(10,4) NULL;

UPDATE `invoices`
SET `paymentExchangeRate` = `exchangeRate`
WHERE `paymentExchangeRate` IS NULL
  AND `exchangeRate` IS NOT NULL;

UPDATE `payments` p
LEFT JOIN `invoices` i ON i.`id` = p.`invoiceId`
SET p.`paymentExchangeRate` = COALESCE(p.`paymentExchangeRate`, i.`paymentExchangeRate`, p.`exchangeRate`)
WHERE p.`paymentExchangeRate` IS NULL;
