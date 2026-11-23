/**
 * Owner decision (23 Nov 2026): the Command Center is disabled, keeping its code and data so it can be switched
 * back on. Modes:
 *   "on"            everything runs (the old behaviour)
 *   "publish_only"  (default now) no AI runs, schedules, inbox checks, auto-replies, ads reviews, Manus jobs or
 *                   render jobs; only posts that were already approved keep publishing at their scheduled time;
 *                   the dashboard is read-only
 *   "off"           nothing runs and /admin shows a "disabled" page
 * Switch with the hosting secret/variable ELEVAY_COMMAND_CENTER_MODE (on | publish_only | off).
 */
export type CommandCenterMode = "on" | "publish_only" | "off";
export function commandCenterMode(): CommandCenterMode {
  const v = String(process.env.ELEVAY_COMMAND_CENTER_MODE || "").trim().toLowerCase();
  return v === "on" || v === "off" || v === "publish_only" ? v : "publish_only";
}
export const commandCenterOn = () => commandCenterMode() === "on";
export const DISABLED_MESSAGE = "The ELEVAY Command Center is disabled by the owner. Nothing new is generated, replied to or published; already-approved posts finish publishing.";
