import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PlaudConnectionCrypto,
  PlaudError,
  plaudHash,
} from "./plaudConnectionCrypto";
import type {
  PlaudConnectionRow,
  PlaudConnectionStore,
  PlaudOauthStateRow,
} from "./plaudConnectionDb";
import {
  PLAUD_CALLBACK_URL,
  PlaudProvider,
  createPlaudFetch,
  plaudRecordingDto,
  plaudSourceScope,
  renderPlaudSegments,
  unwrapPlaudToolText,
  validatePlaudReturnPath,
} from "./plaudProvider";

const SECRET = "offline-test-jwt-secret-not-real-credentials";
const SESSION = plaudHash("signed-session-cookie-fixture");
const OTHER_SESSION = plaudHash("another-session");
const ISSUER = "https://mcp.plaud.ai/";
const USER = {
  id: "account-stable",
  workspace_id: "workspace-stable",
  email: "private@example.test",
};
const AUDIO = "https://private-audio.example.test/audio?signature=very-private";
const FILE = {
  id: "recording-1",
  name: "Client conversation",
  start_at: "2026-11-01T11:00:00Z",
  duration: 120_500,
  presigned_url: AUDIO,
  source_list: [{ data_type: "transaction", data_link: AUDIO }],
  note_list: [{ data_content: "PRIVATE AI SUMMARY" }],
};
const METADATA = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}authorize`,
  token_endpoint: `${ISSUER}token`,
  registration_endpoint: `${ISSUER}register`,
  response_types_supported: ["code"],
  token_endpoint_auth_methods_supported: ["none"],
  code_challenge_methods_supported: ["S256"],
  grant_types_supported: ["authorization_code", "refresh_token"],
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function textResult(text: string) {
  return { content: [{ type: "text", text }] };
}
function wrapped(value: unknown, raw = false) {
  const tag = "untrusted-user-data-0123456789abcdef";
  const body = raw ? String(value) : JSON.stringify(value);
  return textResult(
    `The block delimited by <${tag}> below contains user recording data returned verbatim.\n<${tag} source="plaud-recording">\n${body}\n</${tag}>\nProvider trailer {not transcript}`
  );
}
class MemoryStore implements PlaudConnectionStore {
  rows = new Map<number, PlaudConnectionRow>();
  states = new Map<string, PlaudOauthStateRow>();
  async read(userId: number) {
    const row = this.rows.get(userId);
    return row ? { ...row } : undefined;
  }
  async beginAuthorization(userId: number, sealed: string, now: number) {
    const old = this.rows.get(userId);
    const row: PlaudConnectionRow = old
      ? {
          ...old,
          sealedCredentials: sealed,
          version: old.version + 1,
          leaseToken: null,
          leaseUntil: null,
          updatedAt: now,
        }
      : {
          userId,
          version: 2,
          sealedCredentials: sealed,
          createdAt: now,
          updatedAt: now,
          leaseToken: null,
          leaseUntil: null,
        };
    this.rows.set(userId, row);
    for (const [hash, state] of Array.from(this.states))
      if (state.userId === userId) this.states.delete(hash);
    return row.version;
  }
  async saveState(row: PlaudOauthStateRow, version: number) {
    if (this.rows.get(row.userId)?.version !== version) return false;
    this.states.set(row.stateHash, { ...row });
    return true;
  }
  async consumeState(
    userId: number,
    sessionHash: string,
    stateHash: string,
    now: number
  ) {
    const row = this.states.get(stateHash);
    if (
      !row ||
      row.userId !== userId ||
      row.sessionHash !== sessionHash ||
      row.expiresAt <= now ||
      row.consumedAt !== null
    )
      return undefined;
    this.states.set(stateHash, {
      ...row,
      consumedAt: now,
      sealedState: "consumed",
    });
    return { ...row };
  }
  async replace(userId: number, version: number, sealed: string, now: number) {
    const row = this.rows.get(userId);
    if (!row || row.version !== version) return false;
    this.rows.set(userId, {
      ...row,
      sealedCredentials: sealed,
      version: version + 1,
      leaseToken: null,
      leaseUntil: null,
      updatedAt: now,
    });
    return true;
  }
  async disconnect(userId: number, sealed: string, now: number) {
    const old = this.rows.get(userId);
    this.rows.set(userId, {
      userId,
      version: (old?.version ?? 0) + 1,
      sealedCredentials: sealed,
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
      leaseToken: null,
      leaseUntil: null,
    });
    for (const [hash, state] of Array.from(this.states))
      if (state.userId === userId) this.states.delete(hash);
  }
  async acquireLease(
    userId: number,
    version: number,
    token: string,
    now: number,
    until: number
  ) {
    const row = this.rows.get(userId);
    if (
      !row ||
      row.version !== version ||
      (row.leaseUntil != null && row.leaseUntil > now)
    )
      return false;
    this.rows.set(userId, { ...row, leaseToken: token, leaseUntil: until });
    return true;
  }
  async saveLease(
    userId: number,
    version: number,
    token: string,
    sealed: string,
    now: number
  ) {
    const row = this.rows.get(userId);
    if (
      !row ||
      row.version !== version ||
      row.leaseToken !== token ||
      !row.leaseUntil ||
      row.leaseUntil <= now
    )
      return false;
    return this.replace(userId, version, sealed, now);
  }
  async releaseLease(userId: number, version: number, token: string) {
    const row = this.rows.get(userId);
    if (row && row.version === version && row.leaseToken === token)
      this.rows.set(userId, { ...row, leaseToken: null, leaseUntil: null });
  }
}
function fixture() {
  const store = new MemoryStore(),
    crypto = new PlaudConnectionCrypto(() => SECRET);
  let clock = Date.parse("2026-11-12T00:00:00Z");
  let tokenCount = 0;
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let toolOverride:
    | ((name: string, args: Record<string, unknown>) => unknown)
    | undefined;
  let tokenHook: (() => Promise<void>) | undefined;
  let useSse = false,
    omitRefresh = false;
  const rawFetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input)),
        method = init?.method ?? "GET";
      // This is a pure fake: the real global fetch is never called.
      if (url.href === `${ISSUER}.well-known/oauth-protected-resource`)
        return json({
          resource: `${ISSUER}mcp`,
          authorization_servers: [ISSUER],
          bearer_methods_supported: ["header"],
        });
      if (url.href === `${ISSUER}.well-known/oauth-authorization-server`)
        return json(METADATA);
      if (url.href === `${ISSUER}register`)
        return json(
          {
            ...JSON.parse(String(init?.body)),
            client_id: "registered-client-fixture",
            client_id_issued_at: 1,
          },
          201
        );
      if (url.href === `${ISSUER}token`) {
        await tokenHook?.();
        tokenCount++;
        return json({
          token_type: "Bearer",
          access_token: `ACCESS-PRIVATE-${tokenCount}`,
          ...(omitRefresh
            ? {}
            : { refresh_token: `REFRESH-PRIVATE-${tokenCount}` }),
          expires_in: 3600,
        });
      }
      if (url.href === `${ISSUER}mcp` && method === "GET")
        return new Response(null, { status: 405 });
      if (url.href === `${ISSUER}mcp` && method === "POST") {
        const message = JSON.parse(String(init?.body));
        const reply = (result: unknown) => {
          const payload = { jsonrpc: "2.0", id: message.id, result };
          if (!useSse) return json(payload);
          // Never closes itself: the client must consume the event before stream EOF.
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `event: message\ndata: ${JSON.stringify(payload)}\n\n`
                  )
                );
              },
            }),
            { headers: { "content-type": "text/event-stream" } }
          );
        };
        if (message.method === "initialize")
          return reply({
            protocolVersion: message.params.protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: "offline-plaud", version: "fixture" },
          });
        if (message.method === "notifications/initialized")
          return new Response(null, { status: 202 });
        if (message.method === "tools/list")
          return reply({
            tools: [
              {
                name: "get_current_user",
                inputSchema: { type: "object", properties: {} },
              },
              {
                name: "list_files",
                inputSchema: {
                  type: "object",
                  properties: {
                    page: { type: "integer", minimum: 1 },
                    page_size: { type: "integer", minimum: 10 },
                  },
                  additionalProperties: false,
                },
              },
              {
                name: "get_file",
                inputSchema: {
                  type: "object",
                  properties: { file_id: { type: "string" } },
                  required: ["file_id"],
                  additionalProperties: false,
                },
              },
              {
                name: "get_transcript",
                inputSchema: {
                  type: "object",
                  properties: {
                    file_id: { type: "string" },
                    block: { enum: ["transaction"] },
                    cursor: { type: "string" },
                    limit: { type: "integer", maximum: 500 },
                  },
                  required: ["file_id"],
                  additionalProperties: false,
                },
              },
            ],
          });
        if (message.method === "tools/call") {
          const { name, arguments: args } = message.params;
          calls.push({ name, args });
          const overridden = toolOverride?.(name, args);
          if (overridden !== undefined) return reply(overridden);
          if (name === "get_current_user")
            return reply(textResult(JSON.stringify(USER)));
          if (name === "list_files")
            return reply(wrapped({ data: [FILE], page: args.page }));
          if (name === "get_file") return reply(wrapped(FILE));
          if (name === "get_transcript")
            return reply(
              wrapped({
                file_id: FILE.id,
                block: "transaction",
                total: 2,
                offset: args.cursor ? 1 : 0,
                limit: 500,
                returned: 1,
                next_cursor: args.cursor ? null : "opaque-provider-cursor",
                segments: args.cursor
                  ? [
                      {
                        start_time: 61_000,
                        end_time: 62_000,
                        speaker: "Client",
                        content: "أهلاً  بالعالم",
                      },
                    ]
                  : [
                      {
                        start_time: 1_000,
                        end_time: 2_000,
                        speaker: "Adviser",
                        content: "Preserve  spacing\nand original words.",
                      },
                    ],
              })
            );
        }
      }
      throw new Error("OFFLINE_MOCK_UNEXPECTED_REQUEST");
    }
  ) as unknown as typeof fetch;
  const provider = new PlaudProvider({
    store,
    crypto,
    fetch: rawFetch,
    now: () => clock,
  });
  const start = async (userId = 7) => {
    const result = await provider.start(userId, SESSION, "/leads/42");
    return new URL(result.authorizationUrl).searchParams.get("state")!;
  };
  const connect = async (userId = 7) => {
    const state = await start(userId);
    await provider.finish(userId, SESSION, state, "code-fixture");
  };
  return {
    store,
    crypto,
    provider,
    rawFetch,
    calls,
    start,
    connect,
    now: () => clock,
    advance: (ms: number) => {
      clock += ms;
    },
    setTool: (fn: typeof toolOverride) => {
      toolOverride = fn;
    },
    setTokenHook: (fn: typeof tokenHook) => {
      tokenHook = fn;
    },
    setSse: () => {
      useSse = true;
    },
    omitRefresh: () => {
      omitRefresh = true;
    },
    tokenCount: () => tokenCount,
  };
}
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("OFFLINE_TEST_NETWORK_FORBIDDEN");
    })
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Plaud private credential encryption", () => {
  it("uses randomized authenticated encryption bound to user, purpose and state/session", () => {
    const crypto = new PlaudConnectionCrypto(() => SECRET),
      value = { access_token: "PRIVATE_ACCESS", verifier: "PRIVATE_PKCE" };
    const a = crypto.seal(7, "credentials", value),
      b = crypto.seal(7, "credentials", value);
    expect(a).not.toEqual(b);
    expect(a).not.toContain("PRIVATE");
    expect(crypto.open(7, "credentials", a)).toEqual(value);
    for (const open of [
      () => crypto.open(8, "credentials", a),
      () => crypto.open(7, "oauth-state", a),
      () => crypto.open(7, "credentials", `${a.slice(0, -3)}aaa`),
      () => crypto.open(7, "credentials", a, "wrong"),
    ])
      expect(open).toThrow("PLAUD_CREDENTIALS_UNAVAILABLE");
    const sealed = crypto.seal(7, "oauth-state", value, "session:state");
    expect(() => crypto.open(7, "oauth-state", sealed, "other:state")).toThrow(
      "PLAUD_CREDENTIALS_UNAVAILABLE"
    );
    expect(() =>
      new PlaudConnectionCrypto(() => undefined).seal(7, "credentials", value)
    ).toThrow("PLAUD_CONFIGURATION_UNAVAILABLE");
  });
});

describe("Plaud OAuth same-user/session binding and fencing", () => {
  it("does no registration/network work at construction or status/disconnect", async () => {
    const f = fixture();
    expect(await f.provider.status(7)).toEqual({
      connected: false,
      needsReconnect: false,
    });
    await f.provider.disconnect(7);
    expect(f.rawFetch).not.toHaveBeenCalled();
  });
  it("uses the official SDK PKCE S256 URL and seals PKCE/client state, storing only a state hash", async () => {
    const f = fixture(),
      state = await f.start();
    const pending = f.store.states.get(plaudHash(state))!;
    expect(pending.stateHash).toHaveLength(64);
    expect(JSON.stringify(pending)).not.toContain(state);
    expect(pending.sealedState).not.toContain("registered-client");
    const opened = f.crypto.open<any>(
      7,
      "oauth-state",
      pending.sealedState,
      `${SESSION}:${plaudHash(state)}`
    );
    expect(opened.verifier.length).toBeGreaterThanOrEqual(43);
    expect(opened.returnPath).toBe("/leads/42");
    const register = vi
      .mocked(f.rawFetch)
      .mock.calls.find(([url]) => String(url).endsWith("/register"))!;
    expect(JSON.parse(String(register[1]?.body))).toMatchObject({
      redirect_uris: [PLAUD_CALLBACK_URL],
      token_endpoint_auth_method: "none",
    });
    expect(JSON.parse(String(register[1]?.body))).not.toHaveProperty("scope");
  });
  it("rejects invalid return paths before any provider request", async () => {
    const f = fixture();
    for (const value of [
      "//evil.test",
      "/leads/0",
      "/leads/-1",
      "/leads/1?next=evil",
      "/leads/1/",
      "/profile#x",
      "/leads/9007199254740992",
      "/train-your-ai-agent",
    ])
      await expect(f.provider.start(7, SESSION, value)).rejects.toThrow(
        "PLAUD_INVALID_INPUT"
      );
    expect(validatePlaudReturnPath("/profile")).toBe("/profile");
    expect(f.rawFetch).not.toHaveBeenCalled();
  });
  it("rejects cross-user, cross-session, expiry and replay without exchanging a code", async () => {
    const f = fixture(),
      state = await f.start();
    await expect(f.provider.finish(8, SESSION, state, "code")).rejects.toThrow(
      "PLAUD_OAUTH_STATE_INVALID"
    );
    await expect(
      f.provider.finish(7, OTHER_SESSION, state, "code")
    ).rejects.toThrow("PLAUD_OAUTH_STATE_INVALID");
    expect(f.tokenCount()).toBe(0);
    expect(await f.provider.finish(7, SESSION, state, "code")).toEqual({
      returnPath: "/leads/42",
    });
    await expect(f.provider.finish(7, SESSION, state, "code")).rejects.toThrow(
      "PLAUD_OAUTH_STATE_INVALID"
    );
    const expiring = await f.start();
    f.advance(600_001);
    await expect(
      f.provider.finish(7, SESSION, expiring, "code")
    ).rejects.toThrow("PLAUD_OAUTH_STATE_INVALID");
    expect(f.tokenCount()).toBe(1);
  });
  it("consumes state before exchange and blocks concurrent callback reuse", async () => {
    const f = fixture(),
      state = await f.start();
    let unblock!: () => void;
    const gate = new Promise<void>(resolve => {
      unblock = resolve;
    });
    f.setTokenHook(async () => {
      await gate;
    });
    const finishing = f.provider.finish(7, SESSION, state, "code");
    await vi.waitFor(() =>
      expect(f.store.states.get(plaudHash(state))?.consumedAt).not.toBeNull()
    );
    await expect(f.provider.finish(7, SESSION, state, "code")).rejects.toThrow(
      "PLAUD_OAUTH_STATE_INVALID"
    );
    unblock();
    await finishing;
  });
  it("does not revive a disconnected account after an in-flight callback", async () => {
    const f = fixture(),
      state = await f.start();
    let entered!: () => void, unblock!: () => void;
    const enteredPromise = new Promise<void>(resolve => {
        entered = resolve;
      }),
      gate = new Promise<void>(resolve => {
        unblock = resolve;
      });
    f.setTokenHook(async () => {
      entered();
      await gate;
    });
    const finishing = f.provider.finish(7, SESSION, state, "code");
    await enteredPromise;
    await f.provider.disconnect(7);
    unblock();
    await expect(finishing).rejects.toThrow("PLAUD_CONNECTION_CHANGED");
    expect(await f.provider.status(7)).toEqual({
      connected: false,
      needsReconnect: false,
    });
  });
  it("invalidates a previous authorization when another connect is explicitly started", async () => {
    const f = fixture(),
      old = await f.start(),
      newest = await f.start();
    await expect(f.provider.finish(7, SESSION, old, "code")).rejects.toThrow(
      "PLAUD_OAUTH_STATE_INVALID"
    );
    await f.provider.finish(7, SESSION, newest, "code");
    expect(f.tokenCount()).toBe(1);
  });
  it("fails closed when account/workspace identity is unproven and state cannot replay", async () => {
    const f = fixture(),
      state = await f.start();
    f.setTool(name =>
      name === "get_current_user"
        ? textResult(
            JSON.stringify({
              id: "account-stable",
              email: "private@example.test",
            })
          )
        : undefined
    );
    await expect(f.provider.finish(7, SESSION, state, "code")).rejects.toThrow(
      "PLAUD_RESPONSE_UNSUPPORTED"
    );
    await expect(f.provider.finish(7, SESSION, state, "code")).rejects.toThrow(
      "PLAUD_OAUTH_STATE_INVALID"
    );
  });
});

describe("Plaud readonly SDK recording DTO and canonical transcript", () => {
  it("consumes official SDK SSE events before the stream closes", async () => {
    const f = fixture();
    f.setSse();
    await f.connect();
    expect((await f.provider.listRecordings(7, 1)).items[0].id).toBe(FILE.id);
    expect((await f.provider.readRecording(7, FILE.id)).transcript).toContain(
      "أهلاً  بالعالم"
    );
  });
  it("returns only selected metadata, reads every transaction page and preserves source words", async () => {
    const f = fixture();
    await f.connect();
    const listing = await f.provider.listRecordings(7, 1);
    expect(listing).toEqual({
      page: 1,
      hasMore: false,
      items: [
        {
          id: FILE.id,
          title: FILE.name,
          callAt: Date.parse(FILE.start_at),
          durationMs: FILE.duration,
        },
      ],
    });
    const fetched = await f.provider.readRecording(7, FILE.id);
    expect(fetched.transcript).toBe(
      "[00:01 - 00:02] Adviser: Preserve  spacing\nand original words.\n[01:01 - 01:02] Client: أهلاً  بالعالم"
    );
    expect(fetched.sourceScope).toEqual(plaudSourceScope(USER));
    expect(JSON.stringify([listing, fetched])).not.toMatch(
      /presigned_url|data_link|PRIVATE AI SUMMARY|private-audio|signature=/
    );
    const transcriptCalls = f.calls.filter(
      call => call.name === "get_transcript"
    );
    expect(transcriptCalls).toEqual([
      {
        name: "get_transcript",
        args: { file_id: FILE.id, block: "transaction", limit: 500 },
      },
      {
        name: "get_transcript",
        args: {
          file_id: FILE.id,
          block: "transaction",
          limit: 500,
          cursor: "opaque-provider-cursor",
        },
      },
    ]);
    expect(
      f.calls.every(call =>
        [
          "get_current_user",
          "list_files",
          "get_file",
          "get_transcript",
        ].includes(call.name)
      )
    ).toBe(true);
    expect(f.calls.some(call => call.name === "get_note")).toBe(false);
    expect(JSON.stringify(Array.from(f.store.rows.values()))).not.toMatch(
      /ACCESS-PRIVATE|REFRESH-PRIVATE|account-stable|workspace-stable/
    );
  });
  it("uses the same provider scope for the same account reused by different CRM employees", async () => {
    const f = fixture();
    await f.connect(7);
    await f.connect(8);
    const a = await f.provider.readRecording(7, FILE.id),
      b = await f.provider.readRecording(8, FILE.id);
    expect(a.sourceScope).toBe(b.sourceScope);
    expect(plaudSourceScope({ ...USER, workspace_id: "different" })).not.toBe(
      a.sourceScope
    );
    expect(plaudSourceScope({ ...USER, id: "different" })).not.toBe(
      a.sourceScope
    );
  });
  it("accepts only exact wrappers and never imports a missing-block status or raw provider error", async () => {
    const f = fixture();
    await f.connect();
    f.setTool(name =>
      name === "get_transcript"
        ? textResult('Block "transaction" not available for this recording.')
        : undefined
    );
    await expect(f.provider.readRecording(7, FILE.id)).rejects.toThrow(
      "PLAUD_RESPONSE_UNSUPPORTED"
    );
    f.setTool(name =>
      name === "get_transcript"
        ? {
            ...textResult(
              `Failed to get transcript: TOKEN private@example.test ${AUDIO}`
            ),
            isError: true,
          }
        : undefined
    );
    await expect(f.provider.readRecording(7, FILE.id)).rejects.toThrow(
      /^PLAUD_PROVIDER_UNAVAILABLE$/
    );
    expect(() =>
      unwrapPlaudToolText(
        textResult(
          '<untrusted-user-data-0123456789abcdef source="plaud-recording">\n{}\n</untrusted-user-data-fedcba9876543210>'
        ),
        true
      )
    ).toThrow("PLAUD_RESPONSE_UNSUPPORTED");
  });
  it("fails closed for inconsistent transcript totals, wrong file identity and repeated cursor", async () => {
    for (const variation of ["total", "id", "cursor"] as const) {
      const f = fixture();
      await f.connect();
      let n = 0;
      f.setTool(name => {
        if (name !== "get_transcript") return undefined;
        const offset = n++;
        return wrapped({
          file_id: variation === "id" ? "wrong-recording" : FILE.id,
          block: "transaction",
          total: variation === "total" ? (offset ? 3 : 2) : 3,
          offset,
          limit: 500,
          returned: 1,
          next_cursor: "same-cursor",
          segments: [{ content: "source words" }],
        });
      });
      await expect(f.provider.readRecording(7, FILE.id)).rejects.toThrow(
        "PLAUD_RESPONSE_UNSUPPORTED"
      );
    }
  });
  it("returns wrapped non-JSON transaction text verbatim apart from LF line endings", async () => {
    const f = fixture();
    await f.connect();
    f.setTool(name =>
      name === "get_transcript"
        ? wrapped("[00:01] Client: Original  words\r\nالعربية", true)
        : undefined
    );
    expect((await f.provider.readRecording(7, FILE.id)).transcript).toBe(
      "[00:01] Client: Original  words\nالعربية"
    );
  });
  it.each([
    "123",
    '"hello"',
    "true",
    "null",
    '{"spoken":"hello"}',
    '  { "spoken": "hello", "original": "أهلاً  بالعالم" }\n',
  ])(
    "preserves wrapped non-array JSON source text exactly: %s",
    async payload => {
      const f = fixture();
      await f.connect();
      f.setTool(name =>
        name === "get_transcript" ? wrapped(payload, true) : undefined
      );
      expect((await f.provider.readRecording(7, FILE.id)).transcript).toBe(
        payload
      );
      expect(
        f.calls.filter(call => call.name === "get_transcript")
      ).toHaveLength(1);
    }
  );
  it.each([
    { file_id: FILE.id },
    { block: "transaction" },
    { total: 1 },
    { offset: 0 },
    { limit: 500 },
    { returned: 1 },
    { next_cursor: null },
    { segments: "not-an-array" },
    { marks: [] },
    {
      file_id: FILE.id,
      block: "transaction",
      total: 1,
      offset: 0,
      limit: 500,
      returned: 1,
      next_cursor: null,
      segments: "not-an-array",
    },
  ])(
    "never falls back to raw text for partial/invalid pagination: %j",
    async payload => {
      const f = fixture();
      await f.connect();
      f.setTool(name =>
        name === "get_transcript" ? wrapped(payload) : undefined
      );
      await expect(f.provider.readRecording(7, FILE.id)).rejects.toThrow(
        /^PLAUD_RESPONSE_UNSUPPORTED$/
      );
    }
  );
  it.each(['"later raw text"', '{"spoken":"later"}', "later non-JSON text"])(
    "rejects raw source text after a recognized pagination page: %s",
    async payload => {
      const f = fixture();
      await f.connect();
      f.setTool((name, args) => {
        if (name !== "get_transcript") return undefined;
        return args.cursor
          ? wrapped(payload, true)
          : wrapped({
              file_id: FILE.id,
              block: "transaction",
              total: 2,
              offset: 0,
              limit: 500,
              returned: 1,
              next_cursor: "next-page",
              segments: [{ content: "first page" }],
            });
      });
      await expect(f.provider.readRecording(7, FILE.id)).rejects.toThrow(
        /^PLAUD_RESPONSE_UNSUPPORTED$/
      );
    }
  );
  it("rejects unsupported metadata/identity instead of guessing from title, date, email or text", () => {
    expect(() =>
      plaudSourceScope({
        email: "private@example.test",
        name: "Person",
        workspace_id: "workspace",
      })
    ).toThrow("PLAUD_RESPONSE_UNSUPPORTED");
    expect(() => plaudRecordingDto({ ...FILE, id: AUDIO })).toThrow(
      "PLAUD_RESPONSE_UNSUPPORTED"
    );
    expect(() => plaudRecordingDto({ ...FILE, name: AUDIO })).toThrow(
      "PLAUD_RESPONSE_UNSUPPORTED"
    );
    expect(() => renderPlaudSegments([{ text: "guessed" }])).toThrow(
      "PLAUD_RESPONSE_UNSUPPORTED"
    );
    expect(
      renderPlaudSegments([
        {
          start_time: 3_661_999,
          speaker: "Speaker",
          topic: "Original fallback",
        },
      ])
    ).toBe("[61:01] Speaker: Original fallback");
  });
  it("does not return a recording when disconnected during its provider read", async () => {
    const f = fixture();
    await f.connect();
    let entered!: () => void, unblock!: () => void;
    const gate = new Promise<void>(resolve => {
        unblock = resolve;
      }),
      started = new Promise<void>(resolve => {
        entered = resolve;
      });
    const provider = new PlaudProvider({
      store: f.store,
      crypto: f.crypto,
      fetch: f.rawFetch,
      now: f.now,
      sessionFactory: async () => ({
        call: async name => {
          if (name === "get_current_user")
            return textResult(JSON.stringify(USER));
          entered();
          await gate;
          return wrapped({ data: [FILE] });
        },
        close: async () => {},
      }),
    });
    const reading = provider.listRecordings(7, 1);
    await started;
    await provider.disconnect(7);
    unblock();
    await expect(reading).rejects.toThrow("PLAUD_CONNECTION_CHANGED");
  });
});

describe("Plaud refresh lease rotation and fences", () => {
  it("retains the original refresh token when a successful refresh response omits it", async () => {
    const f = fixture();
    await f.connect();
    f.omitRefresh();
    f.advance(3_590_000);
    await f.provider.listRecordings(7, 1);
    const credential = f.crypto.open<any>(
      7,
      "credentials",
      (await f.store.read(7))!.sealedCredentials
    );
    expect(credential.tokens.access_token).toBe("ACCESS-PRIVATE-2");
    expect(credential.tokens.refresh_token).toBe("REFRESH-PRIVATE-1");
  });
  it("refreshes with official SDK, saves rotated tokens and never stores plaintext", async () => {
    const f = fixture();
    await f.connect();
    f.advance(3_590_000);
    await f.provider.listRecordings(7, 1);
    expect(f.tokenCount()).toBe(2);
    const row = (await f.store.read(7))!,
      credential = f.crypto.open<any>(7, "credentials", row.sealedCredentials);
    expect(credential.tokens.refresh_token).toBe("REFRESH-PRIVATE-2");
    expect(row.leaseToken).toBeNull();
    expect(row.sealedCredentials).not.toContain("REFRESH-PRIVATE");
    const requests = vi
      .mocked(f.rawFetch)
      .mock.calls.filter(([url]) => String(url).endsWith("/token"));
    expect(
      new URLSearchParams(String(requests[1][1]?.body)).get("refresh_token")
    ).toBe("REFRESH-PRIVATE-1");
    f.advance(3_590_000);
    await f.provider.listRecordings(7, 1);
    const third = vi
      .mocked(f.rawFetch)
      .mock.calls.filter(([url]) => String(url).endsWith("/token"))[2];
    expect(
      new URLSearchParams(String(third[1]?.body)).get("refresh_token")
    ).toBe("REFRESH-PRIVATE-2");
  });
  it("permits only one concurrent refresh and a stale refresh cannot restore disconnect", async () => {
    const f = fixture();
    await f.connect();
    f.advance(3_590_000);
    let entered!: () => void, unblock!: () => void;
    const started = new Promise<void>(resolve => {
        entered = resolve;
      }),
      gate = new Promise<void>(resolve => {
        unblock = resolve;
      });
    f.setTokenHook(async () => {
      entered();
      await gate;
    });
    const reading = f.provider.listRecordings(7, 1);
    await started;
    await expect(f.provider.listRecordings(7, 1)).rejects.toThrow(
      "PLAUD_CONNECTION_BUSY"
    );
    await f.provider.disconnect(7);
    unblock();
    await expect(reading).rejects.toThrow("PLAUD_CONNECTION_CHANGED");
    expect(await f.provider.status(7)).toEqual({
      connected: false,
      needsReconnect: false,
    });
  });
  it("clears old tokens during reauthorization so a paused refresh cannot race a second read or the new callback", async () => {
    const f = fixture();
    await f.connect();
    f.advance(3_590_000);
    let entered!: () => void, unblock!: () => void;
    const started = new Promise<void>(resolve => {
        entered = resolve;
      }),
      gate = new Promise<void>(resolve => {
        unblock = resolve;
      });
    f.setTokenHook(async () => {
      entered();
      await gate;
    });
    const reading = f.provider.listRecordings(7, 1);
    const staleRefresh = expect(reading).rejects.toThrow(
      /^PLAUD_CONNECTION_CHANGED$/
    );
    await started;
    let successor: PlaudConnectionRow | undefined;
    try {
      const state = await f.start();
      const pending = (await f.store.read(7))!;
      expect(
        f.crypto.open(7, "credentials", pending.sealedCredentials)
      ).toEqual({
        v: 1,
        connected: false,
      });
      expect(pending.leaseToken).toBeNull();
      expect(pending.leaseUntil).toBeNull();
      await expect(f.provider.listRecordings(7, 1)).rejects.toThrow(
        /^PLAUD_NOT_CONNECTED$/
      );
      expect(await f.provider.status(7)).toEqual({
        connected: false,
        needsReconnect: false,
      });
      const refreshRequests = vi
        .mocked(f.rawFetch)
        .mock.calls.filter(
          ([url, init]) =>
            String(url).endsWith("/token") &&
            new URLSearchParams(String(init?.body)).get("grant_type") ===
              "refresh_token"
        );
      expect(refreshRequests).toHaveLength(1);
      expect(
        new URLSearchParams(String(refreshRequests[0][1]?.body)).get(
          "refresh_token"
        )
      ).toBe("REFRESH-PRIVATE-1");
      f.setTokenHook(undefined);
      await f.provider.finish(7, SESSION, state, "new-code-fixture");
      successor = await f.store.read(7);
    } finally {
      unblock();
    }
    await staleRefresh;
    expect(await f.store.read(7)).toEqual(successor);
    expect(await f.provider.status(7)).toEqual({
      connected: true,
      needsReconnect: false,
    });
    expect(f.tokenCount()).toBe(3);
  });
  it("marks an uncertain refresh as reconnect-required, sanitizing provider response/error", async () => {
    const f = fixture();
    await f.connect();
    f.advance(3_590_000);
    f.setTokenHook(async () => {
      throw new Error(`SECRET-TOKEN private@example.test ${AUDIO}`);
    });
    await expect(f.provider.listRecordings(7, 1)).rejects.toThrow(
      /^PLAUD_RECONNECT_REQUIRED$/
    );
    expect(await f.provider.status(7)).toEqual({
      connected: false,
      needsReconnect: true,
    });
  });
  it("prevents an expired lease holder from overwriting a successor's rotated token", async () => {
    const f = fixture();
    await f.connect();
    const original = (await f.store.read(7))!;
    expect(
      await f.store.acquireLease(7, original.version, "old", 1000, 2000)
    ).toBe(true);
    expect(
      await f.store.acquireLease(7, original.version, "new", 2001, 4000)
    ).toBe(true);
    expect(
      await f.store.saveLease(7, original.version, "old", "old-secret", 2500)
    ).toBe(false);
    expect(
      await f.store.saveLease(7, original.version, "new", "new-secret", 2500)
    ).toBe(true);
    expect(
      await f.store.saveLease(7, original.version, "old", "old-secret", 2600)
    ).toBe(false);
    expect((await f.store.read(7))?.sealedCredentials).toBe("new-secret");
  });
});

describe("Plaud origin-controlled network and sanitized errors", () => {
  it("bounds open SSE lifetime and cumulative bytes without waiting for EOF", async () => {
    vi.useFakeTimers();
    const fetchFn = createPlaudFetch(
      vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(target) {
                target.enqueue(new TextEncoder().encode("event: ping\n\n"));
              },
            }),
            { headers: { "content-type": "text/event-stream" } }
          )
      ) as unknown as typeof fetch
    );
    const response = await fetchFn(`${ISSUER}mcp`, { method: "POST" });
    const reader = response.body!.getReader();
    expect((await reader.read()).value).toEqual(
      new TextEncoder().encode("event: ping\n\n")
    );
    const stalled = expect(reader.read()).rejects.toThrow(
      /^PLAUD_PROVIDER_UNAVAILABLE$/
    );
    await vi.advanceTimersByTimeAsync(15_001);
    await stalled;
    const oversized = createPlaudFetch(
      vi.fn(
        async () =>
          new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
            headers: { "content-type": "text/event-stream" },
          })
      ) as unknown as typeof fetch
    );
    const tooLarge = await oversized(`${ISSUER}mcp`, { method: "POST" });
    await expect(tooLarge.text()).rejects.toThrow(
      /^PLAUD_RESPONSE_UNSUPPORTED$/
    );
  });
  it("rejects SSRF, guessed paths, URL credentials, query secrets and redirects without following", async () => {
    const raw = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/metadata" },
        })
    ) as unknown as typeof fetch;
    const fetchFn = createPlaudFetch(raw);
    for (const url of [
      "http://mcp.plaud.ai/mcp",
      "https://mcp.plaud.ai.evil.test/token",
      "https://mcp.plaud.ai@evil.test/token",
      "https://mcp.plaud.ai/get_file",
      "https://mcp.plaud.ai/token?token=secret",
      "https://mcp.plaud.ai/.well-known/openid-configuration",
      "http://127.0.0.1/",
    ])
      await expect(fetchFn(url)).rejects.toThrow("PLAUD_NETWORK_REJECTED");
    expect(raw).not.toHaveBeenCalled();
    await expect(fetchFn(`${ISSUER}token`, { method: "POST" })).rejects.toThrow(
      "PLAUD_NETWORK_REJECTED"
    );
    expect(raw).toHaveBeenCalledTimes(1);
    expect(vi.mocked(raw).mock.calls[0][1]).toMatchObject({
      redirect: "manual",
      credentials: "omit",
    });
  });
  it("bounds streamed/advertised response bodies and never emits raw exceptions", async () => {
    const tooLarge = createPlaudFetch(
      vi.fn(
        async () =>
          new Response("private", {
            headers: { "content-length": String(3 * 1024 * 1024) },
          })
      ) as unknown as typeof fetch
    );
    await expect(
      tooLarge(`${ISSUER}token`, { method: "POST" })
    ).rejects.toThrow("PLAUD_RESPONSE_UNSUPPORTED");
    const streamed = createPlaudFetch(
      vi.fn(
        async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1))
      ) as unknown as typeof fetch
    );
    await expect(
      streamed(`${ISSUER}token`, { method: "POST" })
    ).rejects.toThrow("PLAUD_RESPONSE_UNSUPPORTED");
    const crashing = createPlaudFetch(
      vi.fn(async () => {
        throw new Error(`raw token ${AUDIO}`);
      }) as unknown as typeof fetch
    );
    await expect(
      crashing(`${ISSUER}token`, { method: "POST" })
    ).rejects.toThrow(/^PLAUD_PROVIDER_UNAVAILABLE$/);
    const f = fixture();
    const provider = new PlaudProvider({
      store: {
        ...f.store,
        read: async () => {
          throw new Error(`DB ${AUDIO}`);
        },
      } as unknown as PlaudConnectionStore,
    });
    await expect(provider.status(7)).rejects.toThrow(
      /^PLAUD_PROVIDER_UNAVAILABLE$/
    );
  });
  it("bounds requests even when a mock or faulty fetch ignores AbortSignal", async () => {
    vi.useFakeTimers();
    const fetchFn = createPlaudFetch(
      vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch
    );
    const result = fetchFn(`${ISSUER}token`, { method: "POST" });
    const assertion = expect(result).rejects.toThrow(
      /^PLAUD_PROVIDER_UNAVAILABLE$/
    );
    await vi.advanceTimersByTimeAsync(15_001);
    await assertion;
  });
  it("does not expose raw errors in public fields/cause", () => {
    const error = new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
    expect(error.message).toBe("PLAUD_RESPONSE_UNSUPPORTED");
    expect(error.cause).toBeUndefined();
  });
});
