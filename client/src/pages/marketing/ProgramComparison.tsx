import { BarChart2, Construction } from "lucide-react";

export default function ProgramComparison() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-900/40 flex items-center justify-center mb-4">
        <BarChart2 className="w-8 h-8 text-blue-400" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">Program Enhanced Comparison</h1>
      <p className="text-gray-400 max-w-md mb-6">
        Compare multiple citizenship and residency programs side-by-side with detailed criteria, costs, timelines, and benefits.
      </p>
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800 text-gray-400 text-sm">
        <Construction className="w-4 h-4" />
        Coming Soon
      </div>
    </div>
  );
}
