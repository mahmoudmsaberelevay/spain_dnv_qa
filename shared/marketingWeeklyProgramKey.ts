import { z } from "zod";

/** Users may enter `Spain DNV` or the existing `spain_dnv` key. */
export const weeklyProgramKeyInput = z.string().trim().min(2, "Enter a programme name, such as Spain DNV.").max(96, "Programme name is too long.")
  .regex(/^[a-z0-9][a-z0-9 ._-]*[a-z0-9]$/i, "Use English letters, numbers, spaces, hyphens or underscores (e.g. Spain DNV).")
  .transform(value => {
    const normalized = value.toLowerCase().replace(/[ ._-]+/g, "_");
    const aliases: Record<string, string> = {
      spain_digital_nomad_residency: "spain_dnv",
      malta_permanent_residence_programme: "malta_mprp",
      malta_permanent_residence: "malta_mprp",
    };
    return aliases[normalized] ?? normalized;
  })
  .pipe(z.string().min(2).max(96).regex(/^[a-z0-9_]+$/));

export function normalizeWeeklyProgramKey(input: string): string {
  return weeklyProgramKeyInput.parse(input);
}
