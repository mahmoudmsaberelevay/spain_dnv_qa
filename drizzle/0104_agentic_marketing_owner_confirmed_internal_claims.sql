-- ELEVAY Agentic Marketing System: owner-confirmed internal claims.
-- These are intentionally separate from official/government evidence claims.
-- They may inform review-only Marketing planning after an explicit owner confirmation,
-- but never become official evidence, legal advice, automatic publication authority,
-- or a substitute for future official-source review.

CREATE TABLE IF NOT EXISTS `marketing_owner_confirmed_internal_claims` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `internalReferenceId` INT NOT NULL,
  `programKey` VARCHAR(96) NOT NULL,
  `claimType` VARCHAR(48) NOT NULL,
  `claimText` MEDIUMTEXT NOT NULL,
  `sourceDocumentHash` VARCHAR(64) NOT NULL,
  `sourceSection` VARCHAR(160) NOT NULL,
  `riskLevel` VARCHAR(24) NOT NULL DEFAULT 'medium',
  `status` VARCHAR(32) NOT NULL DEFAULT 'owner_confirmed',
  `ownerConfirmationNote` TEXT NOT NULL,
  `contentHash` VARCHAR(64) NOT NULL,
  `confirmedByUserId` INT NOT NULL,
  `confirmedAt` BIGINT NOT NULL,
  `retiredAt` BIGINT NULL,
  `updatedAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_owner_confirmed_internal_claim_hash_unique` (`contentHash`),
  KEY `marketing_owner_confirmed_internal_claim_program_status_idx` (`programKey`, `status`, `updatedAt`),
  KEY `marketing_owner_confirmed_internal_claim_reference_idx` (`internalReferenceId`, `status`)
);
