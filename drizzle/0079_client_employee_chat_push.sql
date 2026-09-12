ALTER TABLE `client_employee_sessions`
  ADD COLUMN IF NOT EXISTS `pushToken` varchar(512) NULL AFTER `appVersion`;
