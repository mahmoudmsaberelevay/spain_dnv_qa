import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { CallSession, emptyCallSession, type SessionDependencies } from "../client/src/components/lead-calls/CallSession";
import { callStatusLabel, formatCallDuration, isTerminalCallStatus, mergeCallTimeline, needsCallPolling, normalizeDisplayPhone, protectedRecordingPath, safeCallError, transcriptSpeakerLabel } from "../client/src/components/lead-calls/callUi";
import { CallPanel } from "../client/src/components/lead-calls/CallPanel";
import { CallActivityCard } from "../client/src/components/lead-calls/CallActivityCard";
import type { LeadCallDto } from "../shared/leadCalls";

// The Node-only Vitest configuration uses classic JSX, without Vite's React plugin.
vi.stubGlobal("React", React);
const lead = { id: 99, fullName: "Synthetic Lead", phone: "+201000000001" };
const fixtureCall: LeadCallDto = {
  id: 10, leadId: 99, activityId: 25, agentId: 1, agentName: "Synthetic Agent", destination: "+201000000001", callerId: "+12025550101", direction: "outbound",
  status: "completed", durationSeconds: 272, startedAt: 1700000000000, answeredAt: 1700000001000, endedAt: 1700000273000, createdAt: 1700000000000, updatedAt: 1700000273000,
  transcript: null, transcriptSegments: [{ speaker: "agent", text: "أهلاً بحضرتك" }, { speaker: "customer", text: "I would like program details." }],
  aiSummary: { mainReason: "العميل طلب تفاصيل البرنامج", followUpActions: ["Send program information"] }, callOutcome: "Follow-up requested", suggestedNextAction: "Send information",
  transcriptionStatus: "completed", summaryStatus: "completed", recordingStatus: "available", consentStatus: "accepted", recordingAvailable: true, recordingPlaybackUrl: "https://provider.invalid/must-not-render",
  parentCallSid: "CA00000000000000000000000000000001", childCallSid: "CA00000000000000000000000000000002",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(overrides: Partial<SessionDependencies> = {}) {
  const track = { stop: vi.fn() };
  const remoteTrack = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  class FakeCall extends EventEmitter {
    disconnect = vi.fn(); mute = vi.fn(); status = () => "pending";
    getLocalStream = () => stream;
    getRemoteStream = () => ({ getTracks: () => [remoteTrack] });
    reject = vi.fn();
  }
  const call = new FakeCall();
  class FakeDevice extends EventEmitter {
    static audioContext = { resume: vi.fn().mockResolvedValue(undefined) };
    static instance: FakeDevice;
    connect = vi.fn().mockResolvedValue(call);
    destroy = vi.fn(); updateToken = vi.fn(); register = vi.fn(); unregister = vi.fn();
    constructor(_token: string, _options: unknown) { super(); FakeDevice.instance = this; }
  }
  const deps = {
    prepare: vi.fn().mockResolvedValue({ callId: 10, intentToken: "synthetic-proof", expiresAt: 90_000, identity: "test-agent", destination: lead.phone, agentName: "Synthetic Agent" }),
    token: vi.fn().mockResolvedValue({ token: "synthetic-token" }),
    refreshToken: vi.fn().mockResolvedValue({ token: "synthetic-refreshed-token" }),
    cancel: vi.fn().mockResolvedValue({ success: true }),
    getMicrophone: vi.fn().mockResolvedValue(stream),
    loadSdk: vi.fn().mockResolvedValue({ Device: FakeDevice }),
    changed: vi.fn(), activityChanged: vi.fn(), now: () => 1000,
    ...overrides,
  } as unknown as SessionDependencies;
  const session = new CallSession(deps);
  session.review(lead);
  return { session, deps, track, remoteTrack, call, FakeDevice };
}
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

 describe("lead calls frontend helpers", () => {
  it("normalizes Egyptian local, international, 00 and Arabic digit phones", () => {
    expect(normalizeDisplayPhone("01000000001")).toBe("+201000000001");
    expect(normalizeDisplayPhone("00201000000001")).toBe("+201000000001");
    expect(normalizeDisplayPhone("٠١٠٠٠٠٠٠٠٠١")).toBe("+201000000001");
    expect(normalizeDisplayPhone("+20 (100) 000-0001")).toBe("+201000000001");
  });
  it.each([null, "", "abc", "010", "Call +201000000001", "https://example.test/+201000000001", "+201000000001 ext 5"])("rejects invalid display phone %s", value => expect(normalizeDisplayPhone(value)).toBeNull());
  it("formats safe durations and supported provider status labels", () => {
    expect(formatCallDuration(272)).toBe("04:32");
    expect(formatCallDuration(3670)).toBe("1:01:10");
    expect(formatCallDuration(-2)).toBe("00:00");
    expect(formatCallDuration(NaN)).toBe("00:00");
    expect(callStatusLabel("in-progress")).toBe("In Progress");
    expect(callStatusLabel("no-answer")).toBe("No Answer");
    expect(isTerminalCallStatus("no-answer")).toBe(true);
  });
  it("never echoes raw SDK or server messages", () => {
    expect(safeCallError({ message: "token secret destination", code: 99999 })).not.toMatch(/token secret destination/);
    expect(safeCallError({ name: "NotAllowedError" })).toContain("Microphone access was blocked");
    expect(safeCallError({ data: { code: "FORBIDDEN" }, message: "secret" })).toContain("not authorized");
    expect(safeCallError({ code: 20104 })).toContain("expired");
  });
  it("builds only the authenticated same-origin recording path", () => {
    expect(protectedRecordingPath(10, true)).toBe("/api/calls/10/recording");
    expect(protectedRecordingPath(10, false)).toBeNull();
    expect(protectedRecordingPath(-1, true)).toBeNull();
    expect(protectedRecordingPath(NaN, true)).toBeNull();
  });
  it("preserves unverified channel separation without fabricating speaker roles", () => {
    expect(transcriptSpeakerLabel({ speaker: "unknown", channel: 0 })).toBe("Channel 1");
    expect(transcriptSpeakerLabel({ speaker: "unknown", channel: 1 })).toBe("Channel 2");
    expect(transcriptSpeakerLabel({ speaker: "unknown", channel: 3 })).toBe("Unknown speaker");
    expect(transcriptSpeakerLabel({ speaker: "agent", channel: 0 })).toBe("Agent");
    const card = readFileSync(new URL("../client/src/components/lead-calls/CallActivityCard.tsx", import.meta.url), "utf8");
    expect(card).toContain("Channel labels are not verified agent/customer roles.");
    expect(card).toContain("transcriptSpeakerLabel(segment)");
  });
  it("merges linked call activity once and maps an orphan call without duplicates", () => {
    const activities = [{ id: 25, createdAt: 100 }, { id: 26, createdAt: 120 }];
    const calls = [{ id: 10, activityId: 25, createdAt: 100 }, { id: 11, activityId: 27, createdAt: 150 }];
    const merged = mergeCallTimeline(activities, [...calls, calls[1]]);
    expect(merged).toHaveLength(3);
    expect(merged.filter(row => row.call?.id === 10)).toHaveLength(1);
    expect(merged[0].call?.id).toBe(11);
  });
  it("polls active or processing calls but not completed/disabled or declined records", () => {
    expect(needsCallPolling({ status: "ringing" })).toBe(true);
    expect(needsCallPolling({ status: "completed", transcriptionStatus: "processing" })).toBe(true);
    expect(needsCallPolling({ status: "completed", recordingStatus: "recording" })).toBe(true);
    expect(needsCallPolling({ status: "completed", transcriptionStatus: "disabled", summaryStatus: "disabled" })).toBe(false);
    expect(needsCallPolling({ status: "canceled", transcriptionStatus: "not_requested" })).toBe(false);
  });
});

describe("synthetic outbound-only Voice SDK lifecycle", () => {
  it("does nothing externally on review; only explicit initialize loads SDK", async () => {
    const { session, deps } = setup();
    expect(session.state.status).toBe("review");
    expect(deps.loadSdk).not.toHaveBeenCalled();
    expect(deps.prepare).not.toHaveBeenCalled();
  });
  it("fails microphone before prepare and never creates a phantom activity", async () => {
    const { session, deps } = setup({ getMicrophone: vi.fn().mockRejectedValue({ name: "NotAllowedError", message: "raw secret" }) });
    await session.initialize();
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.loadSdk).not.toHaveBeenCalled();
    expect(session.state.microphone).toBe("blocked");
    expect(session.state.callId).toBeNull();
    expect(session.locked).toBe(false);
    expect(session.state.message).not.toContain("raw secret");
  });
  it("guards concurrent initialization synchronously and releases probe tracks", async () => {
    const permission = deferred<MediaStream>();
    const { session, deps, track, FakeDevice } = setup({ getMicrophone: () => permission.promise });
    const pending = session.initialize();
    void session.initialize();
    permission.resolve({ getTracks: () => [track] } as unknown as MediaStream);
    await pending;
    expect(deps.prepare).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(FakeDevice.instance.register).not.toHaveBeenCalled();
    expect(FakeDevice.instance.connect).not.toHaveBeenCalled();
    expect(session.state.status).toBe("ready");
    expect(JSON.stringify(session.state)).not.toMatch(/synthetic-proof|synthetic-token|test-agent/);
  });
  it("connects exactly once with intent-only params and updates ringing/accepted/mute", async () => {
    const { session, call, FakeDevice } = setup();
    await session.initialize();
    session.start(); session.start();
    await flush();
    expect(FakeDevice.instance.connect).toHaveBeenCalledTimes(1);
    expect(FakeDevice.instance.connect).toHaveBeenCalledWith({ params: { CallId: "10", IntentToken: "synthetic-proof" } });
    expect(FakeDevice.audioContext.resume).toHaveBeenCalled();
    call.emit("ringing"); expect(session.state.status).toBe("ringing");
    call.emit("accept"); expect(session.state.status).toBe("in_progress");
    expect(session.state.answeredAt).toBe(1000);
    session.mute(); expect(call.mute).toHaveBeenCalledWith(true);
    call.emit("reconnecting", { message: "secret error" });
    expect(session.state.message).toContain("Trying to reconnect");
    call.emit("reconnected"); expect(session.state.message).toBe("Connection restored.");
  });
  it("refreshes active-call token with dedicated refreshToken and SDK updateToken", async () => {
    const { session, deps, FakeDevice } = setup();
    await session.initialize(); session.start(); await flush();
    FakeDevice.instance.emit("tokenWillExpire"); await flush();
    expect(deps.refreshToken).toHaveBeenCalledWith(10);
    expect(deps.token).toHaveBeenCalledTimes(1);
    expect(FakeDevice.instance.updateToken).toHaveBeenCalledWith("synthetic-refreshed-token");
  });
  it("ends, destroys Device, stops local/remote tracks and cancels on server", async () => {
    const { session, deps, track, remoteTrack, FakeDevice } = setup();
    await session.initialize(); session.start(); await flush();
    expect(session.close()).toBe(false);
    await session.end();
    expect(deps.cancel).toHaveBeenCalledWith(10);
    expect(FakeDevice.instance.destroy).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalledTimes(2);
    expect(remoteTrack.stop).toHaveBeenCalledTimes(1);
    expect(session.locked).toBe(false);
    expect(session.close()).toBe(true);
  });
  it("cleans up after completion and adopts authoritative busy/no-answer statuses", async () => {
    const { session, call, FakeDevice } = setup();
    await session.initialize(); session.start(); await flush();
    call.emit("disconnect");
    expect(session.state.status).toBe("completed");
    expect(FakeDevice.instance.destroy).toHaveBeenCalledTimes(1);
    session.applyServerStatus("no-answer", null, 5000);
    expect(session.state.status).toBe("no_answer");
    expect(session.state.endedAt).toBe(5000);
  });
  it("cannot resurrect local media when a pending connect resolves after server completion", async () => {
    const { session, call, FakeDevice, track } = setup();
    const pending = deferred<any>();
    await session.initialize();
    FakeDevice.instance.connect.mockReturnValue(pending.promise);
    session.start();
    session.applyServerStatus("busy");
    pending.resolve(call);
    await flush();
    expect(session.state.status).toBe("busy");
    expect(session.locked).toBe(false);
    expect(call.disconnect).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledTimes(2);
    expect(FakeDevice.instance.destroy).toHaveBeenCalledTimes(1);
  });
  it("cancels a late prepare response after agent already canceled", async () => {
    const prepared = deferred<any>();
    const { session, deps } = setup({ prepare: () => prepared.promise });
    const pending = session.initialize(); await flush();
    await session.end();
    prepared.resolve({ callId: 12, intentToken: "synthetic-proof", expiresAt: 90000, destination: lead.phone, identity: "test", agentName: "Test" });
    await pending;
    expect(deps.cancel).toHaveBeenCalledWith(12);
    expect(deps.token).not.toHaveBeenCalled();
    expect(session.locked).toBe(false);
  });
  it("destroys a prepared session on token failure without exposing raw messages", async () => {
    const { session, deps } = setup({ token: vi.fn().mockRejectedValue({ code: 20104, message: "provider secret" }) });
    await session.initialize();
    expect(deps.cancel).toHaveBeenCalledWith(10);
    expect(session.state.status).toBe("failed");
    expect(session.state.message).not.toContain("provider secret");
  });
  it("rejects an expired intent without connecting", async () => {
    const { session, FakeDevice } = setup({ now: () => 100_000 });
    await session.initialize(); session.start(); await flush();
    expect(FakeDevice.instance.connect).not.toHaveBeenCalled();
    expect(session.state.status).toBe("failed");
  });
});

