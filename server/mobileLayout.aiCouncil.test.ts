import { describe, expect, it } from "vitest";
import {
  canAccessMobileClientPortalAdmin,
  canAccessMobileOwnerPermissions,
  getVisibleMobileSidebarModules,
  MOBILE_SIDEBAR_MODULES,
} from "../client/src/components/MobileLayout";

describe("CEO AI Council mobile navigation", () => {
  it("shows the Council module to the owner and users with viewer or full Council access", () => {
    expect(getVisibleMobileSidebarModules({ aiCouncil: "none" }, true).some((module) => module.id === "aiCouncil")).toBe(true);
    expect(getVisibleMobileSidebarModules({ aiCouncil: "viewer" }).some((module) => module.id === "aiCouncil")).toBe(true);
    expect(getVisibleMobileSidebarModules({ aiCouncil: "full" }).some((module) => module.id === "aiCouncil")).toBe(true);
  });

  it("hides the Council module from users without Council access", () => {
    expect(getVisibleMobileSidebarModules({ aiCouncil: "none" }).some((module) => module.id === "aiCouncil")).toBe(false);
  });

  it("routes the Council Cases mobile item to the Council workspace", () => {
    const councilModule = MOBILE_SIDEBAR_MODULES.find((module) => module.id === "aiCouncil");
    expect(councilModule?.label).toBe("CEO AI Council");
    expect(councilModule?.items[0]?.path).toBe("/ai-council");
  });

  it("shows Client Portal Administration to admins without widening owner-only permissions", () => {
    expect(canAccessMobileClientPortalAdmin({ role: "admin" })).toBe(true);
    expect(canAccessMobileClientPortalAdmin({ role: "user" })).toBe(false);
    expect(canAccessMobileOwnerPermissions({ email: "madonna.adel@elevay.com" })).toBe(false);
    expect(canAccessMobileOwnerPermissions({ email: "MAHMOUD.SABER@ELEVAY.COM" })).toBe(true);
  });
});
