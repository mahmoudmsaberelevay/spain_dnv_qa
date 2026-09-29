import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () => readFileSync(resolve(process.cwd(), "client/src/pages/ElevayHome.tsx"), "utf8");

describe("ElevayHome protected-module navigation", () => {
  it("rechecks an in-memory session before entering a protected module", () => {
    const page = source();
    expect(page).toContain("const { loading, user, refresh } = useAuth()");
    expect(page).toContain("const result = await refresh()");
    expect(page).toContain("if (result.isError || !result.data)");
    expect(page).toContain("startSystemLogin(path)");
    expect(page).toContain("setLocation(path)");
  });

  it("shows a bounded navigation state without unlocking protected content", () => {
    const page = source();
    expect(page).toContain('disabled={navigatingPath !== null}');
    expect(page).toContain('aria-busy={isNavigating}');
    expect(page).toContain('Checking session…');
  });
});
