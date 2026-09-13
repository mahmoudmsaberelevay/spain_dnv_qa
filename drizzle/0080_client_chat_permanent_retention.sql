-- ELEVAY Client Chat keeps all canonical messages and attachments indefinitely.
-- Storage quota enforcement may reject new uploads, but it must never delete old history.
UPDATE `client_chat_conversations`
SET `retentionPolicy` = 'indefinite'
WHERE `retentionPolicy` <> 'indefinite';

ALTER TABLE `client_chat_conversations`
  MODIFY COLUMN `retentionPolicy` enum('indefinite') NOT NULL DEFAULT 'indefinite';
