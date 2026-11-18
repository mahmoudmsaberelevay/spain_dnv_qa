/** HR-only presentation for a stale lazy PDF module after deployment. */
export function hrReportExportErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (
      /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to load module script|loading chunk .+ failed|unable to preload css/i.test(
        error.message
      )
    ) {
      return "The HR report module could not load. Save any unsaved changes, then refresh this page and export again. If it continues, check your connection. No attendance or salary record was changed.";
    }
    return error.message;
  }
  return "The HR report could not be exported. Please try again.";
}
