import { useLocation } from "wouter";
import { BrainCircuit, CalendarClock, ChartNoAxesCombined, LockKeyhole, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const mainSections = [
  {
    icon: Settings2,
    title: "Settings",
    text: "Brand identity, the active design instructions and logo, programme references, strategy targets, model roles, weekly timing and budget controls.",
    href: "/marketing/agentic-settings",
    accent: "border-[#5BA3B8]/45 bg-[#111f33]",
  },
  {
    icon: CalendarClock,
    title: "Media Production",
    text: "Saturday's planned reels and static posts, Cairo publishing dates and times, system-generated previews, Egyptian-Arabic copy, feedback and individual approval.",
    href: "/marketing/media-production",
    accent: "border-[#C9A84C]/40 bg-[#201c14]",
  },
  {
    icon: ChartNoAxesCombined,
    title: "META ADS Production",
    text: "Dated reports for the selected ELEVAY ad account, evidence-led suggested amendments and separately governed ad creative review.",
    href: "/marketing/meta-ads-production",
    accent: "border-[#5BA3B8]/35 bg-[#122233]",
  },
] as const;

export default function AgenticMarketingHub() {
  const [, navigate] = useLocation();
  return (
    <div className="agentic-readable min-h-full bg-[#0c1320] px-4 py-6 text-white md:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-[#5BA3B8]/30 bg-[radial-gradient(circle_at_85%_0%,rgba(91,163,184,.22),transparent_42%),linear-gradient(120deg,#14243a,#0b1423)] p-7 md:p-10">
          <div className="flex items-center gap-2 text-[#a9d6e3]"><BrainCircuit className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-[.16em]">Marketing command center</span></div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">ELEVAY AI Agentic Marketing System</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white">Choose one of three workspaces. Settings governs the system; Media Production delivers the weekly creative pack; META ADS Production keeps ad-account reporting and ad proposals separate from organic publishing.</p>
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
            <p>Media is review-only. Meta posts and ads remain blocked from automatic publication, campaign edits and spending until the correct channel permissions, individual approval, separate release gates and a valid publishing integration are verified. Leads and CAPI are unchanged.</p>
          </div>
        </section>
        <section className="mt-7 grid gap-4 lg:grid-cols-3" aria-label="Agentic Marketing workspaces">
          {mainSections.map(section => {
            const Icon = section.icon;
            return <article key={section.href} className={`flex min-h-64 flex-col rounded-2xl border p-6 ${section.accent}`}>
              <div className="w-fit rounded-xl bg-white/10 p-3 text-[#a9d6e3]"><Icon className="h-7 w-7" /></div>
              <h2 className="mt-5 text-2xl font-semibold text-white">{section.title}</h2>
              <p className="mt-3 flex-1 text-sm leading-7 text-slate-100">{section.text}</p>
              <Button onClick={() => navigate(section.href)} className="mt-6 bg-[#5BA3B8] text-[#0A1628] hover:bg-[#77b7c8]"><Icon className="mr-2 h-4 w-4" />Open {section.title}</Button>
            </article>;
          })}
        </section>
      </div>
    </div>
  );
}
