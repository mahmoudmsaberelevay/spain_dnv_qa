-- Additive Client Documentation personnel update.
-- Existing cases and paralegal assignments remain unchanged.
ALTER TABLE `clientCases`
  MODIFY COLUMN `paralegal` ENUM('Madonna','Monica','Marina','Marwa','Minerva','Lea') NULL;
