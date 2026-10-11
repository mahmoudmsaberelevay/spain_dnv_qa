import type { Express, Request, Response } from "express";

/**
 * Supplied by ELEVAY and intentionally served unchanged from managed storage.
 * This page is a narrow public media endpoint: no CRM data, authentication,
 * navigation, analytics, or application shell is loaded.
 */
export const ELEVAY_OUTRO_VIDEO_PATH = "/manus-storage/ELEVAYEXTRO_web_a5e44766.mp4";

export function buildElevayOutroHtml(videoPath = ELEVAY_OUTRO_VIDEO_PATH): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ELEVAY Outro</title>
  <meta name="robots" content="noindex">
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; margin: 0; }
    body { min-height: 100vh; display: grid; place-items: center; background: #ffffff; }
    main { width: min(100%, 720px); padding: 16px; }
    video { display: block; width: 100%; height: auto; max-height: calc(100vh - 32px); margin: 0 auto; background: #ffffff; border: 0; }
    .download { display: block; width: fit-content; margin: 12px auto 0; color: #1A3A5C; font: 500 14px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    @media (max-width: 480px) { main { padding: 0; width: 100%; } video { max-height: 100vh; } .download { margin: 8px auto; } }
  </style>
</head>
<body>
  <main aria-label="ELEVAY official outro video">
    <video aria-label="ELEVAY official outro" muted autoplay playsinline controls preload="metadata">
      <source src="${videoPath}" type="video/mp4">
      Your browser does not support HTML5 video.
    </video>
    <a class="download" href="${videoPath}" download="ELEVAYEXTRO_web.mp4">Download video</a>
  </main>
</body>
</html>`;
}

export function registerPublicOutroPage(app: Express) {
  app.get("/outro", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(buildElevayOutroHtml());
  });
}
