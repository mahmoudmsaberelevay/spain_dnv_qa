-- Additive Egypt/Dubai origin support for Client Documentation creation.
-- Every existing case remains linked to the existing Egypt workflow by default.
ALTER TABLE `clientCases`
  ADD COLUMN IF NOT EXISTS `clientOrigin` enum('egypt','dubai') NOT NULL DEFAULT 'egypt';

ALTER TABLE `clientCases`
  ADD COLUMN IF NOT EXISTS `clientMobile` varchar(64) NULL;