describe("synthetic React UI and source integration", () => {
  it("renders persistent, responsive calling panel without start control before disclosure", () => {
    const html = renderToStaticMarkup(React.createElement(Router, { hook: () => ["/leads", () => undefined] }, React.createElement(CallPanel, { state: { ...emptyCallSession(), lead, destination: lead.phone }, locked: false, agentName: "Agent", initialize: vi.fn(), start: vi.fn(), end: vi.fn(), mute: vi.fn(), close: vi.fn() })));
    expect(html).toContain("Lead calling panel");
    expect(html).toContain("Synthetic Lead");
    expect(html).toContain("Check microphone &amp; prepare");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Start call");
    expect(html).toContain("sm:w-96");
  });
  it("renders authentic call metadata, Arabic summary, processing and consent states", () => {
    const html = renderToStaticMarkup(React.createElement(CallActivityCard, { call: fixtureCall }));
    expect(html).toContain("Outbound Call — Completed");
    expect(html).toContain("04:32");
    expect(html).toContain("العميل طلب تفاصيل البرنامج");
    expect(html).toContain('dir="auto"');
    expect(html).not.toContain("https://provider.invalid");
    const declined = renderToStaticMarkup(React.createElement(CallActivityCard, { call: { ...fixtureCall, consentStatus: "declined", aiSummary: null, transcriptSegments: null } }));
    expect(declined).toContain("Customer declined consent — no recording or transcription");
    expect(declined).not.toContain("processing failed");
  });
  it("keeps provider outside Router and list action outside lead links", () => {
    const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    const list = readFileSync(new URL("../client/src/pages/leads/LeadsList.tsx", import.meta.url), "utf8");
    const button = readFileSync(new URL("../client/src/components/lead-calls/CallNowButton.tsx", import.meta.url), "utf8");
    expect(app).toMatch(/<LeadCallProvider>\s*<Router\s*\/>\s*<\/LeadCallProvider>/);
    expect(list).toMatch(/<\/a>\s*<div[^>]*><CallNowButton/);
    expect(button).toContain("event.stopPropagation()");
  });
  it("uses React Query polling and protected media without refresh DOM events or token persistence", () => {
    const provider = readFileSync(new URL("../client/src/components/lead-calls/LeadCallProvider.tsx", import.meta.url), "utf8");
    const activity = readFileSync(new URL("../client/src/components/lead-calls/CallActivityCard.tsx", import.meta.url), "utf8");
    expect(provider).toContain("beforeunload");
    expect(provider).toContain("gcTime: 0");
    expect(provider).toContain("refreshToken.reset()");
    expect(provider).not.toMatch(/localStorage|dispatchEvent|new CustomEvent/);
    expect(activity).toContain('preload="none"');
    expect(activity).not.toContain("src={call.recordingPlaybackUrl}");
  });
  it("allows first-time recovery creation and invalidates readiness after enable or pause", () => {
    const settings = readFileSync(new URL("../client/src/components/lead-calls/CallsSettings.tsx", import.meta.url), "utf8");
    expect(settings).not.toContain("!recovery.data?.configured");
    expect(settings).toContain("recovery.isLoading");
    expect(settings).toContain("!policy.data?.processingApproved");
    expect(settings).toContain("!readiness.data?.processingEnabled");
    expect(settings).toMatch(/const enableRecovery[^\n]+utils\.calls\.readiness\.invalidate\(\)/);
    expect(settings).toMatch(/const pauseRecovery[^\n]+utils\.calls\.readiness\.invalidate\(\)/);
  });
});
