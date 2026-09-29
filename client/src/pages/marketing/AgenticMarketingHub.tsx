import { useLocation } from "wouter";
import { BrainCircuit, CalendarClock, LockKeyhole, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const mainSections = [
  {
    icon: Settings2,
    title: "1. Settings",
    text: "Brand Identity, Design System and official logo, knowledge sources, marketing strategy, provider roles, production timing, 30-day targets, readiness controls, and decision records all live inside Settings.",
    href: "/marketing/weekly-results?view=setup",
    action: "Open Settings",
    accent: "border-[#5BA3B8]/45 bg-[#111f33]",
  },
  {
    icon: CalendarClock,
    title: "2. Production",
    text: "Weekly research, content preparation, static designs, reels, ad proposals, individual approvals, feedback, and performance review all live inside Production.",
    href: "/marketing/weekly-results",
    action: "Open Production",
    accent: "border-[#C9A84C]/40 bg-[#201c14]",
  },
] as const;

export default function AgenticMarketingHub() {
  const [, navigate] = useLocation();

  return (
    <div className="agentic-readable min-h-full bg-[#0c1320] px-4 py-6 text-white md:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-3xl border border-[#5BA3B8]/30 bg-[radial-gradient(circle_at_85%_0%,rgba(91,163,184,.22),transparent_42%),linear-gradient(120deg,#14243a,#0b1423)] p-7 md:p-10">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-[#a9d6e3]">
              <BrainCircuit className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-[.16em]">Marketing module command center</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">ELEVAY AI Agentic Marketing System</h1>
            <p className="mt-4 text-sm leading-7 text-white md:text-base">
              Everything is now organized inside two main sections. <strong>Settings</strong> contains the identity, strategy, controls and configuration that govern the system. <strong>Production</strong> contains the weekly research, creative materials, review decisions, ad recommendations and results.
            </p>
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
              <p><strong>Important:</strong> provider execution, media rendering, Meta campaign creation, spend, publishing, scheduling and CAPI changes remain locked until the separate pilot and execution-release approvals.</p>
            </div>
          </div>
        </section>

        <section className="mt-7" aria-labelledby="agentic-main-sections-heading">
          <div className="mb-4">
            <h2 id="agentic-main-sections-heading" className="text-xl font-semibold">Choose a main section</h2>
            <p className="mt-1 text-sm text-slate-100">The detailed controls no longer appear as a third group here. Open the relevant main section to use them.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {mainSections.map(section => {
              const Icon = section.icon;
              return (
                <article key={section.href} className={`flex min-h-64 flex-col rounded-2xl border p-6 ${section.accent}`}>
                  <div className="rounded-xl bg-white/10 p-3 text-[#a9d6e3] w-fit"><Icon className="h-7 w-7" /></div>
                  <h3 className="mt-5 text-2xl font-semibold text-white">{section.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-7 text-slate-100">{section.text}</p>
                  <Button onClick={() => navigate(section.href)} className="mt-6 bg-[#5BA3B8] text-[#0A1628] hover:bg-[#77b7c8]">
                    <Icon className="mr-2 h-4 w-4" /> {section.action}
                  </Button>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
