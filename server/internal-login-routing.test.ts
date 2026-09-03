import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("default ELEVAY login routing", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("builds an internal login URL and preserves a safe requested destination", async () => {
    const assign = vi.fn();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { assign } },
    });

    const { getSystemLoginUrl, startSystemLogin } = await import("../client/src/const");

    expect(getSystemLoginUrl("/")).toBe("/login");
    expect(getSystemLoginUrl("/finance/clients?consultant=Mahmoud%20Saber"))
      .toBe("/login?returnTo=%2Ffinance%2Fclients%3Fconsultant%3DMahmoud%2520Saber");
    expect(getSystemLoginUrl("//malicious.example")).toBe("/login");
    expect(getSystemLoginUrl("/login?returnTo=/finance")).toBe("/login");

    startSystemLogin("/contracting/invoices");
    expect(assign).toHaveBeenCalledWith("/login?returnTo=%2Fcontracting%2Finvoices");
  });

  it("uses internal login for all default sign-in and unauthorized entry points", () => {
    const files = [
      "client/src/main.tsx",
      "client/src/_core/hooks/useAuth.ts",
      "client/src/components/DashboardLayout.tsx",
      "client/src/components/MobileLayout.tsx",
      "client/src/pages/Cases.tsx",
      "client/src/pages/ClientDocs.tsx",
      "client/src/pages/ElevayHome.tsx",
      "client/src/pages/Home.tsx",
      "client/src/pages/MobileHome.tsx",
    ];

    for (const file of files) {
      const source = readProjectFile(file);
      expect(source).toContain("startSystemLogin");
      expect(source).not.toMatch(/\bstartLogin\s*\(/);
    }
  });

  it("returns users to the requested safe in-app page after password login", () => {
    const source = readProjectFile("client/src/pages/Login.tsx");
    expect(source).toContain('get("returnTo")');
    expect(source).toContain('requestedPath.startsWith("/")');
    expect(source).toContain('!requestedPath.startsWith("//")');
    expect(source).toContain("setLocation(returnTo)");
  });

  it("keeps Manus OAuth available only as an explicit optional helper", () => {
    const source = readProjectFile("client/src/const.ts");
    expect(source).toContain("export const startLogin");
    expect(source).toContain("Optional Manus OAuth sign-in");
  });
});
