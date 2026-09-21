import { nanoid } from "nanoid";
import { getFinClientForDisplay } from "./clientSearchHelper";
import {
  isValidClientDocumentationMobile,
  normalizeClientDocumentationMobile,
  type ClientDocumentationOrigin,
} from "../shared/clientDocumentationOrigins";

export type ClientDocumentationIdentityInput = {
  clientOrigin: ClientDocumentationOrigin;
  clientName?: string | null;
  clientMobile?: string | null;
  finClientId?: number | null;
};

export function clientDocumentationIdentityIssues(input: ClientDocumentationIdentityInput) {
  const issues: string[] = [];
  if (input.clientOrigin === "egypt") {
    if (!input.finClientId) issues.push("EGYPT_FIN_CLIENT_REQUIRED");
    return issues;
  }
  if (input.finClientId) issues.push("DUBAI_FIN_CLIENT_NOT_ALLOWED");
  if (!input.clientName?.trim()) issues.push("DUBAI_CLIENT_NAME_REQUIRED");
  if (!isValidClientDocumentationMobile(input.clientMobile)) issues.push("DUBAI_CLIENT_MOBILE_INVALID");
  return issues;
}

export function createDubaiDocumentationClientCode(now = new Date(), suffix = nanoid(8)) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const safeSuffix = suffix.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase();
  if (safeSuffix.length < 6) throw new Error("DUBAI_CLIENT_CODE_ENTROPY_INVALID");
  return `DXB-${date}-${safeSuffix}`;
}

export async function resolveClientDocumentationIdentity(input: ClientDocumentationIdentityInput) {
  const issues = clientDocumentationIdentityIssues(input);
  if (issues.length) throw new Error(issues[0]);

  if (input.clientOrigin === "egypt") {
    const linked = await getFinClientForDisplay(input.finClientId!);
    if (!linked?.clientCode) throw new Error("EGYPT_FIN_CLIENT_NOT_FOUND");
    return {
      clientOrigin: "egypt" as const,
      clientName: linked.name.trim(),
      clientCode: linked.clientCode.trim(),
      clientMobile: normalizeClientDocumentationMobile(linked.phone),
      finClientId: linked.id,
    };
  }

  return {
    clientOrigin: "dubai" as const,
    clientName: input.clientName!.trim(),
    clientCode: createDubaiDocumentationClientCode(),
    clientMobile: normalizeClientDocumentationMobile(input.clientMobile),
    finClientId: null,
  };
}
