import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  value: string; // finClientId as string, or "" for none
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function ClientSearchCombobox({ value, onChange, placeholder = "Search by name or code...", className }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: allClients } = trpc.financial.clients.list.useQuery();

  // Find the currently selected client label
  const selectedLabel = useMemo(() => {
    if (!value || value === "none" || !allClients) return "";
    const c = allClients.find((c: any) => String(c.id) === value);
    if (!c) return "";
    return c.clientCode ? `[${c.clientCode}] ${c.name}` : c.name;
  }, [value, allClients]);

  // Filter clients by query (matches name or clientCode)
  const filtered = useMemo(() => {
    if (!allClients) return [];
    const q = query.trim().toLowerCase();
    if (!q) return allClients.slice(0, 50); // show first 50 when no query
    return allClients.filter((c: any) => {
      const nameMatch = c.name?.toLowerCase().includes(q);
      const codeMatch = c.clientCode?.toLowerCase().includes(q);
      return nameMatch || codeMatch;
    }).slice(0, 50);
  }, [allClients, query]);

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

  function handleSelect(clientId: string) {
    onChange(clientId);
    setQuery("");
    setOpen(false);
  }

  function handleClear() {
    onChange("none");
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          value={open ? query : selectedLabel}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); if (selectedLabel) setQuery(""); }}
          placeholder={placeholder}
          className="pr-8"
        />
        {(value && value !== "none") && (
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
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover shadow-md">
          {/* None option */}
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onMouseDown={() => handleClear()}
          >
            — None —
          </button>

          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No clients found</div>
          )}

          {filtered.map((c: any) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => handleSelect(String(c.id))}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2",
                String(c.id) === value && "bg-accent/50 font-medium"
              )}
            >
              {c.clientCode && (
                <span className="font-mono text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
                  {c.clientCode}
                </span>
              )}
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
