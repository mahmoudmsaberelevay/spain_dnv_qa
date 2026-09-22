import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const routes = readFileSync(resolve(root, "server/clientPortalRoutes.ts"), "utf8");
const service = readFileSync(resolve(root, "server/clientChatService.ts"), "utf8");
const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
const migration = readFileSync(resolve(root, "drizzle/0079_client_employee_chat_push.sql"), "utf8");

describe("ELEVAY client app canonical chat bridge", () => {
  it("keeps employee mobile chat behind the existing employee session and opaque folder authorization", () => {
    const employeeMiddleware = routes.indexOf('app.use("/client-api/employee", employeeAuth)');
    const employeeChat = routes.indexOf('app.get("/client-api/employee/folders/:folderId/chat"');
    const portalMiddleware = routes.indexOf('app.use("/client-api", portalAuth)');
    expect(employeeMiddleware).toBeGreaterThan(0);
    expect(employeeChat).toBeGreaterThan(employeeMiddleware);
    expect(employeeChat).toBeLessThan(portalMiddleware);
    expect(routes).toContain("decodeEmployeeFolderId(req.params.folderId)");
    expect(service).toContain('You are not an assigned participant in this client conversation');
    expect(service).toContain('access.clientDocs === "none"');
  });

  it("uses one canonical conversation for portal and employee text, files, voice notes, polling, drafts, reactions, edits, and receipts", () => {
    expect(routes).toContain('/client-api/applications/:applicationId/messages');
    expect(routes).toContain('/client-api/employee/folders/:folderId/chat/messages');
    expect(routes).toContain('/client-api/employee/folders/:folderId/chat/attachments');
    expect(routes).toContain('/client-api/employee/folders/:folderId/chat/poll');
    expect(routes).toContain('/client-api/employee/folders/:folderId/chat/draft');
    expect(routes).toContain('/client-api/employee/folders/:folderId/chat/messages/:messageId/reaction');
    expect(routes).toContain('/client-api/applications/:applicationId/messages/:messageId/read');
    expect(service).toContain("markPortalRead");
    expect(service).toContain("markStaffRead");
    expect(service).toContain("transcribeChatVoice");
  });

  it("shows CRM employee names and the authenticated portal username rather than the assigned folder name", () => {
    expect(service).toContain('senderNameSnapshot: input.actor.name?.trim() || input.actor.email?.trim() || "ELEVAY Team"');
    expect(routes).toContain('senderName: req.portal!.user.username');
    expect(routes).not.toContain('senderName: owned.clientCase.clientName');
  });

  it("fans new messages out to every other active participant with the requested concise sender and content preview", () => {
    expect(service).toContain("notifyPortalChatParticipants");
    expect(service).toContain("notifyEmployeeChatParticipants");
    expect(service).toContain("senderStaffUserId: input.actor.id");
    expect(service).toContain("getChatNotificationCopy");
    expect(service).toContain("senderNameSnapshot");
    expect(service).toContain("compactChatPreview");
    expect(service).toContain('channelId: "chat"');
    expect(routes).toContain('data.type === "client_chat_message" ? { channelId: "chat" }');
  });

  it("returns named delivery, read, and listened receipts to authorized client and employee viewers", () => {
    expect(routes).toContain('/client-api/employee/folders/:folderId/chat/messages/:messageId/info');
    expect(routes).toContain('/client-api/applications/:applicationId/messages/:messageId/info');
    expect(service).toContain("listMessageReceiptDetails");
    expect(service).toContain("displayName:");
    expect(service).toContain("deliveredAt: row.deliveredAt");
    expect(service).toContain("readAt: row.readAt");
    expect(service).toContain("listenedAt: row.listenedAt");
    expect(service).toContain("markParticipantDelivered");
    expect(service).toMatch(/markParticipantDelivered[\s\S]{0,220}db\.transaction/);
    expect(service).toContain("isNull(clientChatMessageReceipts.deliveredAt)");
    expect(service).toContain(".insert(clientChatMessageReceipts).ignore()");
    expect(service).toContain("if (!changed) return false;");
    expect(service).toContain("row.participantId !== senderParticipantId");
    expect(service).toContain('!["voice", "audio"].includes(message.messageType)');
    expect(service).toContain('Only audio messages can be marked as listened');
    expect(service).toContain("assertCompletedPlayback");
    expect(service).toContain("createPlaybackProof");
    expect(routes).toContain("/playback-start");
    expect(routes).toContain("playbackToken");
  });

  it("limits client receipt detail to the caller's own sent message and sanitized staff recipients", () => {
    const start = service.indexOf("export async function getPortalMessageInfo");
    const end = service.indexOf("export async function markPortalRead", start);
    const portalInfo = service.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(portalInfo).toContain('message.senderType === "client" && message.senderParticipantId === participant.id');
    expect(portalInfo).toContain('receipt.participantType === "staff"');
    expect(portalInfo).toContain("participantPublicId:");
    expect(portalInfo).toContain("displayName:");
    expect(portalInfo).not.toMatch(/deviceName\s*:/);
    expect(portalInfo).not.toMatch(/role\s*:/);
    expect(portalInfo).not.toContain('participantType: "portal"');
    expect(service).toContain('const receiptMessageIds = rows.filter(row => row.senderType === "client" && row.senderParticipantId === viewerParticipantId)');
    expect(service).toMatch(/projectPortalMessages[\s\S]{0,1800}eq\(clientChatParticipants\.participantType, "staff"\)/);
  });

  it("retries failed chat pushes with stable per-message recipient/token keys without duplicating in-app notifications", () => {
    expect(service).toContain("claimChatPushDelivery");
    expect(service).toContain('delivery.status === "sent" || delivery.attempts >= 3');
    expect(service).toContain('eq(clientPortalDeliveryOutbox.attempts, delivery.attempts)');
    expect(service).toContain('client-chat-push:${input.messagePublicId}:u:${recipient.portalUserId}');
    expect(service).toContain('employee-chat:${input.messagePublicId}:s:${session.staffUserId}:t:${tokenHash}');
    expect(service).toContain("db.insert(clientPortalNotifications).ignore().values");
    expect(routes).toContain("idempotencyKeyBase?: string");
    expect(routes).toContain('createHash("sha256").update(token)');
    expect(routes).toContain('delivery?.status === "sent" || (delivery?.attempts ?? 0) >= 3');
    expect(routes).toContain("deliveryAffectedRows(claim) !== 1");
    expect(routes).toContain('idempotencyKey: `client-chat-sent:${publicId}:u:${req.portal!.user.id}`');
    expect(routes).toContain('idempotencyKey: `client-chat-sent:${message.publicId}:u:${req.portal!.user.id}`');
    expect(routes.match(/db\.insert\(clientPortalNotifications\)\.ignore\(\)\.values/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("supports client and employee unread alarms plus exact Chat deep links", () => {
    expect(routes).toContain('/client-api/chat/unread');
    expect(routes).toContain('/client-api/employee/chat/unread');
    expect(routes).toContain('/client-api/employee/notifications');
    expect(service).toContain("listPortalChatUnread");
    expect(service).toContain("listEmployeeChatUnread");
    expect(service).toContain("resolvePortalChatMessageApplications");
    expect(service).toContain("encodeEmployeeFolderId(input.clientCaseId)");
  });

  it("adds employee push tokens through a nullable additive migration only", () => {
    expect(schema).toContain('pushToken: varchar("pushToken", { length: 512 })');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS `pushToken` varchar(512) NULL');
    expect(migration).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
    expect(routes).toContain('/client-api/employee/devices/push-token');
    expect(routes).toContain('clientEmployeeSessions.id, req.employee!.session.id');
  });
});
