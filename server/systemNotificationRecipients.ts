export const MANDATORY_SYSTEM_NOTIFICATION_RECIPIENT = "Ziadelshurafa@gmail.com";

export type EmailRecipients = string | readonly string[] | null | undefined;

function splitRecipients(input: EmailRecipients): string[] {
  if (!input) return [];
  const values = typeof input === "string" ? input.split(",") : input;
  return values.map(value => value.trim()).filter(Boolean);
}

export function mergeSystemNotificationRecipients(...inputs: EmailRecipients[]): string[] {
  const recipients = new Map<string, string>();
  for (const input of [...inputs, MANDATORY_SYSTEM_NOTIFICATION_RECIPIENT]) {
    for (const recipient of splitRecipients(input)) {
      const key = recipient.toLowerCase();
      if (!recipients.has(key)) recipients.set(key, recipient);
    }
  }
  return Array.from(recipients.values());
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

export function extractSenderAddress(sender: string): string {
  const match = sender.match(/<([^<>]+)>/);
  return (match?.[1] ?? sender).trim().toLowerCase();
}

export function isAllowedSystemEmailSender(sender: string | null | undefined): boolean {
  if (!sender?.trim()) return false;
  return !extractSenderAddress(sender).endsWith("@elevay.com");
}
