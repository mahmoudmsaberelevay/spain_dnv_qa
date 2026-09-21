-- Add one current, persistent Special Note to each Lead.
-- Existing Leads, ordinary notes, tasks, activities, and attribution history remain unchanged.
ALTER TABLE `leads`
  ADD COLUMN `specialNoteType` enum('zoom_meeting','physical_meeting') NULL,
  ADD COLUMN `specialNote` text NULL,
  ADD COLUMN `specialNoteSetBy` varchar(255) NULL,
  ADD COLUMN `specialNoteUpdatedAt` bigint NULL;
--> statement-breakpoint
CREATE INDEX `leads_special_note_type_idx` ON `leads` (`specialNoteType`);
