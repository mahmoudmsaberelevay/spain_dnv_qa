-- Agentic Marketing System — Meta Ads Strategy Intake
-- Additive planning-only control-plane records. No Meta credentials, campaign objects,
-- budget/spend data, payment data, provider secrets, CRM clients, Leads or legacy tables change.
CREATE TABLE `marketing_meta_ads_strategy_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `version` int NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'in_progress',
  `resetScope` varchar(96),
  `currentQuestionNumber` int NOT NULL DEFAULT 1,
  `createdByUserId` int NOT NULL,
  `completedAt` bigint,
  `proposedAt` bigint,
  `approvedAt` bigint,
  `approvedByUserId` int,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_meta_ads_strategy_session_version_unique` (`version`),
  KEY `marketing_meta_ads_strategy_session_status_idx` (`status`,`updatedAt`)
);

CREATE TABLE `marketing_meta_ads_strategy_answers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sessionId` int NOT NULL,
  `questionNumber` int NOT NULL,
  `scopeType` varchar(24) NOT NULL DEFAULT 'company',
  `programKey` varchar(96),
  `answerText` mediumtext NOT NULL,
  `normalizedJson` mediumtext,
  `attachmentsJson` mediumtext,
  `decisionStatus` varchar(32) NOT NULL DEFAULT 'answered',
  `gapOwnerUserId` int,
  `gapDueAt` bigint,
  `answeredByUserId` int NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_meta_ads_strategy_answer_unique` (`sessionId`,`questionNumber`,`scopeType`,`programKey`),
  KEY `marketing_meta_ads_strategy_answer_session_idx` (`sessionId`,`questionNumber`),
  KEY `marketing_meta_ads_strategy_gap_idx` (`decisionStatus`,`gapDueAt`)
);