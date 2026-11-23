import { describe, it, expect } from "vitest";
import { commandCenterMode, commandCenterOn } from "./mode";
describe("Command Center disable switch (23 Nov 2026)", () => {
  it("defaults to publish_only (disabled except already-approved posts)", () => {
    const old = process.env.ELEVAY_COMMAND_CENTER_MODE;
    delete process.env.ELEVAY_COMMAND_CENTER_MODE;
    expect(commandCenterMode()).toBe("publish_only");
    expect(commandCenterOn()).toBe(false);
    process.env.ELEVAY_COMMAND_CENTER_MODE = "off"; expect(commandCenterMode()).toBe("off");
    process.env.ELEVAY_COMMAND_CENTER_MODE = "ON"; expect(commandCenterOn()).toBe(true);
    process.env.ELEVAY_COMMAND_CENTER_MODE = "nonsense"; expect(commandCenterMode()).toBe("publish_only");
    if (old === undefined) delete process.env.ELEVAY_COMMAND_CENTER_MODE; else process.env.ELEVAY_COMMAND_CENTER_MODE = old;
  });
});
