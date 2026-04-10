ALTER TABLE `finCommissions` MODIFY COLUMN `finClientId` int;--> statement-breakpoint
ALTER TABLE `finClients` ADD `paidAmountEgp` decimal(14,2);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `seqNumber` int;--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `status` enum('Pending','Started','Cancelled') DEFAULT 'Pending';--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `signingDate` timestamp;--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `leadSource` enum('Sales Mining','Referal','Marketing');--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `qualifierName` varchar(128);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `qualifierCommissionAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `qualifierCommissionDate` timestamp;--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `qualifierLeader` varchar(128);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `qualifierLeaderCommissionAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `qualifierLeaderCommissionDate` timestamp;--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `paralegalTlCommissionAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `paralegalTlCommissionDate` timestamp;--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `operationManagerCommissionAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `operationManagerCommissionDate` timestamp;--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `paralegal` varchar(128);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `paralegalFirstPaymentAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `paralegalFirstPaymentDate` timestamp;--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `paralegalSecondPaymentAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `paralegalSecondPaymentDate` timestamp;--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `paralegalThirdPaymentAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `paralegalThirdPaymentDate` timestamp;--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `consultantTotalPayment` decimal(12,2);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `consultantFirstPayment` decimal(12,2);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `consultantFirstPaymentDate` timestamp;--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `consultantSecondPayment` decimal(12,2);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `consultantSecondPaymentDate` timestamp;--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `consultantThirdPayment` decimal(12,2);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `consultantThirdPaymentDate` timestamp;--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `leaderName` varchar(128) DEFAULT 'Mahmoud Saber';--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `leaderCommissionAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `leaderCommissionDate` timestamp;--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `notionPageId` varchar(64);--> statement-breakpoint
ALTER TABLE `finCommissions` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;