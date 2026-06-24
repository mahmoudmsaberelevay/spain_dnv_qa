import { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ContractOption {
  id: number;
  contractCode: string;
  clientName: string;
  invoicingName?: string | null;
  status: string;
}

interface Props {
  value: string; // contractId as string, or "" for none
  onChange: (value: string) => void;
  contracts: ContractOption[];
  placeholder?: string;
  className?: string;
}

export function ContractSearchCombobox({
  value,
  onChange,
  contracts,
  placeholder = "Type client name or contract code...",
  className,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find the currently selected contract label
  const selectedLabel = useMemo(() => {
    if (!value) return "";
    const c = contracts.find((c) => String(c.id) === value);
    if (!c) return "";
    const displayName = c.invoicingName || c.clientName;
    return `[${c.contractCode}] ${displayName}`;
  }, [value, contracts]);

  // Filter contracts by query (matches client name, invoicing name, or contract code)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contracts.slice(0, 60);
    return contracts
      .filter((c) => {
        const nameMatch = c.clientName?.toLowerCase().includes(q);
        const invoicingMatch = c.invoicingName?.toLowerCase().includes(q);
        const codeMatch = c.contractCode?.toLowerCase().includes(q);
        return nameMatch || invoicingMatch || codeMatch;
      })
      .slice(0, 60);
  }, [contracts, query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(contractId: string) {
    onChange(contractId);
    setQuery("");
    setOpen(false);
  }

  function handleClear() {
    onChange("");
    setQuery("");
    setOpen(false);
  }

  const statusBadge = (status: string) => {
    if (status === "signed") return <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Signed</span>;
    if (status === "pending") return <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Pending</span>;
    if (status === "cancelled") return <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Cancelled</span>;
    return null;
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          value={open ? query : selectedLabel}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            if (selectedLabel) setQuery("");
          }}
          placeholder={placeholder}
          className="pr-8 h-10"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm leading-none"
            aria-label="Clear selection"
          >
            ✕
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No contracts found</div>
          )}
          {filtered.map((c) => {
            const displayName = c.invoicingName || c.clientName;
            return (
              <button
                key={c.id}
                type="button"
                onMouseDown={() => handleSelect(String(c.id))}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2",
                  String(c.id) === value && "bg-accent/50 font-medium"
                )}
              >
                <span className="font-mono text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
                  {c.contractCode}
                </span>
                <span className="truncate flex-1">{displayName}</span>
                {statusBadge(c.status)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
