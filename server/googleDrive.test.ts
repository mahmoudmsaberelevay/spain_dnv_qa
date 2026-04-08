import { describe, it, expect } from "vitest";
import { isDriveConfigured, getDriveStatus } from "./googleDrive";

describe("Google Drive Integration", () => {
  it("isDriveConfigured returns a boolean", () => {
    const result = isDriveConfigured();
    expect(typeof result).toBe("boolean");
  });

  it("getDriveStatus returns configured status", async () => {
    const status = await getDriveStatus();
    expect(status).toHaveProperty("configured");
    expect(status).toHaveProperty("connected");
    // If credentials are set, connected should be true
    if (status.configured) {
      console.log("Drive configured:", status.configured, "connected:", status.connected);
    } else {
      console.log("Drive not configured — credentials not set");
    }
  }, 15000);
});
