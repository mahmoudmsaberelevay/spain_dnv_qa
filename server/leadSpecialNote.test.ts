import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getLeadSpecialNoteLabel,
  LEAD_SPECIAL_NOTE_LABELS,
  LEAD_SPECIAL_NOTE_TYPES,
} from "../shared/leadSpecialNote";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0084_lead_special_notes.sql", import.meta.url), "utf8");
const db = readFileSync(new URL("./leadsDb.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers/leads.ts", import.meta.url), "utf8");
const profile = readFileSync(new URL("../client/src/pages/leads/LeadProfile.tsx", import.meta.url), "utf8");
const list = readFileSync(new URL("../client/src/pages/leads/LeadsList.tsx", import.meta.url), "utf8");

describe("Lead Special Note types", () => {
  it("supports exactly Zoom Meeting and Physical Meeting", () => {
    expect(LEAD_SPECIAL_NOTE_TYPES).toEqual(["zoom_meeting", "physical_meeting"]);
    expect(LEAD_SPECIAL_NOTE_LABELS).toEqual({
      zoom_meeting: "Zoom Meeting",
      physical_meeting: "Physical Meeting",
    });
    expect(getLeadSpecialNoteLabel(null)).toBeNull();
  });
});

describe("Lead Special Note persistence", () => {
  it("stores one current typed note on the Lead with attribution and update time", () => {
    expect(schema).toContain('specialNoteType: mysqlEnum("specialNoteType", ["zoom_meeting", "physical_meeting"])');
    expect(schema).toContain('specialNote: text("specialNote")');
    expect(schema).toContain('specialNoteSetBy: varchar("specialNoteSetBy"');
    expect(schema).toContain('specialNoteUpdatedAt: bigint("specialNoteUpdatedAt"');
    expect(schema).toContain('index("leads_special_note_type_idx").on(table.specialNoteType)');
  });

  it("uses an additive migration that does not rewrite Leads or ordinary notes", () => {
    expect(migration).toContain("ALTER TABLE `leads`");
    expect(migration).toContain("ADD COLUMN `specialNoteType`");
    expect(migration).toContain("CREATE INDEX `leads_special_note_type_idx`");
    expect(migration).not.toMatch(/\bDROP\b/i);
    expect(migration).not.toMatch(/\bDELETE\b/i);
    expect(migration).not.toMatch(/\bUPDATE\b/i);
    expect(migration).not.toContain("lead_notes");
  });

  it("validates note type and bounded note content at the protected API", () => {
    expect(router).toContain("specialNote: router({");
    expect(router).toContain("type: z.enum(LEAD_SPECIAL_NOTE_TYPES)");
    expect(router).toContain("note: z.string().trim().min(1).max(4000)");
    expect(router).toContain("specialNoteSetBy: setBy");
    expect(router).toContain("specialNoteUpdatedAt: updatedAt");
  });

  it("preserves audit history when setting or clearing a Special Note", () => {
    expect(router).toContain("Special Note (${LEAD_SPECIAL_NOTE_LABELS[input.type]}) added by");
    expect(router).toContain("Special Note cleared by");
    expect(router).toContain('activityType: "note_added"');
  });
});

describe("Lead Special Note interface", () => {
  it("uses the requested Add Special Note label and both meeting choices", () => {
    expect(profile).toContain("Add Special Note");
    expect(profile).toContain('<SelectItem value="zoom_meeting">Zoom Meeting</SelectItem>');
    expect(profile).toContain('<SelectItem value="physical_meeting">Physical Meeting</SelectItem>');
  });

  it("keeps the current Special Note persistently highlighted on the Lead profile", () => {
    expect(profile).toContain("lead.specialNoteType && specialNoteLabel");
    expect(profile).toContain("This note remains highlighted on the Lead profile and appears in All Leads until it is cleared.");
    expect(profile).toContain("lead.specialNoteSetBy");
    expect(profile).toContain("lead.specialNoteUpdatedAt");
  });

  it("shows a visible Special Note badge and text on every marked All Leads row", () => {
    expect(list).toContain("lead.specialNoteType && lead.specialNote");
    expect(list).toContain("Special Note: {lead.specialNote}");
    expect(list).toContain("getLeadSpecialNoteLabel(lead.specialNoteType)");
  });
});

describe("All Leads Special Note filters", () => {
  it("offers general, Zoom Meeting, and Physical Meeting choices", () => {
    expect(list).toContain('<SelectItem value="any">Any Special Note</SelectItem>');
    expect(list).toContain('<SelectItem value="zoom_meeting">Zoom Meeting</SelectItem>');
    expect(list).toContain('<SelectItem value="physical_meeting">Physical Meeting</SelectItem>');
    expect(list).toContain("specialNote: specialNoteFilter !== \"all\" ? specialNoteFilter : undefined");
  });

  it("uses indexed nullable-type filtering for any or a specific meeting type", () => {
    expect(db).toContain('filters?.specialNote === "any"');
    expect(db).toContain("${leads.specialNoteType} IS NOT NULL");
    expect(db).toContain("eq(leads.specialNoteType, filters.specialNote)");
    expect(router).toContain('specialNote: z.enum(["any", ...LEAD_SPECIAL_NOTE_TYPES]).optional()');
  });

  it("includes Special Notes in shared filter presets and Clear All", () => {
    expect(list).toContain("setSpecialNoteFilter(f.specialNote ?? \"all\")");
    expect(list).toContain("setSpecialNoteFilter(\"all\")");
    expect(list).toContain("specialNoteFilter !== \"all\"");
  });
});
