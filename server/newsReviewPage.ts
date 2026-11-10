export type NewsReviewItem = {
  publicId: string; title: string; url: string; sourceName: string | null;
  publicationStatus: string; accessStatus: string; reviewReason: string | null;
  accessError: string | null; digestReceivedAt: Date | string; summaryWordCount: number | null;
};
function escape(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
function safeLink(value: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? escape(url.href) : "#"; }
  catch { return "#"; }
}
export function renderNewsReviewPage(items: NewsReviewItem[]) {
  const count = (status: string) => items.filter(item => item.publicationStatus === status).length;
  const queue = items.filter(item => item.publicationStatus !== "published");
  const cards = queue.map(item => `<article class="card"><div class="badge">${escape(item.publicationStatus === "rejected" ? "Excluded: not relevant" : item.accessStatus === "pending" || item.accessStatus === "processing" ? "Awaiting source research" : "Review required")}</div><h2>${escape(item.title)}</h2><p>${escape(item.sourceName || "Publisher not verified")} · ${escape(new Date(item.digestReceivedAt).toISOString().slice(0, 10))}</p><p><strong>Reason:</strong> ${escape(item.reviewReason || item.accessError || "source_research_pending")}</p><p>Source access: ${escape(item.accessStatus)}</p><a href="${safeLink(item.url)}" target="_blank" rel="noopener noreferrer">Open original source</a></article>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ELEVAY News Review</title><style>body{margin:0;background:#f7fafc;color:#1a3a5c;font:16px/1.6 system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:28px 20px}h1{font-size:28px}h2{font-size:20px;margin:12px 0;overflow-wrap:anywhere}a{color:#1a3a5c;text-underline-offset:3px}.card{background:white;border:1px solid #dce6ec;border-radius:16px;padding:20px;margin-top:16px}.badge{font-size:13px;font-weight:700;color:#805800}.counts{display:flex;gap:12px;flex-wrap:wrap}.counts span{border:1px solid #a1c6cf;border-radius:12px;padding:10px 16px}p{overflow-wrap:anywhere}</style></head><body><main><a href="/marketing">Back to Marketing</a><h1>News source review</h1><p>Only accessible, relevant articles with validated original summaries appear in the app. Paywalls and access blocks are not bypassed. A Google Alert snippet is not used as a detailed article.</p><div class="counts"><span>Published: ${count("published")}</span><span>Pending / review: ${count("pending_review")}</span><span>Excluded: ${count("rejected")}</span></div><p>Counts cover the retained News archive (up to 200 articles). Pending research is processed in bounded batches by the existing Daily Digest runner. Blocked sources and failed summary validation remain private for review.</p>${cards || '<div class="card">No pending review items in the retained archive.</div>'}</main></body></html>`;
}
