export function buildReadySummaryWhatsappText(title: string, downloadUrl: string) {
  const safeTitle = title.replace(/\s+/g, " ").trim().slice(0, 255);
  const parsedUrl = new URL(downloadUrl);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("ready_summary_share_https_required");
  }
  return `ELEVAY Ready Summary\n${safeTitle}\n\nDownload PDF: ${parsedUrl.toString()}`;
}

export function buildReadySummaryWhatsappUrl(title: string, downloadUrl: string) {
  return `https://wa.me/?text=${encodeURIComponent(buildReadySummaryWhatsappText(title, downloadUrl))}`;
}
