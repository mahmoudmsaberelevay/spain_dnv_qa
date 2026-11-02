import { describe, expect, it } from "vitest";
import {
  DEFAULT_HR_VERIFICATION,
  hrDistanceMeters,
  verifyHrPunchLocation,
} from "../shared/hrVerification";
import { isHrAdministrator } from "../shared/hrAccess";
const now = Date.parse("2026-11-02T20:00:00Z");
const settings = { ...DEFAULT_HR_VERIFICATION, verificationMethod: "geofence" };
const location = {
  latitude: settings.officeLatitude,
  longitude: settings.officeLongitude,
  accuracy: 12,
  capturedAt: now,
};
describe("HR verification and restricted administrators", () => {
  it("allows exactly the verified three people, never any generic administrator", () => {
    for (const id of [1, 120001, 191, 933743])
      expect(isHrAdministrator({ id })).toBe(true);
    for (const id of [2, 200, 999])
      expect(isHrAdministrator({ id })).toBe(false);
    expect(isHrAdministrator(null)).toBe(false);
  });
  it("accepts a fresh accurate office fix and computes distances", () => {
    expect(
      hrDistanceMeters(
        location.latitude,
        location.longitude,
        location.latitude,
        location.longitude
      )
    ).toBe(0);
    expect(verifyHrPunchLocation(settings, location, now).accepted).toBe(true);
    expect(hrDistanceMeters(0, 0, 0, 1)).toBeGreaterThan(111000);
  });
  it("rejects missing, stale, future, inaccurate, invalid and outside fixes", () => {
    for (const v of [
      undefined,
      { ...location, capturedAt: now - 61000 },
      { ...location, capturedAt: now + 6000 },
      { ...location, accuracy: 101 },
      { ...location, latitude: 91 },
      { ...location, accuracy: -1 },
      { ...location, latitude: NaN },
      { ...location, latitude: location.latitude + 0.01 },
    ])
      expect(verifyHrPunchLocation(settings, v, now).accepted).toBe(false);
  });
  it("fails closed for pending, strict Wi-Fi, both, and unknown verification modes", () => {
    for (const verificationMethod of [
      "pending",
      "strict_wifi",
      "both",
      "unknown",
    ])
      expect(
        verifyHrPunchLocation(
          { ...settings, verificationMethod },
          location,
          now
        ).accepted
      ).toBe(false);
  });
});
