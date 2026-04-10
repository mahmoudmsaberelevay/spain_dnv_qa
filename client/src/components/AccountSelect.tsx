import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Account {
  id: number;
  name: string;
  currency: string;
  isActive?: boolean;
  logoUrl?: string | null;
}

interface AccountSelectProps {
  accounts: Account[] | undefined;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** If true, only show active accounts */
  activeOnly?: boolean;
  /** If true, show currency in label */
  showCurrency?: boolean;
  className?: string;
}

function AccountOption({ account, showCurrency }: { account: Account; showCurrency?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      {account.logoUrl ? (
        <img
          src={account.logoUrl}
          alt={account.name}
          className="h-5 w-5 rounded object-contain flex-shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <span className="h-5 w-5 rounded bg-muted flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-muted-foreground">
          {account.name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="truncate">
        {account.name}
        {showCurrency && <span className="text-muted-foreground ml-1">({account.currency})</span>}
      </span>
    </span>
  );
}

export default function AccountSelect({
  accounts,
  value,
  onValueChange,
  placeholder = "Select account",
  activeOnly = false,
  showCurrency = true,
  className,
}: AccountSelectProps) {
  const filtered = activeOnly
    ? (accounts ?? []).filter((a) => a.isActive !== false)
    : (accounts ?? []);

  // Find the selected account for the trigger display
  const selected = filtered.find((a) => String(a.id) === value);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        {selected ? (
          <AccountOption account={selected} showCurrency={showCurrency} />
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>
      <SelectContent>
        {filtered.map((a) => (
          <SelectItem key={a.id} value={String(a.id)}>
            <AccountOption account={a} showCurrency={showCurrency} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
