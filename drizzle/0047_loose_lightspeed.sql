CREATE TABLE `marketing_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`title` varchar(500) NOT NULL,
	`start_date` varchar(50) NOT NULL,
	`content_ratio` text,
	`pillar_focus` text,
	`featured_programs` text,
	`plan_json` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketing_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marketing_week_media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`plan_id` int,
	`user_id` varchar(255) NOT NULL,
	`week_label` varchar(200) NOT NULL,
	`week_focus` text,
	`result_json` text,
	`word_doc_url` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketing_week_media_id` PRIMARY KEY(`id`)
);
