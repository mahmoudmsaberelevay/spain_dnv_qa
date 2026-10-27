import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { FINANCIAL_REPORT_ALL_TIME_LABEL } from "@shared/financialDateRange";
import {
  getFinancialDatePresetRange,
  matchFinancialDatePreset,
  type FinancialDatePreset,
} from "@shared/financialDatePresets";

export type SortField = "transactionDate" | "amount" | "description" | "type";
export type SortDir = "asc" | "desc";

export interface FinFilters {
  from?: Date;
  to?: Date;
  accountId?: number;
  fromAccountId?: number;
  toAccountId?: number;
  categoryId?: number;
  employeeId?: number;
  finClientId?: number;
  descriptionSearch?: string;
  sortField?: SortField;
  sortDir?: SortDir;
}

interface Props {
  filters: FinFilters;
  onChange: (f: FinFilters) => void;
  /** Which filter controls to show */
  show?: {
    dateRange?: boolean;
    account?: boolean;
    fromAccount?: boolean;
    toAccount?: boolean;
    category?: boolean;
    employee?: boolean;
    client?: boolean;
    sort?: boolean;
    descriptionSearch?: boolean;
  };
  /** Which sort columns to offer */
  sortColumns?: { label: string; value: SortField }[];
}

const DEFAULT_SORT_COLS: { label: string; value: SortField }[] = [
  { label: "Date", value: "transactionDate" },
  { label: "Amount", value: "amount" },
  { label: "Description", value: "description" },
];

