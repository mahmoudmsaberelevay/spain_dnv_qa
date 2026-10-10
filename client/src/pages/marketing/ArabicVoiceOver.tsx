import { useState } from "react";
import { AlertCircle, Download, FileAudio, Loader2, Mic2, Sparkles, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type VoiceOverResult = {
  url: string;
  fileName: string;
  script: string;
  settings: {
    model: string;
    language: string;
    stability: number;
    output: string;
  };
};

const MAX_CHARACTERS = 4800;

export default function ArabicVoiceOver() {
  const [script, setScript] = useState("");
  const [result, setResult] = useState<VoiceOverResult | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const generateMutation = trpc.marketing.generateArabicVoiceOver.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setVoiceError(null);
      setPlaybackError(null);
      toast.success("Arabic voice-over generated successfully");
    },
    onError: (error) => {
      const message = /Unexpected token.*DOCTYPE|not valid JSON/i.test(error.message)
        ? "The voice request did not reach the API as JSON. Refresh this page; if it continues, sign out and sign in again before retrying."
        : error.message;
      setVoiceError(message);
      toast.error(message);
    },
  });

  const handleGenerate = () => {
    const trimmedScript = script.trim();
    if (!trimmedScript) {
      toast.error("Enter an Arabic script before generating audio");
      return;
    }
    setVoiceError(null);
    setPlaybackError(null);
    generateMutation.mutate({ text: trimmedScript });
  };

  const isGenerating = generateMutation.isPending;
  const remainingCharacters = MAX_CHARACTERS - script.length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#5BA3B8]/15 text-[#A1C6CF]">
              <Mic2 className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#A1C6CF]">Marketing Studio</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Arabic Voice-over</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
            Turn your Arabic marketing text into a polished ELEVAY voice-over, ready for reels, proposals, and campaign content.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#C9A84C]/25 bg-[#C9A84C]/10 px-4 py-3 text-sm text-[#EBD990]">
          <Sparkles className="h-4 w-4" />
          Saved company voice configuration
        </div>
        </div>

        {voiceError && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-400/35 bg-red-500/10 p-4 text-sm leading-relaxed text-red-100">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
            <div>
              <p className="font-semibold">Voice-over could not be generated</p>
              <p className="mt-1 text-red-100/90">{voiceError}</p>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="rounded-2xl border border-white/10 bg-[#1a2235] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.15)] sm:p-6">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Arabic script</h2>
              <p className="mt-1 text-sm text-gray-400">Use natural Egyptian Arabic. Country and company names stay in English (for example: Spain, Malta and ELEVAY).</p>
            </div>
            <span className={`text-xs font-medium ${remainingCharacters < 0 ? "text-red-400" : "text-gray-500"}`}>
              {script.length.toLocaleString()} / {MAX_CHARACTERS.toLocaleString()} characters
            </span>
          </div>

          <Textarea
            value={script}
            onChange={(event) => setScript(event.target.value)}
            dir="rtl"
            lang="ar-EG"
            aria-label="Arabic voice-over script"
            placeholder="اكتب النص بالعامية المصرية هنا… مثال: بتفكر في الإقامة في Spain؟ خلينا نرتب خطوتك الجاية مع ELEVAY"
            className="min-h-[270px] resize-y border-white/10 bg-[#0f1623] p-4 text-right text-lg leading-9 text-white placeholder:text-gray-600 focus-visible:ring-[#5BA3B8]"
          />

          <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-gray-500">
              Expressive <span className="font-medium text-[#A1C6CF]">[thoughtful]</span> delivery is applied automatically. Every take uses Egyptian Arabic; only approved country and company names may be English.
            </p>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !script.trim() || remainingCharacters < 0}
              className="min-w-[190px] bg-[#5BA3B8] text-white hover:bg-[#4b91a6]"
            >
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Volume2 className="mr-2 h-4 w-4" />}
              {isGenerating ? "Generating audio..." : "Generate voice-over"}
            </Button>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#111a2a] p-5">
            <div className="mb-4 flex items-center gap-2 text-white">
              <FileAudio className="h-4 w-4 text-[#A1C6CF]" />
              <h2 className="text-sm font-semibold">Voice settings</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3">
                <dt className="text-gray-500">Model</dt>
                <dd className="text-right font-medium text-white">Eleven v3</dd>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3">
                <dt className="text-gray-500">Language</dt>
                <dd className="text-right font-medium text-white">Arabic — Egyptian</dd>
              </div>
              <div className="border-b border-white/5 pb-3">
                <dt className="text-gray-500">Voice ID</dt>
                <dd className="mt-1 break-all text-xs font-medium text-white">nc8XQG8lRYRZDnjvKW0H</dd>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3">
                <dt className="text-gray-500">Stability</dt>
                <dd className="text-right font-medium text-white">0.50</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-gray-500">Output</dt>
                <dd className="text-right font-medium text-white">MP3 · 44.1 kHz · 128 kbps</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-[#5BA3B8]/20 bg-gradient-to-br from-[#1A3A5C]/60 to-[#111a2a] p-5">
            <p className="text-sm font-semibold text-white">Consistent ELEVAY delivery</p>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">
              The approved ELEVAY voice always uses Egyptian Arabic. Audio becomes available only after the server verifies a real MP3 response; no substitute voice is used.
            </p>
          </div>
        </aside>
      </div>

      {result && (
        <section className="mt-6 rounded-2xl border border-[#5BA3B8]/30 bg-[#15283a] p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5BA3B8]/20 text-[#A1C6CF]">
                <FileAudio className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-white">Your voice-over is ready</h2>
                <p className="mt-1 text-sm text-gray-400">{result.settings.model} · {result.settings.language} · {result.settings.output}</p>
              </div>
            </div>
            <Button asChild variant="outline" className="border-[#A1C6CF]/40 bg-transparent text-[#D7EEF2] hover:bg-[#5BA3B8]/15 hover:text-white">
              <a href={result.url} download={result.fileName} target="_blank" rel="noreferrer">
                <Download className="mr-2 h-4 w-4" /> Download MP3
              </a>
            </Button>
          </div>
          <audio
            controls
            src={result.url}
            className="w-full"
            preload="metadata"
            onError={() => setPlaybackError("The MP3 could not be played in this browser. Use Download MP3 to open the verified audio file directly.")}
          >
            Your browser does not support audio playback.
          </audio>
          {playbackError && <p role="alert" className="mt-3 text-sm text-amber-200">{playbackError}</p>}
        </section>
      )}
    </div>
  );
}
