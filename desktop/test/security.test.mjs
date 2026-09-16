import { describe, expect, it } from "vitest";
import {
  APP_URL,
  canGrantPermission,
  classifyNavigation,
  isTrustedOrigin,
  sanitizeDownloadFilename,
} from "../src/security.mjs";

describe("ELEVAY desktop security contract", () => {
  it("loads the authoritative HTTPS production origin", () => {
    expect(APP_URL).toBe("https://elevay.vip/");
    expect(isTrustedOrigin(APP_URL)).toBe(true);
    expect(isTrustedOrigin("https://www.elevay.vip/finance/clients")).toBe(true);
    expect(isTrustedOrigin("http://elevay.vip/")).toBe(false);
    expect(isTrustedOrigin("https://elevay.vip.attacker.example/")).toBe(false);
  });

  it("keeps ELEVAY and its same-origin blobs in-app", () => {
    expect(classifyNavigation("https://elevay.vip/contracting/contracts")).toBe("internal");
    expect(classifyNavigation("https://www.elevay.vip/docs")).toBe("internal");
    expect(classifyNavigation("blob:https://elevay.vip/7ac2f00c-1")).toBe("trusted-blob");
    expect(classifyNavigation("about:blank")).toBe("local-popup");
  });

  it("routes safe external destinations out and blocks dangerous schemes", () => {
    expect(classifyNavigation("https://drive.google.com/file/d/example")).toBe("external");
    expect(classifyNavigation("mailto:info@elevay.com")).toBe("external");
    expect(classifyNavigation("tel:+201000000000")).toBe("external");
    expect(classifyNavigation("javascript:alert(1)")).toBe("blocked");
    expect(classifyNavigation("data:text/html,unsafe")).toBe("blocked");
    expect(classifyNavigation("file:///C:/Windows/System32/calc.exe")).toBe("blocked");
  });

  it("allows only required permissions from the live ELEVAY origin", () => {
    expect(canGrantPermission({ permission: "notifications", requestingUrl: APP_URL })).toBe(true);
    expect(canGrantPermission({ permission: "clipboard-sanitized-write", requestingUrl: APP_URL })).toBe(true);
    expect(canGrantPermission({ permission: "media", requestingUrl: APP_URL, mediaTypes: ["audio"] })).toBe(true);
    expect(canGrantPermission({ permission: "media", requestingUrl: APP_URL, mediaTypes: ["video"] })).toBe(false);
    expect(canGrantPermission({ permission: "geolocation", requestingUrl: APP_URL })).toBe(false);
    expect(canGrantPermission({ permission: "notifications", requestingUrl: "https://example.com" })).toBe(false);
  });

  it("prevents download names from escaping the selected destination", () => {
    expect(sanitizeDownloadFilename("../../client-report.csv")).toBe("client-report.csv");
    expect(sanitizeDownloadFilename("receipt:26089?.pdf")).toBe("receipt_26089_.pdf");
    expect(sanitizeDownloadFilename("   ")).toBe("elevay-download");
  });
});
