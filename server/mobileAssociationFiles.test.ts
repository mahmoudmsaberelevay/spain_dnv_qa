import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");

const PLAY_CERTIFICATE = "D7:1E:11:BB:98:F3:2A:6F:FB:AC:12:F2:A7:86:E8:C7:16:FE:E5:D6:F1:AC:99:E8:B1:9D:BD:B5:31:37:DE:E7";
const EAS_CERTIFICATE = "4D:48:21:19:C8:EE:FA:87:88:77:F0:E1:2B:EB:8E:0D:83:8D:4B:0C:40:2E:2C:3A:30:F1:4F:3B:C7:C0:CC:D8";

describe("mobile association files", () => {
  it("authorizes both production and EAS-signed ELEVAY Client Android builds", () => {
    const packageStart = source.indexOf('package_name: "com.elevay.client"');
    const fingerprintsStart = source.indexOf("sha256_cert_fingerprints", packageStart);
    const fingerprintsEnd = source.indexOf("]", fingerprintsStart);
    const clientFingerprints = source.slice(fingerprintsStart, fingerprintsEnd + 1);

    expect(packageStart).toBeGreaterThan(-1);
    expect(fingerprintsStart).toBeGreaterThan(packageStart);
    expect(clientFingerprints).toContain(PLAY_CERTIFICATE);
    expect(clientFingerprints).toContain(EAS_CERTIFICATE);
  });
});
