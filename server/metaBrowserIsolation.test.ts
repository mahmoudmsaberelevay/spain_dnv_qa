import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");

describe("Meta browser and legacy sender isolation", () => {
  it("does not load or fire Meta Pixel PageView in the internal CRM HTML shell", () => {
    const html = fs.readFileSync(path.join(projectRoot, "client/index.html"), "utf8");
    expect(html).not.toContain("connect.facebook.net");
    expect(html).not.toContain("fbq(");
    expect(html).not.toContain("PageView");
  });

  it("keeps the legacy CAPI sender disabled instead of bypassing the durable outbox", () => {
    const source = fs.readFileSync(path.join(projectRoot, "server/metaCapi.ts"), "utf8");
    expect(source).toContain("disabled: true");
    expect(source).not.toContain("graph.facebook.com");
    expect(source).not.toContain("await fetch(");
  });
});
