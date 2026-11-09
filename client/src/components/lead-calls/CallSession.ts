import type { Call, Device } from "@twilio/voice-sdk";
import { isTerminalCallStatus, safeCallError, type CallUiStatus } from "./callUi";

export type CallLead = { id: number; fullName: string; phone: string | null };
export type PreparedCall = { callId: number; intentToken: string; expiresAt: number; identity: string; destination: string; agentName: string };
export type CallSessionState = {
  lead: CallLead | null; callId: number | null; agentName: string; destination: string;
  status: CallUiStatus; microphone: "unchecked" | "requesting" | "allowed" | "blocked";
  muted: boolean; answeredAt: number | null; endedAt: number | null; message: string | null;
};
export const emptyCallSession = (): CallSessionState => ({ lead: null, callId: null, agentName: "", destination: "", status: "review", microphone: "unchecked", muted: false, answeredAt: null, endedAt: null, message: null });
export type SessionDependencies = {
  prepare: (leadId: number) => Promise<PreparedCall>;
  token: (callId: number, intentToken: string) => Promise<{ token: string }>;
  refreshToken: (callId: number) => Promise<{ token: string }>;
  cancel: (callId: number) => Promise<unknown>;
  getMicrophone: () => Promise<MediaStream>;
  loadSdk: () => Promise<{ Device: typeof Device }>;
  changed: (state: CallSessionState) => void;
  activityChanged: (leadId: number) => void;
  now?: () => number;
};

