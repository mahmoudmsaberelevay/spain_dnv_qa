import { useLocation } from "wouter";
import { FileText, BarChart2, Send, ArrowRight, Sparkles, Mic2, FolderOpen } from "lucide-react";

const tools = [
  {
    icon: FolderOpen,
    title: "Ready Summaries",
    description: "Browse and download approved ELEVAY country and program summaries. Administrators can add or remove PDFs from the shared library.",
    href: "/marketing/ready-summaries",
    color: "from-[#5BA3B8] to-[#1A3A5C]",
    badge: "PDF Library",
  },
  {
    icon: Mic2,
    title: "Arabic Voice-over",
    description: "Convert Arabic marketing scripts into polished MP3 voice-overs using ELEVAY’s approved Eleven v3 voice settings.",
    href: "/marketing/voice-over",
    color: "from-[#5BA3B8] to-[#1A3A5C]",
    badge: "Eleven v3",
  },
  {
    icon: FileText,
    title: "Summary Generator",
    description: "Create branded program summaries with full editorial control. Customize content, colors, images, and export as professional PDFs.",
    href: "/marketing/summary-generator",
    color: "from-teal-500 to-cyan-600",
    badge: "AI-Powered",
  },
  {
    icon: BarChart2,
    title: "Program Enhanced Comparison",
    description: "Compare multiple citizenship and residency programs side-by-side with detailed criteria, costs, timelines, and benefits.",
    href: "/marketing/program-comparison",
    color: "from-blue-500 to-indigo-600",
    badge: "Available",
  },
  {
    icon: Send,
    title: "Program Proposal",
    description: "Generate tailored program proposals for clients based on their profile, budget, and goals. Export as branded PDF documents.",
    href: "/marketing/program-proposal",
    color: "from-purple-500 to-violet-600",
    badge: "Available",
  },
];

export default function MarketingDashboard() {
  const [, navigate] = useLocation();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-teal-400" />
          <span className="text-sm text-teal-400 font-medium uppercase tracking-widest">Marketing Module</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Marketing Tools</h1>
        <p className="text-gray-400 text-base">Create professional marketing materials for your citizenship and residency programs.</p>
      </div>

      {/* Tool Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {tools.map((tool) => {
          const Icon = tool.icon;
                        const isComingSoon = tool.badge === "Coming Soon";

          return (
            <div
              key={tool.href}
              onClick={() => !isComingSoon && navigate(tool.href)}
              className={`relative bg-[#1a2235] border border-white/10 rounded-xl p-6 flex flex-col gap-4 transition-all duration-200 ${
                isComingSoon ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-teal-500/50 hover:bg-[#1e2a40]"
              }`}
            >
              {/* Badge */}
              <span className={`absolute top-4 right-4 text-xs font-semibold px-2 py-0.5 rounded-full ${
                isComingSoon ? "bg-gray-700 text-gray-400" : "bg-teal-900/60 text-teal-300"
              }`}>
                {tool.badge}
              </span>

              {/* Icon */}
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tool.color} flex items-center justify-center`}>
                <Icon className="w-6 h-6 text-white" />
              </div>

              {/* Content */}
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-white mb-1">{tool.title}</h2>
                <p className="text-sm text-gray-400 leading-relaxed">{tool.description}</p>
              </div>

              {/* CTA */}
              {!isComingSoon && (
                <div className="flex items-center gap-1 text-teal-400 text-sm font-medium mt-1">
                  Open Tool <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
