UPDATE `client_application_activities` AS activity
INNER JOIN `clientCases` AS client_case
  ON client_case.`id` = activity.`clientCaseId`
SET
  activity.`titleEn` = 'Send the Embassy attestation appointment email',
  activity.`titleAr` = 'إرسال بريد حجز موعد تصديق السفارة',
  activity.`bodyEn` = CONCAT(
    'Dear Mr. ', client_case.`clientName`,
    '\n\nnow you will need to send an email to the Spanish Embassy to book an attestation appointment',
    '\n\nyou can find an attached word file here you can just copy the subject and add it to the email subject field and also copy the mail body and just change you personal data Name and Passport Number'
  ),
  activity.`bodyAr` = CONCAT(
    'عزيزي السيد ', client_case.`clientName`, '،',
    '\n\nستحتاج الآن إلى إرسال بريد إلكتروني إلى السفارة الإسبانية لحجز موعد للتصديق.',
    '\n\nستجد هنا ملف Word مرفقًا. يمكنك نسخ عنوان الرسالة ووضعه في خانة موضوع البريد الإلكتروني، ثم نسخ نص الرسالة وتغيير بياناتك الشخصية فقط: الاسم ورقم جواز السفر.'
  ),
  activity.`entityType` = 'notification_attachment',
  activity.`entityPublicId` = 'embassy-email-template',
  activity.`metadata` = JSON_OBJECT(
    'attachment', JSON_OBJECT(
      'publicId', 'embassy-email-template',
      'fileName', 'embassyemail.docx',
      'mimeType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'labelEn', 'Embassy email Word template',
      'labelAr', 'نموذج بريد السفارة بصيغة Word'
    )
  )
WHERE activity.`eventType` = 'appointment_booking_reminder';

UPDATE `client_portal_notifications` AS notification
INNER JOIN `client_portal_applications` AS application
  ON application.`publicId` = notification.`entityPublicId`
INNER JOIN `clientCases` AS client_case
  ON client_case.`id` = application.`clientCaseId`
SET
  notification.`titleEn` = 'Send the Embassy attestation appointment email',
  notification.`titleAr` = 'إرسال بريد حجز موعد تصديق السفارة',
  notification.`bodyEn` = CONCAT(
    'Dear Mr. ', client_case.`clientName`,
    '\n\nnow you will need to send an email to the Spanish Embassy to book an attestation appointment',
    '\n\nyou can find an attached word file here you can just copy the subject and add it to the email subject field and also copy the mail body and just change you personal data Name and Passport Number'
  ),
  notification.`bodyAr` = CONCAT(
    'عزيزي السيد ', client_case.`clientName`, '،',
    '\n\nستحتاج الآن إلى إرسال بريد إلكتروني إلى السفارة الإسبانية لحجز موعد للتصديق.',
    '\n\nستجد هنا ملف Word مرفقًا. يمكنك نسخ عنوان الرسالة ووضعه في خانة موضوع البريد الإلكتروني، ثم نسخ نص الرسالة وتغيير بياناتك الشخصية فقط: الاسم ورقم جواز السفر.'
  ),
  notification.`entityType` = 'notification_attachment',
  notification.`entityPublicId` = 'embassy-email-template'
WHERE notification.`type` = 'appointment_booking_reminder';
