import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { Shield, FileSearch, CheckCircle, BarChart3, ArrowRight, Stamp, Globe } from "lucide-react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate("/cases");
    } else {
      window.location.href = getLoginUrl();
    }
  };

  const features = [
    {
      icon: FileSearch,
      title: "AI-Powered OCR",
      description: "Automatically extract passport data with exact spelling preservation from Arabic and English documents.",
    },
    {
      icon: Stamp,
      title: "Stamp Verification",
      description: "Detect and verify MOFA and Spain Embassy attestation stamps across all required documents.",
    },
    {
      icon: Shield,
      title: "Eligibility Analysis",
      description: "Validate company ownership, freelancing eligibility, and recommendation letter completeness.",
    },
    {
      icon: BarChart3,
      title: "Scored Reports",
      description: "Receive a comprehensive scored checklist with flagged issues and actionable recommendations.",
    },
    {
      icon: CheckCircle,
      title: "Case Management",
      description: "Track multiple client applications with clear status indicators and document history.",
    },
    {
      icon: Globe,
      title: "Bilingual Support",
      description: "Full support for Arabic and English documents with accurate cross-language verification.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">Spain DNV QA</span>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Button onClick={() => navigate("/cases")} size="sm">
                Dashboard <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            ) : (
              <Button onClick={handleGetStarted} size="sm">
                Sign In <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-[var(--gold)]/5 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 py-24 lg:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Spain Digital Nomad Visa — 2026
            </div>
            <h1 className="font-serif text-5xl lg:text-6xl font-semibold text-foreground leading-tight mb-6">
              Application Quality<br />
              <span className="text-primary">Assurance</span> Platform
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-2xl">
              A professional tool for immigration consultants to validate client documents, verify official stamps, and generate comprehensive analysis reports for Spain's Digital Nomad Visa applications.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleGetStarted} size="lg" className="gap-2">
                Start a New Case
                <ArrowRight className="w-4 h-4" />
              </Button>
              {isAuthenticated && (
                <Button onClick={() => navigate("/cases")} variant="outline" size="lg">
                  View All Cases
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { value: "11", label: "Document Types Verified" },
              { value: "4", label: "AI Verification Checks" },
              { value: "2", label: "Stamp References" },
              { value: "100%", label: "Bilingual Support" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-serif font-semibold text-primary mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="font-serif text-3xl lg:text-4xl font-semibold text-foreground mb-4">
            Everything You Need
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            From document upload to final analysis, every step of the QA process is covered with precision and intelligence.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group p-6 rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-lg transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary">
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <h2 className="font-serif text-3xl font-semibold text-primary-foreground mb-4">
            Ready to Validate Your First Case?
          </h2>
          <p className="text-primary-foreground/80 mb-8 max-w-lg mx-auto">
            Sign in to start a new client case and run a comprehensive quality assurance check in minutes.
          </p>
          <Button
            onClick={handleGetStarted}
            variant="outline"
            size="lg"
            className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 border-primary-foreground"
          >
            Get Started — It's Free
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="w-4 h-4" />
            <span>Spain DNV QA System — Immigration Consultant Tool</span>
          </div>
          <p className="text-xs text-muted-foreground">
            For professional use by licensed immigration consultants only.
          </p>
        </div>
      </footer>
    </div>
  );
}
