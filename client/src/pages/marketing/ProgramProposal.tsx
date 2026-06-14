import { Send, Construction } from "lucide-react";

export default function ProgramProposal() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-purple-900/40 flex items-center justify-center mb-4">
        <Send className="w-8 h-8 text-purple-400" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">Program Proposal</h1>
      <p className="text-gray-400 max-w-md mb-6">
        Generate tailored program proposals for clients based on their profile, budget, and goals. Export as branded PDF documents.
      </p>
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800 text-gray-400 text-sm">
        <Construction className="w-4 h-4" />
        Coming Soon
      </div>
    </div>
  );
}
