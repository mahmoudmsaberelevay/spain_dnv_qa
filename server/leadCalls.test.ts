import { describe, expect, it, vi } from "vitest";
import { SignJWT, decodeJwt } from "jose";
import twilio from "twilio";
import { getTableName } from "drizzle-orm";
import {
  leadCallRecords,
  leadCallPolicies,
  leadCallAgentSettings,
  leadActivities,
  users,
  leads,
  leadsPermissions,
  type LeadCallRecord,
  type LeadCallPolicy,
} from "../drizzle/schema";
import { COOKIE_NAME } from "../shared/const";
import { shouldApplyCallStatus } from "../shared/leadCalls";
import {
  hasScopedLeadAccess,
  verifyCallSession,
  type CallActor,
} from "./leadCallsAccess";
import {
  getLeadCallsConfig,
  getLeadCallsReadiness,
  normalizeLeadCallPhone,
} from "./leadCallsConfig";
import {
  applyCallStatus,
  claimVoiceIntent,
  hashCallIntent,
  matchesCallIntent,
  nextAgentRate,
  prepareLeadCall,
} from "./leadCallsDb";
import {
  mintCallVoiceToken,
  refreshCallVoiceToken,
  toLeadCallDto,
} from "./leadCallsService";
import {
  acceptCallConsent,
  applyRecordingWebhook,
  buildCallConsentTwiML,
  buildCallDialTwiML,
  hasExactCustomerLeg,
  protectedRecordingUrl,
  recordingWebhookMatches,
  validateCallWebhook,
  validRecordingRange,
  streamCallRecording,
} from "./leadCallsWebhooks";
import {
  assertCallMutationOrigin,
  callPolicyInput,
  leadCallsRouter,
} from "./leadCallsRouter";

// Every credential and contact below is a deliberately synthetic fixture. Never access process.env.
const secret = "synthetic-session-signing-key-not-real";
const env = {
  JWT_SECRET: secret,
  VITE_APP_ID: "synthetic-app",
  ELEVAY_CALLING_ENABLED: "true",
  ELEVAY_CALL_PROCESSING_ENABLED: "true",
  TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
  TWILIO_API_KEY_SID: `SK${"b".repeat(32)}`,
  TWILIO_API_KEY_SECRET: "synthetic-api-key",
  TWILIO_AUTH_TOKEN: "synthetic-auth-token",
  TWILIO_TWIML_APP_SID: `AP${"c".repeat(32)}`,
  TWILIO_DEFAULT_CALLER_ID: "+14155552671",
  TWILIO_WEBHOOK_BASE_URL: "https://crm.example.test",
  TWILIO_BROWSER_ORIGINS:
    "https://www.crm.example.test,http://unsafe.test,https://bad.test/path",
};
const config = getLeadCallsConfig(env);
const actor: CallActor = {
  id: 7,
  name: "Synthetic Agent",
  email: "agent@example.test",
  role: "user",
  openId: "7",
};
const parentSid = `CA${"1".repeat(32)}`,
  childSid = `CA${"2".repeat(32)}`,
  otherSid = `CA${"3".repeat(32)}`,
  recordingSid = `RE${"4".repeat(32)}`;
