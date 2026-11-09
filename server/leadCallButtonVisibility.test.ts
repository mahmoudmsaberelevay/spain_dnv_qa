import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadCallsReadiness } from "../shared/leadCalls";

const calling = vi.hoisted(() => ({
  readiness: undefined as LeadCallsReadiness | undefined,
  readinessLoading: false,
  readinessError: null as string | null,
  locked: false,
  open: vi.fn(),
}));
vi.mock("../client/src/components/lead-calls/LeadCallProvider", () => ({ useLeadCalling: () => calling }));
import { CallNowButton } from "../client/src/components/lead-calls/CallNowButton";
import { DeviceCallButton } from "../client/src/components/lead-calls/DeviceCallButton";

const lead = { id: 9000001, fullName: "Synthetic Lead", phone: "+201000000000" };
const ready: LeadCallsReadiness = {
  enabled: true, processingEnabled: false, ready: true, hasCallGrant: true,
  canCall: true, canManage: false, reasons: [], validPhone: true, approvedCallerIds: [],
};
const markup = () => renderToStaticMarkup(React.createElement(CallNowButton, { lead }));

beforeEach(() => {
  calling.readiness = undefined;
  calling.readinessLoading = false;
  calling.readinessError = null;
  calling.locked = false;
  calling.open.mockClear();
});

describe("restored device Call action", () => {
  it("renders a tel link without needing Twilio readiness or agent grants", () => {
    const html = renderToStaticMarkup(React.createElement(DeviceCallButton, { phone: "+20 10 0000 0000" }));
    expect(html).toContain('href="tel:+201000000000"');
    expect(html).toContain("Call with your device");
    expect(html).toContain("not recorded by the CRM");
    expect(html).not.toContain('disabled=""');
    expect(calling.open).not.toHaveBeenCalled();
  });
  it.each([null, "", "not a phone", "javascript:alert(1)", "https://example.test/+201000000000"])("does not offer device dialing for invalid value %s", phone => {
    expect(renderToStaticMarkup(React.createElement(DeviceCallButton, { phone }))).toBe("");
  });
  it("normalizes Arabic digits into a safe phone-only href", () => {
    const html = renderToStaticMarkup(React.createElement(DeviceCallButton, { phone: "٠١٠٠٠٠٠٠٠٠٠" }));
    expect(html).toContain('href="tel:+201000000000"');
  });
  it("restores the direct Call button on the actual Lead profile without mutating records", () => {
    const profile = readFileSync(new URL("../client/src/pages/leads/LeadProfile.tsx", import.meta.url), "utf8");
    const device = readFileSync(new URL("../client/src/components/lead-calls/DeviceCallButton.tsx", import.meta.url), "utf8");
    expect(profile).toContain("<DeviceCallButton phone={lead.phone} />");
    expect(profile).toContain("<CallNowButton lead={lead} />");
    expect(profile).toContain("WhatsApp");
    expect(device).not.toMatch(/useMutation|onClick|prepare\(|fetch\(|axios|createActivity/);
  });
});

describe("discoverable but fail-closed CRM Call Now", () => {
  it("remains visible and disabled when readiness has not loaded", () => {
    calling.readinessLoading = true;
    const html = markup();
    expect(html).toContain("Call Now");
    expect(html).toContain("Checking calling…");
    expect(html).toContain('disabled=""');
    expect(calling.open).not.toHaveBeenCalled();
  });
  it("shows a sanitized readiness error instead of disappearing", () => {
    calling.readinessError = "Your login expired. Sign in again before calling.";
    const html = markup();
    expect(html).toContain("Call Now");
    expect(html).toContain("Calling unavailable");
    expect(html).toContain("Sign in again before calling");
    expect(html).toContain('disabled=""');
  });
  it("cannot enable a stale successful result when the latest check errored", () => {
    calling.readiness = ready;
    calling.readinessError = "Calling is unavailable.";
    expect(markup()).toContain('disabled=""');
  });
  it("shows access-required status without inferring a calling grant", () => {
    calling.readiness = { ...ready, canCall: false, hasCallGrant: false, canManage: false };
    const html = markup();
    expect(html).toContain("Calling access required");
    expect(html).toContain('disabled=""');
  });
  it.each([
    { ...ready, ready: false, canCall: false },
    { ...ready, hasCallGrant: false, canManage: true, canCall: false },
  ])("keeps the action disabled for authorized-but-unconfigured states", readiness => {
    calling.readiness = readiness;
    const html = markup();
    expect(html).toContain("Setup required");
    expect(html).toContain('disabled=""');
  });
  it("enables the CRM action only for a successful ready/canCall result", () => {
    calling.readiness = ready;
    const html = markup();
    expect(html).toContain("Call Now");
    expect(html).not.toContain('disabled=""');
    expect(calling.open).not.toHaveBeenCalled();
  });
  it("disables another CRM action while a session is active", () => {
    calling.readiness = ready;
    calling.locked = true;
    expect(markup()).toContain("Call already active");
    expect(markup()).toContain('disabled=""');
  });
  it("keeps invalid lead phones disabled even with calling authority", () => {
    calling.readiness = ready;
    const html = renderToStaticMarkup(React.createElement(CallNowButton, { lead: { ...lead, phone: "bad" } }));
    expect(html).toContain("Valid phone required");
    expect(html).toContain('disabled=""');
  });
  it("preserves provider and click guards without loosening server permissions", () => {
    const provider = readFileSync(new URL("../client/src/components/lead-calls/LeadCallProvider.tsx", import.meta.url), "utf8");
    const button = readFileSync(new URL("../client/src/components/lead-calls/CallNowButton.tsx", import.meta.url), "utf8");
    expect(provider).toContain("readiness.isError || readiness.isLoading || !readiness.data?.canCall");
    expect(provider).toContain("if (!readiness.data.ready)");
    expect(button).toContain("event.stopPropagation()");
    expect(button).toContain("if (!disabled) open(lead)");
    expect(provider).not.toMatch(/localStorage|sessionStorage/);
  });
});
