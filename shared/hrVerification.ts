export type HrLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: number;
};
export type HrVerificationSettings = {
  verificationMethod: string;
  officeLatitude: number;
  officeLongitude: number;
  radiusMeters: number;
  maxAccuracyMeters: number;
};
export const DEFAULT_HR_VERIFICATION: HrVerificationSettings = {
  verificationMethod: "pending",
  officeLatitude: 30.0715683,
  officeLongitude: 30.9468446,
  radiusMeters: 1000,
  maxAccuracyMeters: 300,
};
export function hrDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const radians = (v: number) => (v * Math.PI) / 180;
  const a =
    Math.sin(radians(lat2 - lat1) / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return (
    6_371_000 *
    2 *
    Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)))
  );
}
export function describeHrVerification(s: HrVerificationSettings) {
  const allowed = s.verificationMethod === "geofence";
  const message = allowed
    ? "Office location required on every clock-in and clock-out. Location is validated on the server; browser location is not absolute proof of presence."
    : s.verificationMethod === "strict_wifi" || s.verificationMethod === "both"
      ? "Attendance blocked: strict ELEVAY / Elevay 5g Wi-Fi verification requires a configured router integration. A Wi-Fi label or public IP is not accepted as proof."
      : "Attendance blocked until an HR administrator configures and approves the verification method.";
  return { ...s, method: s.verificationMethod, allowed, message };
}
export function verifyHrPunchLocation(
  s: HrVerificationSettings,
  location: HrLocation | undefined,
  now: number
) {
  const description = describeHrVerification(s);
  if (!description.allowed)
    return {
      accepted: false,
      message: description.message,
      distanceMeters: null,
    };
  if (!location)
    return {
      accepted: false,
      message:
        "Allow location access and obtain a fresh office location to record attendance.",
      distanceMeters: null,
    };
  if (
    ![
      location.latitude,
      location.longitude,
      location.accuracy,
      location.capturedAt,
      now,
    ].every(Number.isFinite) ||
    Math.abs(location.latitude) > 90 ||
    Math.abs(location.longitude) > 180 ||
    location.accuracy < 0
  ) {
    return {
      accepted: false,
      message: "The supplied location is invalid. Obtain a fresh location.",
      distanceMeters: null,
    };
  }
  if (location.capturedAt < now - 60_000 || location.capturedAt > now + 5_000)
    return {
      accepted: false,
      message: "Your location is stale. Refresh it and try again.",
      distanceMeters: null,
    };
  if (location.accuracy > s.maxAccuracyMeters)
    return {
      accepted: false,
      message: `Location accuracy must be within ${s.maxAccuracyMeters} metres. Move near a window and retry.`,
      distanceMeters: null,
    };
  const distanceMeters = hrDistanceMeters(
    s.officeLatitude,
    s.officeLongitude,
    location.latitude,
    location.longitude
  );
  if (distanceMeters > s.radiusMeters)
    return {
      accepted: false,
      message: `You are ${Math.round(distanceMeters)} metres from the office, outside the ${s.radiusMeters}-metre attendance area.`,
      distanceMeters,
    };
  return {
    accepted: true,
    message: "Office location accepted.",
    distanceMeters,
  };
}
