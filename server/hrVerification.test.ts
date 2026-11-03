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
const northFix = (metres: number) => ({
  ...location,
  latitude: location.latitude + (metres / 6_371_000) * (180 / Math.PI),
});
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
  it("uses the owner's Google Maps office pin and a maximum 1km punch radius", () => {
    expect(DEFAULT_HR_VERIFICATION).toMatchObject({
      officeLatitude: 30.0715683,
      officeLongitude: 30.9468446,
      radiusMeters: 1000,
      maxAccuracyMeters: 300,
    });
    expect(verifyHrPunchLocation(settings, northFix(999), now).accepted).toBe(
      true
    );
    expect(verifyHrPunchLocation(settings, northFix(1001), now).accepted).toBe(
      false
    );
    // GPS uncertainty is separate from the office radius and never expands it.
    expect(
      verifyHrPunchLocation(
        settings,
        { ...northFix(1001), accuracy: 300 },
        now
      ).accepted
    ).toBe(false);
  });
  it("accepts accuracy up to and including 300m, but never over it", () => {
    for (const accuracy of [0, 100, 101, 299, 300]) {
      expect(
        verifyHrPunchLocation(settings, { ...northFix(999), accuracy }, now)
          .accepted
      ).toBe(true);
    }
    for (const accuracy of [300.01, 301, 1000]) {
      const result = verifyHrPunchLocation(
        settings,
        { ...location, accuracy },
        now
      );
      expect(result.accepted).toBe(false);
      expect(result.message).toContain("300 metres");
    }
  });
  it("honors stricter administrator-configured accuracy without a client-side override", () => {
    expect(
      verifyHrPunchLocation(
        { ...settings, maxAccuracyMeters: 100 },
        { ...location, accuracy: 101 },
        now
      ).accepted
    ).toBe(false);
  });
  it("rejects missing, stale, future, inaccurate, invalid and outside fixes", () => {
    for (const v of [
      undefined,
      { ...location, capturedAt: now - 61000 },
      { ...location, capturedAt: now + 6000 },
      { ...location, accuracy: 301 },
      { ...location, latitude: 91 },
      { ...location, accuracy: -1 },
      { ...location, latitude: NaN },
      { ...location, latitude: location.latitude + 0.01 },
    ]) {
      expect(verifyHrPunchLocation(settings, v, now).accepted).toBe(false);
    }
  });
  it("fails closed for pending, strict Wi-Fi, both, and unknown verification modes", () => {
    for (const verificationMethod of [
      "pending",
      "strict_wifi",
      "both",
      "unknown",
    ]) {
      expect(
        verifyHrPunchLocation(
          { ...settings, verificationMethod },
          location,
          now
        ).accepted
      ).toBe(false);
    }
  });
});