/** One owner for media, tokens, events, and the synchronous duplicate-call guard. */
export class CallSession {
  state = emptyCallSession();
  private device: Device | null = null;
  private call: Call | null = null;
  private intent: PreparedCall | null = null;
  private busy = false;
  private generation = 0;
  private refreshBusy = false;
  private resumeAudio: (() => Promise<void> | undefined) | null = null;
  constructor(private readonly deps: SessionDependencies) {}
  get locked() { return this.busy; }
  private now() { return this.deps.now?.() ?? Date.now(); }
  private update(patch: Partial<CallSessionState>) {
    this.state = { ...this.state, ...patch };
    this.deps.changed(this.state);
  }
  review(lead: CallLead) {
    if (this.busy) return false;
    this.cleanup();
    this.generation++;
    this.state = { ...emptyCallSession(), lead, destination: lead.phone ?? "" };
    this.deps.changed(this.state);
    return true;
  }
  async initialize() {
    if (this.busy || !this.state.lead) return;
    this.busy = true; // synchronous: double clicks cannot enqueue a second prepare
    const generation = ++this.generation;
    const lead = this.state.lead;
    this.update({ status: "initializing", microphone: "requesting", message: null });
    try {
      // Permission failure creates NO call intent/activity. Probe tracks are always released.
      const stream = await this.deps.getMicrophone();
      stream.getTracks().forEach(track => track.stop());
      if (generation !== this.generation) return;
      this.update({ microphone: "allowed" });
      const sdk = await this.deps.loadSdk();
      if (generation !== this.generation) return;
      const intent = await this.deps.prepare(lead.id);
      if (generation !== this.generation) {
        await this.deps.cancel(intent.callId).catch(() => undefined);
        this.deps.activityChanged(lead.id);
        return;
      }
      this.intent = intent;
      this.update({ callId: intent.callId, destination: intent.destination, agentName: intent.agentName });
      this.deps.activityChanged(lead.id);
      const access = await this.deps.token(intent.callId, intent.intentToken);
      if (generation !== this.generation) return;
      this.device = new sdk.Device(access.token, { closeProtection: false, tokenRefreshMs: 60_000, logLevel: "silent" });
      this.resumeAudio = () => sdk.Device.audioContext?.resume();
      // Outbound-only: never register the device for inbound calls.
      this.device.on("incoming", (incoming: Call) => incoming.reject());
      this.device.on("tokenWillExpire", () => void this.refreshToken(generation));
      this.device.on("error", (error: unknown) => {
        if (generation !== this.generation) return;
        if (this.call) this.update({ message: safeCallError(error) });
        else void this.fail(error);
      });
      this.update({ status: "ready", message: "Microphone is ready. Starting the call will use the approved paid calling service." });
    } catch (error) {
      if (generation !== this.generation) return;
      if (this.state.microphone === "requesting") this.update({ microphone: "blocked" });
      await this.fail(error);
    }
  }
  /** Called directly by the final Start button; no RPC await before the user gesture. */
  start() {
    const device = this.device;
    const intent = this.intent;
    if (!device || !intent || this.state.status !== "ready") return;
    if (intent.expiresAt <= this.now()) {
      void this.fail({ code: 20104 });
      return;
    }
    const generation = this.generation;
    this.update({ status: "connecting", message: "The customer will hear a recording notice and must accept before recording can begin." });
    void this.resumeAudio?.()?.catch(() => undefined);
    // Intent only: never send a frontend destination, caller ID, or agent identity.
    void device.connect({ params: { CallId: String(intent.callId), IntentToken: intent.intentToken } }).then(call => {
      if (generation !== this.generation) {
        call.disconnect();
        call.getLocalStream()?.getTracks().forEach(track => track.stop());
        return;
      }
      this.call = call;
      call.on("ringing", () => this.update({ status: "ringing", message: "Waiting for the customer to answer and acknowledge the recording notice." }));
      call.on("accept", () => this.update({ status: "in_progress", answeredAt: this.now(), message: "Connected. Recording follows the customer's consent and server policy." }));
      call.on("disconnect", () => this.finish("completed"));
      call.on("cancel", () => this.finish("canceled"));
      call.on("reject", () => this.finish("canceled"));
      call.on("error", (error: unknown) => void this.fail(error));
      call.on("reconnecting", () => this.update({ message: "Connection interrupted. Trying to reconnect; do not start another call." }));
      call.on("reconnected", () => this.update({ message: "Connection restored." }));
      // A very fast answer may occur before listeners were attached.
      if (call.status() === "open") this.update({ status: "in_progress", answeredAt: this.now() });
    }).catch(error => { if (generation === this.generation) void this.fail(error); });
  }
  mute() {
    if (!this.call || this.state.status !== "in_progress") return;
    const muted = !this.state.muted;
    this.call.mute(muted);
    this.update({ muted });
  }
  async end() {
    if (!this.busy) return;
    const id = this.intent?.callId;
    const leadId = this.state.lead?.id;
    this.generation++;
    this.finish("canceled");
    if (id) {
      try { await this.deps.cancel(id); }
      catch { this.update({ message: "Your microphone has stopped, but server cancellation could not be confirmed. Check the call timeline or contact your administrator." }); }
      if (leadId) this.deps.activityChanged(leadId);
    }
  }
  applyServerStatus(status: string, answeredAt?: number | null, endedAt?: number | null) {
    const normalized = status.replaceAll("-", "_");
    if (isTerminalCallStatus(normalized)) {
      // The webhook is authoritative for Busy / No Answer / final durations.
      if (this.busy) this.finish(normalized as CallUiStatus);
      else this.update({ status: normalized as CallUiStatus });
      if (answeredAt) this.update({ answeredAt });
      if (endedAt) this.update({ endedAt });
    } else if (normalized === "in_progress" && this.busy) {
      this.update({ status: "in_progress", answeredAt: answeredAt ?? this.state.answeredAt ?? this.now() });
    }
  }
  private async refreshToken(generation: number) {
    const intent = this.intent;
    const device = this.device;
    if (!intent || !device || this.refreshBusy) return;
    this.refreshBusy = true;
    try {
      // Official SDK lifecycle: refresh short-lived tokens with updateToken while active.
      const access = await this.deps.refreshToken(intent.callId);
      if (generation === this.generation && this.device === device) device.updateToken(access.token);
    } catch {
      if (generation === this.generation) this.update({ message: "Session renewal failed. The current call may continue, but end it if the connection is lost." });
    } finally { this.refreshBusy = false; }
  }
  private async fail(error: unknown) {
    const id = this.intent?.callId;
    const leadId = this.state.lead?.id;
    this.generation++;
    this.finish("failed", safeCallError(error));
    if (id) await this.deps.cancel(id).catch(() => undefined);
    if (leadId) this.deps.activityChanged(leadId);
  }
  private finish(status: CallUiStatus, message?: string) {
    this.generation++; // pending connect/token promises cannot resurrect a completed session
    this.busy = false;
    this.update({ status, endedAt: this.now(), muted: false, message: message ?? "Call ended. The activity timeline will update automatically." });
    this.cleanup();
    if (this.state.lead) this.deps.activityChanged(this.state.lead.id);
  }
  private cleanup() {
    const call = this.call;
    const device = this.device;
    this.call = null;
    this.device = null;
    this.intent = null; // runtime-only call intent/token; never localStorage or query data
    this.resumeAudio = null;
    if (call) {
      call.removeAllListeners();
      call.getLocalStream()?.getTracks().forEach(track => track.stop());
      call.getRemoteStream()?.getTracks().forEach(track => track.stop());
      call.disconnect();
    }
    if (device) {
      device.removeAllListeners();
      // destroy unregisters signaling and releases SDK audio resources; no inbound registration.
      device.destroy();
    }
  }
  close() {
    if (this.busy) return false;
    this.generation++;
    this.cleanup();
    this.state = emptyCallSession();
    this.deps.changed(this.state);
    return true;
  }
  dispose() {
    const callId = this.intent?.callId;
    this.generation++;
    this.busy = false;
    this.cleanup();
    if (callId) void this.deps.cancel(callId).catch(() => undefined);
  }
}
