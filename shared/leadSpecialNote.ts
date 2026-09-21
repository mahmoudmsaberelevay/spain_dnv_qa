export const LEAD_SPECIAL_NOTE_TYPES = ["zoom_meeting", "physical_meeting"] as const;

export type LeadSpecialNoteType = typeof LEAD_SPECIAL_NOTE_TYPES[number];
export type LeadSpecialNoteFilter = "any" | LeadSpecialNoteType;

export const LEAD_SPECIAL_NOTE_LABELS: Record<LeadSpecialNoteType, string> = {
  zoom_meeting: "Zoom Meeting",
  physical_meeting: "Physical Meeting",
};

export function getLeadSpecialNoteLabel(type: LeadSpecialNoteType | null | undefined) {
  return type ? LEAD_SPECIAL_NOTE_LABELS[type] : null;
}
