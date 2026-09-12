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

  it("shows CRM employee names and authoritative client case names rather than account aliases", () => {
    expect(service).toContain('senderNameSnapshot: input.actor.name?.trim() || input.actor.email?.trim() || "ELEVAY Team"');
    expect(routes).toContain('senderName: owned.clientCase.clientName');
    expect(routes).not.toContain('senderName: req.portal!.user.username');
  });

  it("fans new messages out to every other active participant without leaking message content in push payloads", () => {
    expect(service).toContain("notifyPortalChatParticipants");
    expect(service).toContain("notifyEmployeeChatParticipants");
    expect(service).toContain("senderStaffUserId: input.actor.id");
    expect(service).toContain('body = input.kind === "attachment"');
    expect(service).toContain('channelId: "chat"');
    expect(routes).toContain('data.type === "client_chat_message" ? { channelId: "chat" }');
    expect(service).not.toMatch(/data\s*=\s*\{[\s\S]{0,500}\bbody:\s*(?:message|input\.body|created\.body)/);
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
