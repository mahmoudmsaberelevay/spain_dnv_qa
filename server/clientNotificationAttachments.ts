export const EMBASSY_EMAIL_TEMPLATE_ATTACHMENT = {
  publicId: "embassy-email-template",
  fileName: "embassyemail.docx",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  storagePath: "/manus-storage/embassy-email-template_2544e6ee.docx",
  labelEn: "Embassy email Word template",
  labelAr: "نموذج بريد السفارة بصيغة Word",
} as const;

export type ClientNotificationAttachment = typeof EMBASSY_EMAIL_TEMPLATE_ATTACHMENT;

const attachments = new Map<string, ClientNotificationAttachment>([
  [EMBASSY_EMAIL_TEMPLATE_ATTACHMENT.publicId, EMBASSY_EMAIL_TEMPLATE_ATTACHMENT],
]);

export function getClientNotificationAttachment(publicId: string) {
  return attachments.get(publicId) ?? null;
}

export function embassyAppointmentBookingMessage(clientName: string) {
  const name = clientName.trim() || "Client";
  return {
    titleEn: "Send the Embassy attestation appointment email",
    titleAr: "إرسال بريد حجز موعد تصديق السفارة",
    bodyEn: `Dear Mr. ${name}\n\nnow you will need to send an email to the Spanish Embassy to book an attestation appointment\n\nyou can find an attached word file here you can just copy the subject and add it to the email subject field and also copy the mail body and just change you personal data Name and Passport Number`,
    bodyAr: `عزيزي السيد ${name}،\n\nستحتاج الآن إلى إرسال بريد إلكتروني إلى السفارة الإسبانية لحجز موعد للتصديق.\n\nستجد هنا ملف Word مرفقًا. يمكنك نسخ عنوان الرسالة ووضعه في خانة موضوع البريد الإلكتروني، ثم نسخ نص الرسالة وتغيير بياناتك الشخصية فقط: الاسم ورقم جواز السفر.`,
    entityType: "notification_attachment",
    entityPublicId: EMBASSY_EMAIL_TEMPLATE_ATTACHMENT.publicId,
    metadata: {
      attachment: {
        publicId: EMBASSY_EMAIL_TEMPLATE_ATTACHMENT.publicId,
        fileName: EMBASSY_EMAIL_TEMPLATE_ATTACHMENT.fileName,
        mimeType: EMBASSY_EMAIL_TEMPLATE_ATTACHMENT.mimeType,
        labelEn: EMBASSY_EMAIL_TEMPLATE_ATTACHMENT.labelEn,
        labelAr: EMBASSY_EMAIL_TEMPLATE_ATTACHMENT.labelAr,
      },
    },
  } as const;
}
