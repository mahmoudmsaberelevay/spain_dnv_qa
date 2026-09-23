-- Merge historical Lead owner aliases into current ELEVAY user identities.
-- This changes only ownership names and the supported Lead user-id link.
-- It preserves every Lead, task, status, due date, note, activity, contact,
-- attribution, created timestamp, and financial/contracting record.

UPDATE `leads`
SET
  `assignedTo` = CASE
    WHEN LOWER(TRIM(`assignedTo`)) IN ('basmala', 'basmala sheref', 'basmala shereef') THEN 'Basmala Shereef'
    WHEN LOWER(TRIM(`assignedTo`)) IN ('eman', 'eman ahmed') THEN 'Eman Ahmed'
    WHEN LOWER(TRIM(`assignedTo`)) IN ('fouad', 'fouad abdo') THEN 'Fouad Abdo'
    WHEN LOWER(TRIM(`assignedTo`)) IN ('hager', 'hager hany') THEN 'Hager Hany'
    WHEN LOWER(TRIM(`assignedTo`)) IN ('mahmoud', 'mahmoud saber') THEN 'Mahmoud Saber'
    WHEN LOWER(TRIM(`assignedTo`)) IN ('marwa', 'marwa abdallah') THEN 'Marwa Abdallah'
    WHEN LOWER(TRIM(`assignedTo`)) IN ('nouran', 'nouran mamdouh', 'nourhan mamdouh') THEN 'Nouran Mamdouh'
    WHEN LOWER(TRIM(`assignedTo`)) IN ('ziad el shurafa', 'ziad elshurafa', 'ziad.elshurafa') THEN 'ziad.elshurafa'
    ELSE `assignedTo`
  END,
  `assignedConsultantUserId` = CASE
    WHEN LOWER(TRIM(`assignedTo`)) IN ('basmala', 'basmala sheref', 'basmala shereef') THEN 12484160
    WHEN LOWER(TRIM(`assignedTo`)) IN ('eman', 'eman ahmed') THEN 12484158
    WHEN LOWER(TRIM(`assignedTo`)) IN ('fouad', 'fouad abdo') THEN 933919
    WHEN LOWER(TRIM(`assignedTo`)) IN ('hager', 'hager hany') THEN 12484157
    WHEN LOWER(TRIM(`assignedTo`)) IN ('mahmoud', 'mahmoud saber') THEN 120001
    WHEN LOWER(TRIM(`assignedTo`)) IN ('marwa', 'marwa abdallah') THEN 12484159
    WHEN LOWER(TRIM(`assignedTo`)) IN ('nouran', 'nouran mamdouh', 'nourhan mamdouh') THEN 12484156
    WHEN LOWER(TRIM(`assignedTo`)) IN ('ziad el shurafa', 'ziad elshurafa', 'ziad.elshurafa') THEN 191
    ELSE `assignedConsultantUserId`
  END
WHERE LOWER(TRIM(`assignedTo`)) IN (
  'basmala', 'basmala sheref', 'basmala shereef',
  'eman', 'eman ahmed',
  'fouad', 'fouad abdo',
  'hager', 'hager hany',
  'mahmoud', 'mahmoud saber',
  'marwa', 'marwa abdallah',
  'nouran', 'nouran mamdouh', 'nourhan mamdouh',
  'ziad el shurafa', 'ziad elshurafa', 'ziad.elshurafa'
);

UPDATE `lead_tasks`
SET `assignedTo` = CASE
  WHEN LOWER(TRIM(`assignedTo`)) IN ('basmala', 'basmala sheref', 'basmala shereef') THEN 'Basmala Shereef'
  WHEN LOWER(TRIM(`assignedTo`)) IN ('eman', 'eman ahmed') THEN 'Eman Ahmed'
  WHEN LOWER(TRIM(`assignedTo`)) IN ('fouad', 'fouad abdo') THEN 'Fouad Abdo'
  WHEN LOWER(TRIM(`assignedTo`)) IN ('hager', 'hager hany') THEN 'Hager Hany'
  WHEN LOWER(TRIM(`assignedTo`)) IN ('mahmoud', 'mahmoud saber') THEN 'Mahmoud Saber'
  WHEN LOWER(TRIM(`assignedTo`)) IN ('marwa', 'marwa abdallah') THEN 'Marwa Abdallah'
  WHEN LOWER(TRIM(`assignedTo`)) IN ('nouran', 'nouran mamdouh', 'nourhan mamdouh') THEN 'Nouran Mamdouh'
  WHEN LOWER(TRIM(`assignedTo`)) IN ('ziad el shurafa', 'ziad elshurafa', 'ziad.elshurafa') THEN 'ziad.elshurafa'
  ELSE `assignedTo`
END
WHERE LOWER(TRIM(`assignedTo`)) IN (
  'basmala', 'basmala sheref', 'basmala shereef',
  'eman', 'eman ahmed',
  'fouad', 'fouad abdo',
  'hager', 'hager hany',
  'mahmoud', 'mahmoud saber',
  'marwa', 'marwa abdallah',
  'nouran', 'nouran mamdouh', 'nourhan mamdouh',
  'ziad el shurafa', 'ziad elshurafa', 'ziad.elshurafa'
);
