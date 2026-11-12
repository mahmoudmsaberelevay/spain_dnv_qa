CREATE TABLE `plaud_connections` (
	`userId` int NOT NULL,
	`sealedCredentials` text NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`leaseToken` varchar(64),
	`leaseUntil` bigint,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `plaud_connections_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `plaud_oauth_states` (
	`stateHash` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`sessionHash` varchar(64) NOT NULL,
	`sealedState` text NOT NULL,
	`expiresAt` bigint NOT NULL,
	`consumedAt` bigint,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `plaud_oauth_states_stateHash` PRIMARY KEY(`stateHash`)
);
--> statement-breakpoint
CREATE TABLE `plaud_transcript_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`identityHash` varchar(64) NOT NULL,
	`source` varchar(20) NOT NULL DEFAULT 'plaud',
	`sourceScope` varchar(64) NOT NULL,
	`recordingId` varchar(255) NOT NULL,
	`leadId` int NOT NULL,
	`noteId` int NOT NULL,
	`importerId` int NOT NULL,
	`importerName` varchar(255) NOT NULL,
	`recordingTitle` varchar(500) NOT NULL,
	`callAt` bigint,
	`effectiveAt` bigint NOT NULL,
	`durationMs` bigint,
	`transcript` mediumtext,
	`transcriptHash` varchar(64) NOT NULL,
	`importedAt` bigint NOT NULL,
	`deletedAt` bigint,
	CONSTRAINT `plaud_transcript_imports_id` PRIMARY KEY(`id`),
	CONSTRAINT `plaud_import_identity_uq` UNIQUE(`identityHash`),
	CONSTRAINT `plaud_import_note_uq` UNIQUE(`noteId`)
);
--> statement-breakpoint
ALTER TABLE `lead_notes` MODIFY COLUMN `note` mediumtext NOT NULL;--> statement-breakpoint
CREATE INDEX `plaud_oauth_state_expiry_idx` ON `plaud_oauth_states` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `plaud_import_date_id_idx` ON `plaud_transcript_imports` (`effectiveAt`,`id`);--> statement-breakpoint
CREATE INDEX `plaud_import_lead_idx` ON `plaud_transcript_imports` (`leadId`);