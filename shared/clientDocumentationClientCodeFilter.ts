export type ClientDocumentationCodeRecord = {
  clientCode?: string | null;
};

/**
 * Matches Client Documentation records by the client code displayed to staff.
 * Empty filters preserve the complete list; non-empty filters support exact and
 * partial code lookup without reading or changing any record.
 */
export function clientDocumentationMatchesClientCode(
  record: ClientDocumentationCodeRecord,
  clientCodeFilter: string,
): boolean {
  const query = clientCodeFilter.trim().toLowerCase();
  if (!query) return true;
  return (record.clientCode ?? "").trim().toLowerCase().includes(query);
}
