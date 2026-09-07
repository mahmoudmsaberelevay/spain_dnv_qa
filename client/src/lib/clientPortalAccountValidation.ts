import { z } from "zod";

const clientPortalEmailSchema = z
  .string()
  .trim()
  .min(1, "Client email is required")
  .email("Enter a valid client email address, for example name@example.com");

export function validateClientPortalEmail(value: string): string | null {
  const result = clientPortalEmailSchema.safeParse(value);
  return result.success ? null : result.error.issues[0]?.message ?? "Enter a valid client email address";
}

export function formatClientPortalCreateError(message: string): string {
  if (/invalid email|email address|"path"\s*:\s*\[\s*"email"\s*\]/i.test(message)) {
    return "Enter a valid client email address, for example name@example.com";
  }
  if (/"path"\s*:\s*\[\s*"username"\s*\]/i.test(message)) {
    return "Username must be 4–100 characters and may use letters, numbers, dots, underscores, or hyphens";
  }
  if (/username or email already has client access/i.test(message)) {
    return "This username or email already has Client Portal access";
  }
  return "Client access could not be created. Please review the fields and try again";
}