const token = "a".repeat(43);
const now = Date.now();
const policy = (): LeadCallPolicy => ({
  id: 1,
  policyKey: "default",
  enabled: true,
  callingApproved: true,
  processingApproved: true,
  policyVersion: "test-policy",
  recordingNoticeAr: "تم تسجيل هذه المكالمة للتحسين. اضغط واحد للموافقة.",
  recordingNoticeEn:
    "This call is recorded for quality and transcription. Press 1 to consent.",
  consentRequired: true,
  mediaProtectionConfirmed: true,
  retentionDays: 90,
  scheduleCronTaskUid: "synthetic-job",
  scheduleEnabled: true,
  scheduleUpdatedAt: now,
  updatedBy: 1,
  updatedAt: now,
});
const row = (patch: Partial<LeadCallRecord> = {}): LeadCallRecord => ({
  id: 1,
  leadId: 9,
  agentId: 7,
  agentName: actor.name!,
  activityId: 3,
  intentHash: hashCallIntent(token),
  intentExpiresAt: now + 90_000,
  intentConsumedAt: null,
  callerId: config.defaultCallerId!,
  destination: "+201012345678",
  agentIdentity: "elevay_user_7",
  direction: "outbound",
  status: "initializing",
  parentCallSid: null,
  childCallSid: null,
  parentSequence: -1,
  childSequence: -1,
  activeAgentId: 7,
  activeLeadId: 9,
  recordingSid: null,
  recordingCallSid: null,
  recordingStatus: "none",
  recordingStartClaimedAt: null,
  durationSeconds: 0,
  startedAt: null,
  answeredAt: null,
  endedAt: null,
  transcript: null,
  transcriptSegmentsJson: null,
  aiSummaryJson: null,
  callOutcome: null,
  suggestedNextAction: null,
  transcriptionStatus: "not_requested",
  summaryStatus: "not_requested",
  processingAttempts: 0,
  nextAttemptAt: null,
  processingLeaseUntil: null,
  processingLeaseToken: null,
  processingErrorCode: null,
  consentStatus: "pending",
  recordingConsentAt: null,
  retentionExpiresAt: now + 86_400_000,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
  ...patch,
});

const dbMock = vi.hoisted(() => ({ current: null as any }));
vi.mock("./db", () => ({ getDb: vi.fn(async () => dbMock.current) }));

