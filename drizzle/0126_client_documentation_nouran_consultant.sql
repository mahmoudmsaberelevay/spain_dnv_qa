-- Append Nouran without changing existing consultants or folder assignments.
ALTER TABLE `clientCases` MODIFY COLUMN `consultant` enum('Mahmoud','Ziad','Fouad','Kirolos','Nouran') NOT NULL;
