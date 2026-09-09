export type EmailRecipients = string | readonly string[] | null | undefined;

export const MAHMOUD_NOTIFICATION_RECIPIENTS = [
  "mahmoud.saber@elevay.com",
  "mahmoud.saberelevay@gmail.com",
] as const;

export const ZIAD_NOTIFICATION_RECIPIENTS = [
  "Ziadelshurafa@gmail.com",
] as const;

const EXECUTIVE_NOTIFICATION_EMAILS = new Set([
  ...MAHMOUD_NOTIFICATION_RECIPIENTS,
  ...ZIAD_NOTIFICATION_RECIPIENTS,
  "ziad.elshurafa@elevay.com",
].map(email => email.toLowerCase()));

const MAHMOUD_NOTIFICATION_EMAILS = new Set(
  MAHMOUD_NOTIFICATION_RECIPIENTS.map(email => email.toLowerCase()),
);

const ZIAD_NOTIFICATION_EMAILS = new Set([
  ...ZIAD_NOTIFICATION_RECIPIENTS,
  "ziad.elshurafa@elevay.com",
].map(email => email.toLowerCase()));

const BOTH_EXECUTIVES_EVENTS = new Set([
  "contract_created",
  "contract_signed",
  "receipt_created",
  "receipt_signed",
  "receipt_paid",
]);

function splitRecipients(input: EmailRecipients): string[] {
  if (!input) return [];
  const values = typeof input === "string" ? input.split(",") : input;
  return values.map(value => value.trim()).filter(Boolean);
}

export function normalizeEmailRecipients(...inputs: EmailRecipients[]): string[] {
  const recipients = new Map<string, string>();
  for (const input of inputs) {
    for (const recipient of splitRecipients(input)) {
      const key = recipient.toLowerCase();
      if (!recipients.has(key)) recipients.set(key, recipient);
    }
  }
  return Array.from(recipients.values());
}

export function resolveSystemNotificationRecipients(
  eventType: string,
  ...inputs: EmailRecipients[]
): string[] {
  const recipients = normalizeEmailRecipients(...inputs)
    .filter(recipient => !EXECUTIVE_NOTIFICATION_EMAILS.has(recipient.toLowerCase()));

  if (BOTH_EXECUTIVES_EVENTS.has(eventType)) {
    return normalizeEmailRecipients(recipients, MAHMOUD_NOTIFICATION_RECIPIENTS, ZIAD_NOTIFICATION_RECIPIENTS);
  }
  if (eventType === "lead_assigned") {
    return normalizeEmailRecipients(recipients, MAHMOUD_NOTIFICATION_RECIPIENTS);
  }
  return recipients;
}

export function isSystemNotificationVisibleToExecutive(
  email: string | null | undefined,
  eventType: string,
): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !EXECUTIVE_NOTIFICATION_EMAILS.has(normalized)) return true;
  if (BOTH_EXECUTIVES_EVENTS.has(eventType)) return true;
  if (eventType === "lead_assigned") return MAHMOUD_NOTIFICATION_EMAILS.has(normalized);
  return false;
}

export function isExecutiveNotificationEmail(email: string | null | undefined): boolean {
  return Boolean(email && (MAHMOUD_NOTIFICATION_EMAILS.has(email.toLowerCase()) || ZIAD_NOTIFICATION_EMAILS.has(email.toLowerCase())));
}

export function extractSenderAddress(sender: string): string {
  const match = sender.match(/<([^<>]+)>/);
  return (match?.[1] ?? sender).trim().toLowerCase();
}

export function isAllowedSystemEmailSender(sender: string | null | undefined): boolean {
  if (!sender?.trim()) return false;
  return !extractSenderAddress(sender).endsWith("@elevay.com");
}
