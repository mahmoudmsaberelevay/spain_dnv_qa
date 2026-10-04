import { describe, expect, it } from "vitest";
import { ELEVAY_APPROVED_STATIC_FONT_FAMILY, requireElevayApprovedStaticTypography } from "./elevayStaticTypography";

describe("ELEVAY static typography approval", () => {
  it("recognizes the disclosed Plus Jakarta Sans fallback with two verified local faces", async () => {
    expect(ELEVAY_APPROVED_STATIC_FONT_FAMILY).toBe("Plus Jakarta Sans");
    const result = await requireElevayApprovedStaticTypography();
    expect(result).toMatchObject({ family: "Plus Jakarta Sans", approvedFallback: true });
    expect(result.faces.map(face => face.weight)).toEqual(["regular", "bold"]);
    expect(result.faces.every(face => /^[a-f0-9]{64}$/.test(face.sha256))).toBe(true);
    expect(result.faces.every(face => face.path.includes("marketing-fonts/PlusJakartaSans-"))).toBe(true);
  });
});