/** Small transactional MySQL surrogate. Executes real Drizzle predicates against fixture rows only. */
function conditionText(value: any): string {
  if (value == null) return "null";
  if (value.queryChunks) return value.queryChunks.map(conditionText).join("");
  if (value.table && typeof value.name === "string")
    return `row[${JSON.stringify(value.name)}]`;
  if (Array.isArray(value.value)) return value.value.join("");
  if ("value" in Object(value)) return JSON.stringify(value.value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
function predicate(value: any, record: any): boolean {
  if (!value) return true;
  const expression = conditionText(value)
    .replace(/\bis not null\b/gi, "!== null")
    .replace(/\bis null\b/gi, "=== null")
    .replace(/\band\b/gi, "&&")
    .replace(/\bor\b/gi, "||")
    .replace(/(?<![<>=!])=(?!=)/g, "===");
  return Function("row", `return (${expression});`)(record);
}
function fakeDb(initial: LeadCallRecord[] = []) {
  const tables = new Map<string, any[]>([
    [getTableName(leadCallRecords), initial.map(item => ({ ...item }))],
    [getTableName(leadCallPolicies), [policy()]],
    [
      getTableName(leadCallAgentSettings),
      [
        {
          userId: 7,
          canCall: true,
          canListen: true,
          callerId: null,
          maxCallsPerHour: 10,
          rateWindowStartedAt: now,
          rateCount: 0,
          updatedBy: 1,
          updatedAt: now,
        },
      ],
    ],
    [getTableName(users), [{ ...actor }]],
    [
      getTableName(leads),
      [
        {
          id: 9,
          phone: "+201012345678",
          assignedConsultantUserId: 7,
          assignedTo: actor.name,
          optOutSignal: false,
        },
      ],
    ],
    [
      getTableName(leadsPermissions),
      [{ userId: 7, canView: true, canEdit: true }],
    ],
    [
      getTableName(leadActivities),
      [
        {
          id: 3,
          leadId: 9,
          userId: 7,
          activityType: "call_made",
          description: "initial",
          createdAt: now,
        },
      ],
    ],
  ]);
  const data = (table: any) => {
    const name = getTableName(table);
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  };
  let serial = Promise.resolve();
  const db: any = {
    select(projection?: any) {
      let table: any,
        cond: any,
        max = Infinity;
      const query: any = {
        from(t: any) {
          table = t;
          return query;
        },
        where(c: any) {
          cond = c;
          return query;
        },
        limit(n: number) {
          max = n;
          return query;
        },
        orderBy() {
          return query;
        },
        for() {
          return query;
        },
        then(resolve: any, reject: any) {
          try {
            let items = data(table)
              .filter(item => predicate(cond, item))
              .slice(0, max)
              .map(item => ({ ...item }));
            if (projection)
              items = items.map(item =>
                Object.fromEntries(
                  Object.entries(projection).map(([key, column]: any) => [
                    key,
                    item[column.name],
                  ])
                )
              );
            return Promise.resolve(items).then(resolve, reject);
          } catch (error) {
            return Promise.reject(error).then(resolve, reject);
          }
        },
      };
      return query;
    },
    insert(table: any) {
      return {
        values(values: any) {
          const items = data(table);
          const saved = {
            ...(table === leadCallRecords ? row() : {}),
            ...values,
            id:
              values.id ?? Math.max(0, ...items.map(item => item.id ?? 0)) + 1,
          };
          if (
            table === leadCallRecords &&
            items.some(
              item =>
                (item.activeAgentId != null &&
                  item.activeAgentId === saved.activeAgentId) ||
                (item.activeLeadId != null &&
                  item.activeLeadId === saved.activeLeadId)
            )
          )
            throw new Error("synthetic_unique_slot_conflict");
          items.push(saved);
          return Promise.resolve([{ insertId: saved.id, affectedRows: 1 }]);
        },
      };
    },
    update(table: any) {
      return {
        set(values: any) {
          return {
            async where(cond: any) {
              const items = data(table).filter(item => predicate(cond, item));
              for (const item of items) Object.assign(item, values);
              return [{ affectedRows: items.length }];
            },
          };
        },
      };
    },
    transaction(fn: any) {
      const task = serial.then(async () => {
        const snapshot = new Map(
          Array.from(tables, ([key, values]) => [
            key,
            values.map(value => ({ ...value })),
          ])
        );
        try {
          return await fn(db);
        } catch (error) {
          tables.clear();
          snapshot.forEach((value, key) => tables.set(key, value));
          throw error;
        }
      });
      serial = task.then(
        () => undefined,
        () => undefined
      );
      return task;
    },
    data,
  };
  return db;
}
async function session(
  payload: Record<string, unknown> = { openId: "7", appId: "synthetic-app" },
  signingSecret = secret,
  expired = false
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expired ? Math.floor(Date.now() / 1000) - 1 : "5m")
    .sign(new TextEncoder().encode(signingSecret));
}
function signedWebhook(path: string, body: Record<string, string>) {
  return {
    originalUrl: path,
    body,
    headers: {
      "x-twilio-signature": twilio.getExpectedTwilioSignature(
        config.authToken,
        `${config.webhookBaseUrl}${path}`,
        body
      ),
      host: "attacker.test",
      "x-forwarded-host": "attacker.test",
    },
  };
}
const childBody = (patch: Record<string, string> = {}) => ({
  AccountSid: config.accountSid,
  CallSid: childSid,
  ParentCallSid: parentSid,
  To: "+201012345678",
  From: config.defaultCallerId!,
  ...patch,
});

describe("lead calls independent session and scoped authorization", () => {
  it("verifies existing signed numeric openId login cookies without decoding trust", async () => {
    const result = await verifyCallSession(
      { headers: { cookie: `${COOKIE_NAME}=${await session()}` } },
      async identity => (identity === "7" ? actor : null),
      secret,
      "synthetic-app"
    );
    expect(result.id).toBe(7);
  });
  it("rejects forged, expired, wrong-app, missing-expiry, and arbitrary userId JWTs before lookup", async () => {
    const lookup = vi.fn(async () => actor);
    for (const jwt of [
      await session(undefined, "forged-key"),
      await session(undefined, secret, true),
      await session({ openId: "7", appId: "other" }),
      await session({ userId: 7, appId: "synthetic-app" }),
      await new SignJWT({ openId: "7", appId: "synthetic-app" })
        .setProtectedHeader({ alg: "HS256" })
        .sign(new TextEncoder().encode(secret)),
    ]) {
      await expect(
        verifyCallSession(
          { headers: {}, cookies: { [COOKIE_NAME]: jwt } },
          lookup,
          secret,
          "synthetic-app"
        )
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    expect(lookup).not.toHaveBeenCalled();
  });
  it("ignores forged global ctx.user at calls router boundary", async () => {
    const caller = leadCallsRouter.createCaller({
      user: { ...actor, role: "admin" },
      req: { headers: {}, cookies: {} },
      res: { setHeader: vi.fn() },
    } as any);
    await expect(caller.agentSettings()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
  it("requires view/edit permissions and canonical assignment, denying duplicate names", () => {
    const assigned = { assignedConsultantUserId: 7, assignedTo: actor.name };
    expect(
      hasScopedLeadAccess(
        actor,
        assigned,
        { canView: true, canEdit: true },
        [],
        true
      )
    ).toBe(true);
    expect(
      hasScopedLeadAccess(
        actor,
        assigned,
        { canView: true, canEdit: false },
        [],
        true
      )
    ).toBe(false);
    expect(
      hasScopedLeadAccess(
        actor,
        { ...assigned, assignedConsultantUserId: 8 },
        { canView: true, canEdit: true },
        [],
        true
      )
    ).toBe(false);
    const legacy = { ...assigned, assignedConsultantUserId: null };
    expect(
      hasScopedLeadAccess(actor, legacy, { canView: true, canEdit: true }, [
        { id: 7, name: actor.name },
      ])
    ).toBe(true);
    expect(
      hasScopedLeadAccess(actor, legacy, { canView: true, canEdit: true }, [
        { id: 7, name: actor.name },
        { id: 8, name: actor.name },
      ])
    ).toBe(false);
  });
  it("accepts only explicitly configured HTTPS browser origins", () => {
    expect(() =>
      assertCallMutationOrigin(
        "https://www.crm.example.test",
        config.browserOrigins
      )
    ).not.toThrow();
    for (const origin of [
      undefined,
      "http://unsafe.test",
      "https://attacker.test",
      "null",
    ])
      expect(() =>
        assertCallMutationOrigin(origin, config.browserOrigins)
      ).toThrow();
  });
});

describe("lead calls safe readiness and phone policy", () => {
  it("returns hasCallGrant for authorized setup-disabled agents independently of canCall", async () => {
    Object.entries(env).forEach(([key, value]) => vi.stubEnv(key, value));
    vi.stubEnv("ELEVAY_CALLING_ENABLED", "false");
    const db = fakeDb();
    dbMock.current = db;
    try {
      const caller = leadCallsRouter.createCaller({
        user: null,
        req: { headers: { cookie: `${COOKIE_NAME}=${await session()}` } },
        res: { setHeader: vi.fn() },
      } as any);
      const readiness = await caller.readiness({ leadId: 9 });
      expect(readiness.hasCallGrant).toBe(true);
      expect(readiness.canCall).toBe(false);
      expect(readiness.ready).toBe(false);
      db.data(leadCallAgentSettings)[0].canCall = false;
      expect((await caller.readiness({ leadId: 9 })).hasCallGrant).toBe(false);
    } finally {
      dbMock.current = null;
      vi.unstubAllEnvs();
    }
  });
  it("is default-disabled and never serializes secrets into readiness", () => {
    const unconfigured = getLeadCallsConfig({});
    const readiness = getLeadCallsReadiness(unconfigured, null);
    expect(readiness.ready).toBe(false);
    expect(readiness.enabled).toBe(false);
    expect(readiness.processingEnabled).toBe(false);
    expect(getLeadCallsReadiness(config, policy()).ready).toBe(true);
    expect(
      JSON.stringify(getLeadCallsReadiness(config, policy()))
    ).not.toContain("synthetic-auth-token");
    expect(
      JSON.stringify(getLeadCallsReadiness(config, policy()))
    ).not.toContain(config.accountSid);
  });
  it("requires legal/media/spending and durable recovery approvals", () => {
    for (const patch of [
      { enabled: false },
      { callingApproved: false },
      { mediaProtectionConfirmed: false },
      { recordingNoticeAr: null },
      { consentRequired: false },
      { scheduleEnabled: false },
    ])
      expect(
        getLeadCallsReadiness(config, { ...policy(), ...patch }).ready
      ).toBe(false);
    expect(
      callPolicyInput.parse({
        policyVersion: "v1",
        confirmed: true,
        recordingNoticeAr: "Arabic notice longer than 10",
        recordingNoticeEn: "English notice longer than 10",
      }).enabled
    ).toBe(false);
  });
  it("normalizes Egypt mobiles only and rejects invalid/extensions/foreign destinations", () => {
    expect(normalizeLeadCallPhone("01012345678")).toBe("+201012345678");
    expect(normalizeLeadCallPhone("00201012345678")).toBe("+201012345678");
    for (const value of [
      null,
      "",
      "+14155552671",
      "+20212345678",
      "01012345678 ext 5",
      "01012345678#1",
      "1234",
    ])
      expect(normalizeLeadCallPhone(value)).toBeNull();
  });
});

describe("lead calls durable reservations, intent and rate gates", () => {
  it("reserves exactly one linked activity and rejects duplicate active agent/lead", async () => {
    const db = fakeDb();
    const [a, b] = await Promise.allSettled([
      prepareLeadCall(db, actor, 9, config),
      prepareLeadCall(db, actor, 9, config),
    ]);
    expect([a, b].filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(db.data(leadCallRecords)).toHaveLength(1);
    expect(db.data(leadActivities)).toHaveLength(2);
    expect(db.data(leadCallRecords)[0].intentHash).not.toBe(
      (a as any).value.intentToken
    );
    expect(db.data(leadCallAgentSettings)[0].rateCount).toBe(1);
  });
  it("denies disabled grants and rate excess without creating a call activity", async () => {
    const db = fakeDb();
    db.data(leadCallAgentSettings)[0].canCall = false;
    await expect(prepareLeadCall(db, actor, 9, config)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(db.data(leadCallRecords)).toHaveLength(0);
    db.data(leadCallAgentSettings)[0].canCall = true;
    db.data(leadCallAgentSettings)[0].rateCount = 10;
    await expect(prepareLeadCall(db, actor, 9, config)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(
      nextAgentRate(
        { rateWindowStartedAt: 0, rateCount: 10, maxCallsPerHour: 10 },
        3_600_001
      ).rateCount
    ).toBe(1);
  });
  it("claims intent once, requires exact browser identity and uses only DB destination", async () => {
    const db = fakeDb([row()]);
    await expect(
      claimVoiceIntent(db, 1, token, "client:elevay_user_8", parentSid, config)
    ).rejects.toThrow();
    const claim = await claimVoiceIntent(
      db,
      1,
      token,
      "client:elevay_user_7",
      parentSid,
      config
    );
    expect(claim.row.parentCallSid).toBe(parentSid);
    await expect(
      claimVoiceIntent(db, 1, token, "client:elevay_user_7", otherSid, config)
    ).rejects.toThrow();
    expect(matchesCallIntent(row({ intentExpiresAt: now - 1 }), token)).toBe(
      false
    );
    expect(matchesCallIntent(row({ intentConsumedAt: now }), token)).toBe(
      false
    );
  });
  it("mints outgoing-only 120s access token and refreshes only bound own active call", async () => {
    const db = fakeDb([row()]);
    const result = await mintCallVoiceToken(db, actor, 1, token, config);
    const payload: any = decodeJwt(result.token);
    expect(payload.exp - payload.iat).toBe(120);
    expect(payload.grants.identity).toBe("elevay_user_7");
    expect(payload.grants.voice.incoming).toBeUndefined();
    await expect(refreshCallVoiceToken(db, actor, 1, config)).rejects.toThrow();
    Object.assign(db.data(leadCallRecords)[0], {
      parentCallSid: parentSid,
      intentConsumedAt: now,
      intentExpiresAt: now - 1000,
      status: "in-progress",
    });
    expect((await refreshCallVoiceToken(db, actor, 1, config)).identity).toBe(
      "elevay_user_7"
    );
    Object.assign(db.data(leadCallRecords)[0], { status: "completed" });
    await expect(refreshCallVoiceToken(db, actor, 1, config)).rejects.toThrow();
  });
});

describe("lead calls signature/leg correlation and monotonic status", () => {
  it("uses official validateRequest pinned URL, rejects forged/tampered/replayed wrong account", () => {
    const body = childBody({ SequenceNumber: "0", CallStatus: "ringing" });
    const request = signedWebhook("/api/twilio/status?callId=1", body);
    expect(validateCallWebhook(request as any, config).CallSid).toBe(childSid);
    const parentRequest = signedWebhook("/api/twilio/parent-status", {
      AccountSid: config.accountSid,
      CallSid: parentSid,
      SequenceNumber: "1",
      CallStatus: "completed",
    });
    expect(validateCallWebhook(parentRequest as any, config).CallSid).toBe(
      parentSid
    );
    expect(() =>
      validateCallWebhook(
        {
          ...parentRequest,
          originalUrl: "/api/twilio/parent-status?callId=1",
        } as any,
        config
      )
    ).toThrow();
    expect(() =>
      validateCallWebhook(
        { ...request, body: { ...body, CallStatus: "completed" } } as any,
        config
      )
    ).toThrow();
    expect(() =>
      validateCallWebhook(
        { ...request, originalUrl: "/api/twilio/status?callId=2" } as any,
        config
      )
    ).toThrow();
    expect(() =>
      validateCallWebhook(
        signedWebhook("/api/twilio/status?callId=1", {
          ...body,
          AccountSid: `AC${"f".repeat(32)}`,
        }) as any,
        config
      )
    ).toThrow();
    expect(() =>
      validateCallWebhook(
        {
          ...request,
          originalUrl: "https://attacker.test/api/twilio/status?callId=1",
        } as any,
        config
      )
    ).toThrow();
  });
  it("strictly correlates parent/customer legs and never lets completed regress", async () => {
    const db = fakeDb([
      row({
        parentCallSid: parentSid,
        intentConsumedAt: now,
        status: "connecting",
      }),
    ]);
    await expect(
      applyCallStatus(
        db,
        1,
        childBody({
          CallSid: otherSid,
          ParentCallSid: otherSid,
          SequenceNumber: "0",
          CallStatus: "ringing",
        })
      )
    ).rejects.toThrow();
    await applyCallStatus(
      db,
      1,
      childBody({ SequenceNumber: "0", CallStatus: "ringing" })
    );
    await applyCallStatus(
      db,
      1,
      childBody({
        SequenceNumber: "2",
        CallStatus: "completed",
        CallDuration: "19",
      })
    );
    await applyCallStatus(
      db,
      1,
      childBody({ SequenceNumber: "1", CallStatus: "in-progress" })
    );
    await applyCallStatus(
      db,
      1,
      childBody({ SequenceNumber: "3", CallStatus: "ringing" })
    );
    expect(db.data(leadCallRecords)[0].status).toBe("completed");
    expect(db.data(leadCallRecords)[0].durationSeconds).toBe(19);
    expect(db.data(leadCallRecords)[0].activeAgentId).toBeNull();
    expect(db.data(leadActivities)).toHaveLength(1);
    expect(shouldApplyCallStatus("completed", "ringing", 1, 20)).toBe(false);
  });
  it("does not treat browser parent in-progress as customer answer", async () => {
    const db = fakeDb([
      row({
        parentCallSid: parentSid,
        intentConsumedAt: now,
        status: "connecting",
      }),
    ]);
    await applyCallStatus(db, 1, {
      AccountSid: config.accountSid,
      CallSid: parentSid,
      SequenceNumber: "0",
      CallStatus: "in-progress",
    });
    expect(db.data(leadCallRecords)[0].answeredAt).toBeNull();
    expect(db.data(leadCallRecords)[0].status).toBe("connecting");
  });
});

describe("lead calls affirmative consent and recording queue idempotency", () => {
  it("customer-screening TwiML uses Gather before bridge, no early recording", () => {
    const dial = buildCallDialTwiML(row(), config),
      notice = buildCallConsentTwiML(1, policy(), config);
    expect(dial).toContain('answerOnBridge="true"');
    expect(dial).not.toMatch(/\brecord=/);
    expect(dial).toContain('timeLimit="1800"');
    expect(notice).toContain("<Gather");
    expect(notice).toContain('numDigits="1"');
    expect(notice).toContain("<Hangup");
  });
  it("never starts provider recording on rejected or wrong-leg consent", async () => {
    const provider = vi.fn();
    const db = fakeDb([
      row({
        parentCallSid: parentSid,
        childCallSid: childSid,
        intentConsumedAt: now,
        status: "ringing",
      }),
    ]);
    await expect(
      acceptCallConsent(
        db,
        1,
        childBody({ CallSid: otherSid, Digits: "1" }),
        config,
        provider
      )
    ).rejects.toThrow();
    expect(
      await acceptCallConsent(
        db,
        1,
        childBody({ Digits: "2" }),
        config,
        provider
      )
    ).toContain("<Hangup");
    expect(provider).not.toHaveBeenCalled();
    expect(db.data(leadCallRecords)[0].consentStatus).toBe("declined");
    expect(db.data(leadCallRecords)[0].transcriptionStatus).toBe(
      "not_requested"
    );
  });
  it("starts one dual parent recording only after accepted consent, duplicate callback cannot restart", async () => {
    const db = fakeDb([
      row({
        parentCallSid: parentSid,
        childCallSid: childSid,
        intentConsumedAt: now,
        status: "ringing",
      }),
    ]);
    const create = vi.fn(async () => ({
      accountSid: config.accountSid,
      callSid: parentSid,
      sid: recordingSid,
      channels: 2,
    }));
    const calls = vi.fn(() => ({ recordings: { create } }));
    const provider = vi.fn(() => ({ calls })) as any;
    await Promise.all([
      acceptCallConsent(db, 1, childBody({ Digits: "1" }), config, provider),
      acceptCallConsent(db, 1, childBody({ Digits: "1" }), config, provider),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(calls).toHaveBeenCalledWith(parentSid);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingChannels: "dual",
        recordingTrack: "both",
      })
    );
    expect(db.data(leadCallRecords)[0].recordingSid).toBe(recordingSid);
  });
  it("requires exact expected recording/parent/customer/channels and queues completed media once", async () => {
    const call = row({
      parentCallSid: parentSid,
      childCallSid: childSid,
      intentConsumedAt: now,
      recordingSid,
      recordingCallSid: parentSid,
      recordingStatus: "recording",
      recordingConsentAt: now,
      recordingStartClaimedAt: now,
      consentStatus: "accepted",
      status: "completed",
    });
    const db = fakeDb([call]);
    const body = {
      AccountSid: config.accountSid,
      CallSid: parentSid,
      RecordingSid: recordingSid,
      RecordingChannels: "2",
      RecordingStatus: "completed",
      RecordingDuration: "19",
    };
    expect(recordingWebhookMatches(call, body)).toBe(true);
    for (const patch of [
      { RecordingSid: `RE${"f".repeat(32)}` },
      { CallSid: childSid },
      { RecordingChannels: "1" },
    ])
      await expect(
        applyRecordingWebhook(db, 1, { ...body, ...patch }, config)
      ).rejects.toThrow();
    expect(await applyRecordingWebhook(db, 1, body, config)).toBe(true);
    expect(await applyRecordingWebhook(db, 1, body, config)).toBe(false);
    expect(db.data(leadCallRecords)[0].transcriptionStatus).toBe("queued");
    expect(db.data(leadActivities)).toHaveLength(1);
  });
  it("does not queue absent/zero-length recordings or processing not approved", async () => {
    const call = row({
      parentCallSid: parentSid,
      childCallSid: childSid,
      recordingSid,
      recordingCallSid: parentSid,
      recordingStatus: "recording",
      recordingConsentAt: now,
      recordingStartClaimedAt: now,
      consentStatus: "accepted",
    });
    const db = fakeDb([call]);
    const body = {
      AccountSid: config.accountSid,
      CallSid: parentSid,
      RecordingSid: recordingSid,
      RecordingChannels: "2",
      RecordingStatus: "completed",
      RecordingDuration: "0",
    };
    expect(await applyRecordingWebhook(db, 1, body, config)).toBe(false);
    expect(db.data(leadCallRecords)[0].transcriptionStatus).toBe(
      "not_requested"
    );
    const disabledDb = fakeDb([call]);
    disabledDb.data(leadCallPolicies)[0].processingApproved = false;
    expect(
      await applyRecordingWebhook(
        disabledDb,
        1,
        { ...body, RecordingDuration: "10" },
        config
      )
    ).toBe(false);
    expect(disabledDb.data(leadCallRecords)[0].transcriptionStatus).toBe(
      "disabled"
    );
  });
  it("binds an early exact signed StartCallRecordingAPI callback only to the pending single recording claim", async () => {
    const call = row({
      parentCallSid: parentSid,
      childCallSid: childSid,
      recordingStatus: "starting",
      recordingConsentAt: now,
      recordingStartClaimedAt: now,
      consentStatus: "accepted",
      status: "completed",
    });
    const db = fakeDb([call]);
    const body = {
      AccountSid: config.accountSid,
      CallSid: parentSid,
      RecordingSid: recordingSid,
      RecordingChannels: "2",
      RecordingStatus: "completed",
      RecordingDuration: "10",
      RecordingSource: "StartCallRecordingAPI",
    };
    expect(recordingWebhookMatches(call, body)).toBe(true);
    expect(
      recordingWebhookMatches({ ...call, recordingStartClaimedAt: null }, body)
    ).toBe(false);
    expect(recordingWebhookMatches(call, { ...body, CallSid: childSid })).toBe(
      false
    );
    expect(
      recordingWebhookMatches(call, { ...body, RecordingSource: "RecordVerb" })
    ).toBe(false);
    expect(await applyRecordingWebhook(db, 1, body, config)).toBe(true);
    expect(db.data(leadCallRecords)[0].recordingSid).toBe(recordingSid);
    expect(await applyRecordingWebhook(db, 1, body, config)).toBe(false);
  });
});

describe("lead calls recording DTO/playback privacy", () => {
  it("redacts transcript/summary/recording without listening grant and never leaks secret hashes or provider URLs", () => {
    const call = row({
      transcript: "Private synthetic transcript",
      aiSummaryJson: { mainReason: "private" },
      recordingSid,
      recordingStatus: "available",
      consentStatus: "accepted",
      processingLeaseToken: "private-lease",
      callOutcome: "private-outcome",
    });
    const redacted = toLeadCallDto(call, false);
    expect(redacted.transcript).toBeNull();
    expect(redacted.aiSummary).toBeNull();
    expect(redacted.callOutcome).toBeNull();
    expect(redacted.recordingPlaybackUrl).toBeNull();
    const dto = toLeadCallDto(call, true);
    expect(dto.recordingPlaybackUrl).toBe("/api/calls/1/recording");
    for (const value of [
      call.intentHash,
      "private-lease",
      "api.twilio.com",
      config.authToken,
      config.apiKeySecret,
    ])
      expect(JSON.stringify(dto)).not.toContain(value);
    expect(
      toLeadCallDto({ ...call, retentionExpiresAt: now - 1 }, true)
        .recordingAvailable
    ).toBe(false);
  });
  it("supports single byte ranges, rejects multi-ranges and constructs fixed provider URL only", () => {
    for (const range of [undefined, "bytes=0-99", "bytes=100-", "bytes=-200"])
      expect(validRecordingRange(range)).toBe(true);
    for (const range of [
      "bytes=0-1,3-4",
      "units=1-2",
      "bytes=hello",
      "bytes=-",
    ])
      expect(validRecordingRange(range)).toBe(false);
    expect(protectedRecordingUrl(config, recordingSid)).toContain(
      "https://api.twilio.com/"
    );
    expect(() =>
      protectedRecordingUrl(config, "https://attacker.test/audio")
    ).toThrow();
  });
  it("does not fetch recording audio for unauthenticated playback", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("synthetic provider disabled"));
    const res: any = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    await streamCallRecording(
      { headers: {}, cookies: {}, params: { id: "1" } } as any,
      res
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("denies authenticated playback with no canListen grant or wrong lead assignment before fetch", async () => {
    Object.entries(env).forEach(([key, value]) => vi.stubEnv(key, value));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("synthetic provider disabled"));
    try {
      for (const denial of ["grant", "lead"]) {
        const db = fakeDb([
          row({
            recordingSid,
            recordingStatus: "available",
            consentStatus: "accepted",
          }),
        ]);
        if (denial === "grant")
          db.data(leadCallAgentSettings)[0].canListen = false;
        else db.data(leads)[0].assignedConsultantUserId = 8;
        dbMock.current = db;
        const res: any = {
          headersSent: false,
          status: vi.fn().mockReturnThis(),
          json: vi.fn().mockReturnThis(),
          sendStatus: vi.fn(),
        };
        await streamCallRecording(
          {
            headers: { cookie: `${COOKIE_NAME}=${await session()}` },
            params: { id: "1" },
          } as any,
          res
        );
        expect(res.status).toHaveBeenCalledWith(403);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      dbMock.current = null;
      vi.unstubAllEnvs();
      fetchSpy.mockRestore();
    }
  });
});
