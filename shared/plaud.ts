export const PLAUD_SHARED_NOTICE =
  "Connecting Plaud does not share your private recordings. A transcript you explicitly import into a Lead note will also be visible and exportable by all active CRM users in Train Your AI Agent. Transcripts may contain identifying or sensitive client information. Import only recordings you are authorized to share with the company.";
export const PLAUD_MODULE_PATH = "/train-your-ai-agent";
export type PlaudRecording = {
  id: string;
  title: string;
  callAt: number | null;
  durationMs: number | null;
};
/** Only ever produced server-side from the authenticated provider response. */
export type PlaudFetchedRecording = PlaudRecording & {
  sourceScope: string;
  transcript: string;
};
export type PlaudConnectionStatus = {
  connected: boolean;
  needsReconnect: boolean;
};
export type PlaudRecordingPage = {
  items: PlaudRecording[];
  page: number;
  hasMore: boolean;
};
export type PlaudCatalogueEntry = {
  id: number;
  title: string;
  callAt: number | null;
  importedAt: number;
  effectiveAt: number;
  usesImportDate: boolean;
  importerName: string;
  durationMs: number | null;
  transcript: string;
  lead: { name: string; code: string; path: string } | null;
};
export type PlaudCataloguePage = {
  items: PlaudCatalogueEntry[];
  total: number;
  page: number;
  pageSize: number;
  timeZone: string;
};
export type PlaudRange = { from?: string; to?: string };