const DATE_PRESETS: { value: FinancialDatePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

function accountLabel(account: { name: string; currency: string }) {
  return `${account.name} (${account.currency})`;
}

export default function FinFilterBar({ filters, onChange, show = {}, sortColumns }: Props) {
  const showAll = Object.keys(show).length === 0;
  const s = {
    dateRange: show.dateRange ?? showAll,
    account: show.account ?? showAll,
    fromAccount: show.fromAccount ?? false,
    toAccount: show.toAccount ?? false,
    category: show.category ?? showAll,
    employee: show.employee ?? showAll,
    client: show.client ?? showAll,
    sort: show.sort ?? showAll,
    descriptionSearch: show.descriptionSearch ?? showAll,
  };

  const { data: accounts } = trpc.financial.accounts.list.useQuery(undefined, {
    enabled: s.account || s.fromAccount || s.toAccount,
  });
  const { data: categories } = trpc.financial.categories.list.useQuery(undefined, { enabled: s.category });
  const { data: employees } = trpc.financial.employees.list.useQuery(undefined, { enabled: s.employee });
  const { data: clientsData } = trpc.financial.clients.list.useQuery({ limit: 500 }, { enabled: s.client });

  const [clientSearch, setClientSearch] = useState("");
  const [isCustomDateRange, setIsCustomDateRange] = useState(false);

  const cols = sortColumns ?? DEFAULT_SORT_COLS;
  const derivedPreset = useMemo(
    () => matchFinancialDatePreset({ from: filters.from, to: filters.to }),
    [filters.from, filters.to],
  );
  const selectedDatePreset = isCustomDateRange ? "custom" : derivedPreset;
  const hasFilters = !!(
    filters.from || filters.to || filters.accountId || filters.fromAccountId || filters.toAccountId
    || filters.categoryId || filters.employeeId || filters.finClientId || filters.descriptionSearch
  );

  const clearAll = () => {
    setIsCustomDateRange(false);
    onChange({ sortField: filters.sortField, sortDir: filters.sortDir });
  };

  const selectDatePreset = (value: FinancialDatePreset) => {
    if (value === "custom") {
      setIsCustomDateRange(true);
      return;
    }
    setIsCustomDateRange(false);
    onChange({ ...filters, ...getFinancialDatePresetRange(value) });
  };

  const selectFrom = (date?: Date) => {
    setIsCustomDateRange(true);
    if (date && filters.to && date > filters.to) {
      onChange({ ...filters, from: date, to: date });
      return;
    }
    onChange({ ...filters, from: date });
  };

  const selectTo = (date?: Date) => {
    setIsCustomDateRange(true);
    if (date && filters.from && date < filters.from) {
      onChange({ ...filters, from: date, to: date });
      return;
    }
    onChange({ ...filters, to: date });
  };

  const toggleSort = (field: SortField) => {
    if (filters.sortField === field) {
      onChange({ ...filters, sortDir: filters.sortDir === "asc" ? "desc" : "asc" });
    } else {
      onChange({ ...filters, sortField: field, sortDir: "desc" });
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (filters.sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
    return filters.sortDir === "asc"
      ? <ArrowUp className="h-3.5 w-3.5 text-primary" />
      : <ArrowDown className="h-3.5 w-3.5 text-primary" />;
  };

  const allClients = Array.isArray(clientsData) ? clientsData : [];
  const filteredClients = allClients.filter((c: { id: number; name: string; clientCode?: string | null }) =>
    !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()) || (c.clientCode ?? "").toLowerCase().includes(clientSearch.toLowerCase()),
  ).slice(0, 50);

  const renderAccountSelect = (
    label: string,
    value: number | undefined,
    onValueChange: (value: number | undefined) => void,
  ) => (
    <Select value={value ? String(value) : "all"} onValueChange={v => onValueChange(v === "all" ? undefined : Number(v))}>
      <SelectTrigger className={cn("h-8 text-xs w-48", value && "border-primary text-primary")}>
        <SelectValue placeholder={`All ${label.toLowerCase()}s`} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label.toLowerCase()}s</SelectItem>
        {accounts?.map(account => (
          <SelectItem key={account.id} value={String(account.id)}>{accountLabel(account)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {s.dateRange && (
          <>
            <Select value={selectedDatePreset} onValueChange={value => selectDatePreset(value as FinancialDatePreset)}>
              <SelectTrigger className={cn("h-8 text-xs w-36", selectedDatePreset !== "all" && "border-primary text-primary")}>
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map(preset => <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {selectedDatePreset === "custom" && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("gap-1.5 text-xs", filters.from && "border-primary text-primary")}>
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {filters.from ? format(filters.from, "dd MMM yyyy") : "From date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={filters.from} onSelect={selectFrom} initialFocus />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("gap-1.5 text-xs", filters.to && "border-primary text-primary")}>
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {filters.to ? format(filters.to, "dd MMM yyyy") : "To date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={filters.to} onSelect={selectTo} initialFocus />
                  </PopoverContent>
                </Popover>
              </>
            )}
          </>
        )}

        {s.account && renderAccountSelect("Account", filters.accountId, accountId => onChange({ ...filters, accountId }))}
        {s.fromAccount && renderAccountSelect("From account", filters.fromAccountId, fromAccountId => onChange({ ...filters, fromAccountId }))}
        {s.toAccount && renderAccountSelect("To account", filters.toAccountId, toAccountId => onChange({ ...filters, toAccountId }))}

        {s.category && categories && (
          <Select value={filters.categoryId ? String(filters.categoryId) : "all"} onValueChange={v => onChange({ ...filters, categoryId: v === "all" ? undefined : Number(v) })}>
            <SelectTrigger className={cn("h-8 text-xs w-44", filters.categoryId && "border-primary text-primary")}>
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {s.employee && employees && (
          <Select value={filters.employeeId ? String(filters.employeeId) : "all"} onValueChange={v => onChange({ ...filters, employeeId: v === "all" ? undefined : Number(v) })}>
            <SelectTrigger className={cn("h-8 text-xs w-44", filters.employeeId && "border-primary text-primary")}>
              <SelectValue placeholder="All employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {employees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {s.client && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("text-xs w-44 justify-between", filters.finClientId && "border-primary text-primary")}>
                <span className="truncate">
                  {filters.finClientId
                    ? allClients.find((c: { id: number; name: string }) => c.id === filters.finClientId)?.name ?? "Client selected"
                    : "All clients"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <Input placeholder="Search client..." value={clientSearch} onChange={e => setClientSearch(e.target.value)} className="h-7 text-xs mb-2" />
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                <button className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted" onClick={() => onChange({ ...filters, finClientId: undefined })}>All clients</button>
                {filteredClients.map(c => (
                  <button key={c.id} className={cn("w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted", filters.finClientId === c.id && "bg-primary/10 text-primary font-medium")} onClick={() => onChange({ ...filters, finClientId: c.id })}>
                    {c.clientCode && <span className="text-muted-foreground mr-1">{c.clientCode}</span>}
                    {c.name}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {s.descriptionSearch && (
          <div className="relative">
            <Input placeholder="Search description..." value={filters.descriptionSearch ?? ""} onChange={e => onChange({ ...filters, descriptionSearch: e.target.value || undefined })} className={cn("h-8 text-xs w-52 pl-7", filters.descriptionSearch && "border-primary")} />
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            {filters.descriptionSearch && <button className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => onChange({ ...filters, descriptionSearch: undefined })}><X className="h-3 w-3" /></button>}
          </div>
        )}

        {hasFilters && <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground" onClick={clearAll}><X className="h-3.5 w-3.5" /> Clear filters</Button>}
        {s.dateRange && (
          <span className="text-xs text-muted-foreground" data-testid="financial-filter-period">
            Period: {filters.from || filters.to
              ? `${filters.from ? format(filters.from, "dd MMM yyyy") : "Beginning"} → ${filters.to ? format(filters.to, "dd MMM yyyy") : "Today"}`
              : FINANCIAL_REPORT_ALL_TIME_LABEL}
          </span>
        )}
      </div>

      {s.sort && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Sort:</span>
          {cols.map(col => (
            <Button key={col.value} variant="ghost" size="sm" className={cn("h-7 text-xs gap-1 px-2", filters.sortField === col.value && "bg-primary/10 text-primary")} onClick={() => toggleSort(col.value)}>
              {col.label}<SortIcon field={col.value} />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
