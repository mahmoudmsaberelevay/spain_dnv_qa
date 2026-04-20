import { ShieldX } from "lucide-react";

export default function AccessDenied() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0d1117]">
      <div className="flex flex-col items-center gap-6 p-10 max-w-md w-full text-center">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-red-500/10 border border-red-500/30">
          <ShieldX className="h-8 w-8 text-red-400" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">Access Denied</h1>
          <p className="text-sm text-white/50 leading-relaxed">
            This platform is restricted to <span className="text-white/80 font-medium">@elevay.com</span> accounts only.
            Please sign in with your Elevay company email address.
          </p>
        </div>
        <button
          onClick={() => { window.location.href = "/"; }}
          className="mt-2 px-6 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors border border-white/10"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
