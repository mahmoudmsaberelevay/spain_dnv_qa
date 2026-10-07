// @ts-nocheck
import { describe, expect, it } from "vitest";
import R from "./rules";
import E from "./engine";
import Demo from "./demo-data";

describe("Command Center brand and compliance rules", () => {
  it("blocks visa wording, guarantees, urgency and contact details", () => {
    const r = R.checkBrief({ type: "static", caption_ar: "احصل على تأشيرة مضمونة الآن! عدد محدود. واتساب 01012345678", design: { headline_en: "Fast visa", format: "1080x1080" } });
    const ids = r.blocks.map((b) => b.id);
    for (const id of ["term_visa_ar", "term_visa_en", "term_guarantee_ar", "term_urgency_ar", "contact_phone", "contact_whatsapp", "disclaimer"]) expect(ids).toContain(id);
    expect(r.pass).toBe(false);
  });

  it("flags reels that are not 4 clips of 5 seconds plus the 3-second outro", () => {
    const r = R.checkBrief({ type: "reel", caption_ar: "نص", reel: { storyboard: [{ clip: 1 }, { clip: 2 }], duration_s: 12 } });
    const warn = r.warnings.map((w) => w.id);
    expect(warn).toContain("reel_clips");
    expect(warn).toContain("reel_duration");
  });

  it("suggests the narrowest change scope", () => {
    expect(R.classifyChange("غير الكابشن وخلي الـ hook أقصر").scope).toBe("caption");
    expect(R.classifyChange("Clip 3 has wrong shoes", { type: "reel" })).toEqual({ scope: "reel_clip", clip: 3 });
    expect(R.classifyChange("Move it to Thursday 9pm").scope).toBe("schedule");
    expect(R.classifyChange("remove the gold border from the image", { type: "static" }).scope).toBe("static_design");
  });

  it("raises spend and CPL guardrails", () => {
    const g = R.guardrails({ month: "2026-10", asOf: "2026-10-10", spendMtdEgp: 80000, adsets: [
      { name: "A", spendEgp: 1500, leads: 10, cplHistory: [{ date: "1", cpl: 120, spend: 500 }, { date: "2", cpl: 130, spend: 500 }, { date: "3", cpl: 150, spend: 500 }] },
      { name: "B", spendEgp: 900, leads: 5, cplHistory: [{ date: "1", cpl: 120, spend: 300 }, { date: "2", cpl: 130, spend: 300 }, { date: "3", cpl: 150, spend: 300 }] },
    ] });
    expect(g.alerts.some((a) => a.code === "cap_projected")).toBe(true);
    expect(g.flagged).toEqual(["A"]);
  });
});

describe("Command Center workflow engine", () => {
  it("creates the right Manus jobs and respects roles", () => {
    const st = Demo.build();
    expect(E.decideItem(st, "2026-W41-01", "approve", {}, "m@x", "marketer").ok).toBe(false);
    expect(E.decideItem(st, "2026-W41-01", "approve", {}, "o@x", "owner").ok).toBe(true);
    expect(st.items.find((i) => i.item_id === "2026-W41-01").first_pass).toBe(true);
    expect(st.jobs[0].type).toBe("schedule_post");
    const r = E.decideItem(st, "2026-W41-02", "request_changes", { comment: "clip 2 shoes are wrong" }, "m@x", "marketer");
    expect(r.scope).toBe("reel_clip");
    expect(st.jobs[0].type).toBe("revise_item");
    expect(E.decideItem(st, "2026-W41-07", "approve", {}, "o@x", "owner").ok).toBe(false);
  });

  it("refuses a budget increase that would break the monthly cap", () => {
    const st = Demo.build();
    const raise = st.actions.find((a) => a.budget_delta_egp === 4000);
    const r = E.decideAction(st, raise.id, "approve", {}, "o@x", "owner");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cap/);
  });

  it("turns autopublish off when an item is rejected", () => {
    const st = E.emptyState();
    let miss = 3;
    for (let w = 1; w <= 6; w++) for (let i = 1; i <= 7; i++) st.items.push({ item_id: `2026-W0${w}-0${i}`, presented_at: "x", first_pass: !(miss > 0 && i === 7 && miss--), owner_comments: [] });
    expect(R.approvalStats(st.items, st.settings).gateEligible).toBe(true);
    expect(E.enableAutopublish(st, "o@x", "owner").ok).toBe(true);
    const b = JSON.parse(JSON.stringify(Demo.build().items.find((i) => i.item_id === "2026-W41-01")));
    for (const k of ["history", "owner_comments", "presented_at", "first_pass", "compliance"]) delete b[k];
    b.item_id = "2026-W07-01";
    E.upsertBrief(st, b, "manus");
    E.decideItem(st, "2026-W07-01", "reject", { comment: "off brand" }, "o@x", "owner");
    expect(st.settings.autopublish.enabled).toBe(false);
  });

  it("applies Manus webhooks to the matching job", () => {
    const st = E.emptyState();
    const job = E.enqueueJob(st, "custom", { request: "x" }, "m@x");
    job.manus.task_id = "task_1";
    E.applyManusWebhook(st, { event_type: "task_stopped", task_detail: { task_id: "task_1", message: "Which?", stop_reason: "ask", question_expectation: { options: ["A", "B"] } } });
    expect(job.status).toBe("needs_input");
  });
});

describe("footwear rule", () => {
  it("accepts shoes named after a negation and fixes prompts that forget them", async () => {
    const R = (await import("./rules")).default;
    const add = [];
    const brief = (kp) => ({ type: "reel", topic: "t", pillar: "Global Mobility", program: "Malta", caption_ar: "", reel: { storyboard: [{ keyframe_prompt: kp }] } });
    const footFail = (kp) => R.checkBrief(brief(kp)).blocks.some((b) => /footwear/.test(b.id));
    expect(footFail("An Arab man in a navy suit, no tie, polished oxford shoes, elegant office.")).toBe(false);
    expect(footFail("An Arab man in a navy suit in an elegant office.")).toBe(true);
    expect(footFail(R.withFootwear("An Arab man in a navy suit in an elegant office."))).toBe(false);
    expect(R.withFootwear("Arab family on a beach in linen clothes.")).toBe("Arab family on a beach in linen clothes.");
  });
});
