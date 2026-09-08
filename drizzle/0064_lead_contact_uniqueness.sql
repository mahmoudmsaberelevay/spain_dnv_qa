CREATE UNIQUE INDEX `leads_test_normalized_phone_uq`
  ON `leads` (`isMetaTestLead`, `normalizedPhone`);

CREATE UNIQUE INDEX `leads_test_normalized_email_uq`
  ON `leads` (`isMetaTestLead`, `normalizedEmail`);
