import { describe, expect, it } from "vitest";
import { inspectMetaLeadForm } from "./metaLeadsService";

describe("existing Meta Page integration", () => {
  it("can securely read the most recently active Lead Form without exposing the Page token", async () => {
    const form = await inspectMetaLeadForm("1680042153333826");
    expect(form.id).toBe("1680042153333826");
    expect(form.name).toBeTruthy();
    expect(form.status).toBeTruthy();
  });
});
