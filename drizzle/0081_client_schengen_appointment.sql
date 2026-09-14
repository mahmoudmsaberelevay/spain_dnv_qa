-- Additive Client Documentation workflow field.
-- Existing cases, portal assignments, lifecycle history, and reminder deliveries remain unchanged.
ALTER TABLE `clientCases`
  ADD COLUMN `schengenAppointmentDate` DATE NULL AFTER `embassyEmailDate`;
