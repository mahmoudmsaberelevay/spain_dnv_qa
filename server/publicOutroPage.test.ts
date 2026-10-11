import { describe, expect, it } from "vitest";
import { buildElevayOutroHtml, ELEVAY_OUTRO_VIDEO_PATH, registerPublicOutroPage } from "./publicOutroPage";

describe("public ELEVAY outro page", () => {
  it("uses the supplied managed MP4 with native video accessibility and download fallback", () => {
    const html = buildElevayOutroHtml();

    expect(html).toContain(`src="${ELEVAY_OUTRO_VIDEO_PATH}"`);
    expect(html).toContain('type="video/mp4"');
    expect(html).toMatch(/\bmuted\b/);
    expect(html).toMatch(/\bautoplay\b/);
    expect(html).toMatch(/\bplaysinline\b/);
    expect(html).toMatch(/\bcontrols\b/);
    expect(html).toContain('aria-label="ELEVAY official outro"');
    expect(html).toContain('download="ELEVAYEXTRO_web.mp4"');
  });

  it("keeps the media presentation responsive without CRM navigation or marketing copy", () => {
    const html = buildElevayOutroHtml();

    expect(html).toContain('width: min(100%, 720px)');
    expect(html).toContain('@media (max-width: 480px)');
    expect(html).not.toContain('Privacy Policy');
    expect(html).not.toContain('Terms & Conditions');
  });

  it("registers an unauthenticated GET route at /outro", () => {
    let path = "";
    let handler: (() => void) | undefined;
    const app = {
      get(route: string, callback: () => void) {
        path = route;
        handler = callback;
      },
    };

    registerPublicOutroPage(app as never);
    expect(path).toBe("/outro");
    expect(handler).toBeTypeOf("function");
  });
});
