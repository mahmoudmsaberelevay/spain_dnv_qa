-- Additive News workflow metadata. Existing rows become pending review until
-- the original source is fetched and a grounded summary is validated.
-- No article, Gmail authorization, schedule, or client records are deleted.
ALTER TABLE `public_news_articles`
  ADD COLUMN `articleContent` mediumtext NULL,
  ADD COLUMN `articleSummary` text NULL,
  ADD COLUMN `publicationStatus` enum('pending_review','published','rejected') NOT NULL DEFAULT 'pending_review',
  ADD COLUMN `accessStatus` enum('pending','processing','accessible','inaccessible','fetch_failed') NOT NULL DEFAULT 'pending',
  ADD COLUMN `accessError` varchar(160) NULL,
  ADD COLUMN `reviewReason` varchar(160) NULL,
  ADD COLUMN `processingAt` timestamp NULL,
  ADD COLUMN `fetchedAt` timestamp NULL,
  ADD COLUMN `summarizedAt` timestamp NULL,
  ADD COLUMN `summaryWordCount` int NULL,
  ADD COLUMN `reviewedAt` timestamp NULL;
--> statement-breakpoint
CREATE INDEX `public_news_articles_publication_queue_idx`
  ON `public_news_articles` (`publicationStatus`, `digestReceivedAt`);
--> statement-breakpoint
CREATE INDEX `public_news_articles_access_queue_idx`
  ON `public_news_articles` (`accessStatus`, `digestReceivedAt`);
