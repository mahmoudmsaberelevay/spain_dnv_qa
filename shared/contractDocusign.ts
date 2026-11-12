/** Public DTOs only. Never expose source URLs, clientUserId, nonce or credentials. */
export type DocusignEnvironment = "demo" | "production";
export type ContractDocusignStatus = "preparing" | "draft" | "sent" | "delivered" | "completed" | "declined" | "voided" | "error" | "uncertain";
export type SafeEnvelope = {
  id: string; version: number; contractId: number; envelopeId: string | null;
  status: ContractDocusignStatus; recipientName: string; email: string;
  createdAt: Date; updatedAt: Date; lastCheckedAt: Date | null;
  linkExpiresAt: Date | null; nextRefreshAt: Date | null;
  canShare: boolean; hasSignatureTabs: boolean; errorCode: string | null;
  canRegenerate?:boolean; linkRevoked?:boolean; autoSignEligible?:boolean; crmSigned?:boolean; financeReviewRequired?:boolean;
  documentHash: string;
  signingRequirements?: { profile: string; pageCount: number; fullSignaturePages: number[]; pageInitialCount: number; clauseInitialCount: number; verified: boolean };
};
export type DocusignReadiness = { configured: boolean; environment: DocusignEnvironment; missingSettings: string[]; canManage: boolean };
export type PrepareDocusignInput = { contractId: number; requestId: string; recipientName: string; recipientEmail: string; confirmed: true };
export type PrepareDocusignResult = { envelope: SafeEnvelope; senderUrl: string };
export type DocusignSigningLink = { url: string; expiresAt: Date };
