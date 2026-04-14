ALTER TABLE `groupPermissions` ADD `canEdit` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `groupPermissions` ADD `canCreate` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `userPermissions` ADD `canEdit` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `userPermissions` ADD `canCreate` boolean DEFAULT false NOT NULL;