ALTER TABLE `clientCases`
  MODIFY COLUMN `stage` ENUM('preparation','spain_team_received','submission','approved') NOT NULL DEFAULT 'preparation',
  ADD COLUMN `spainTeamReceivedDate` DATE NULL,
  ADD COLUMN `submissionReceiptLink` TEXT NULL,
  ADD COLUMN `approvalLetterLink` TEXT NULL,
  ADD COLUMN `biometricsAppointmentDate` DATE NULL,
  ADD COLUMN `bankAccountCompletedDate` DATE NULL,
  ADD COLUMN `travelDate` DATE NULL,
  ADD COLUMN `ticketLink` TEXT NULL,
  ADD COLUMN `hotelLink` TEXT NULL,
  ADD COLUMN `arrivalConfirmedDate` DATE NULL,
  ADD COLUMN `residencyCardReadyDate` DATE NULL;

ALTER TABLE `clientDocuments`
  ADD COLUMN `documentLink` TEXT NULL,
  ADD COLUMN `mofaSubmitted` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `mofaSubmittedDate` DATE NULL,
  ADD COLUMN `mofaReceived` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `mofaReceivedDate` DATE NULL,
  ADD COLUMN `embassySubmitted` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `embassySubmittedDate` DATE NULL,
  ADD COLUMN `embassyReceived` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `embassyReceivedDate` DATE NULL;

UPDATE `clientDocuments`
SET
  `mofaSubmitted` = TRUE,
  `mofaSubmittedDate` = COALESCE(DATE(`mofaAttestedDate`), CURRENT_DATE),
  `mofaReceived` = TRUE,
  `mofaReceivedDate` = COALESCE(DATE(`mofaAttestedDate`), CURRENT_DATE)
WHERE `mofaAttested` = TRUE;

UPDATE `clientDocuments`
SET
  `embassySubmitted` = TRUE,
  `embassySubmittedDate` = COALESCE(DATE(`embassyAttestedDate`), CURRENT_DATE),
  `embassyReceived` = TRUE,
  `embassyReceivedDate` = COALESCE(DATE(`embassyAttestedDate`), CURRENT_DATE)
WHERE `embassyAttested` = TRUE;
