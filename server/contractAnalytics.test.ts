import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Inline implementations (no DB) ──────────────────────────────────────────
// We test the pure filtering/aggregation logic by replicating it here so we
// don't need a live database connection in CI.

type ContractRow = {
  id: number;
  contractCode: string;
  clientName: string;
  contractValue: string | number;
  discountValue?: string | number | null;
  familyMembers: number;
  consultantName?: string | null;
  status: "pending" | "signed" | "cancelled";
  createdAt: Date | null;
};

function filterContracts(
  all: ContractRow[],
  consultantName?: string,
  dateFrom?: Date,
  dateTo?: Date
) {
  let rows = [...all];
  if (consultantName) rows = rows.filter((c) => c.consultantName === consultantName);
  if (dateFrom) rows = rows.filter((c) => c.createdAt && new Date(c.createdAt) >= dateFrom);
  if (dateTo) rows = rows.filter((c) => c.createdAt && new Date(c.createdAt) <= dateTo);
  return rows;
}

function monthlyRevenue(
  all: ContractRow[],
  year: number,
  consultantName?: string
): { month: number; value: number }[] {
  let rows = all.filter((c) => c.status === "signed");
  if (consultantName) rows = rows.filter((c) => c.consultantName === consultantName);
  const monthly: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) monthly[m] = 0;
  for (const c of rows) {
    if (!c.createdAt) continue;
    const d = new Date(c.createdAt);
    if (d.getFullYear() === year) {
      monthly[d.getMonth() + 1] += Number(c.contractValue);
    }
  }
  return Object.entries(monthly).map(([month, value]) => ({ month: Number(month), value }));
}

// ─── Test data ────────────────────────────────────────────────────────────────
const ROWS: ContractRow[] = [
  {
    id: 1,
    contractCode: "2600001",
    clientName: "Ahmed Ali",
    contractValue: "3000",
    familyMembers: 3,
    consultantName: "Fouad Abdo",
    status: "signed",
    createdAt: new Date("2026-01-15"),
  },
  {
    id: 2,
    contractCode: "2600002",
    clientName: "Sara Hassan",
    contractValue: "2500",
    familyMembers: 2,
    consultantName: "Kirlos Nabil",
    status: "signed",
    createdAt: new Date("2026-01-20"),
  },
  {
    id: 3,
    contractCode: "2600003",
    clientName: "Mohamed Khaled",
    contractValue: "4000",
    familyMembers: 4,
    consultantName: "Fouad Abdo",
    status: "signed",
    createdAt: new Date("2026-03-10"),
  },
  {
    id: 4,
    contractCode: "2600004",
    clientName: "Nour Ibrahim",
    contractValue: "1500",
    familyMembers: 1,
    consultantName: "Kirlos Nabil",
    status: "pending",
    createdAt: new Date("2026-02-05"),
  },
  {
    id: 5,
    contractCode: "2600005",
    clientName: "Layla Samir",
    contractValue: "3500",
    familyMembers: 3,
    consultantName: "Fouad Abdo",
    status: "cancelled",
    createdAt: new Date("2025-12-01"),
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("filterContracts", () => {
  it("returns all rows when no filters applied", () => {
    expect(filterContracts(ROWS)).toHaveLength(5);
  });

  it("filters by consultantName", () => {
    const result = filterContracts(ROWS, "Fouad Abdo");
    expect(result).toHaveLength(3);
    expect(result.every((c) => c.consultantName === "Fouad Abdo")).toBe(true);
  });

  it("filters by dateFrom", () => {
    const result = filterContracts(ROWS, undefined, new Date("2026-02-01"));
    // Rows on or after Feb 1 2026: ids 4, 3
    expect(result).toHaveLength(2);
  });

  it("filters by dateTo", () => {
    const result = filterContracts(ROWS, undefined, undefined, new Date("2026-01-31"));
    // Rows on or before Jan 31 2026: ids 1, 2, 5
    expect(result).toHaveLength(3);
  });

  it("filters by both dateFrom and dateTo", () => {
    const result = filterContracts(
      ROWS,
      undefined,
      new Date("2026-01-01"),
      new Date("2026-01-31")
    );
    // Only January 2026: ids 1, 2
    expect(result).toHaveLength(2);
  });

  it("filters by consultant AND date range", () => {
    const result = filterContracts(
      ROWS,
      "Fouad Abdo",
      new Date("2026-01-01"),
      new Date("2026-03-31")
    );
    // Fouad Abdo in Jan–Mar 2026: ids 1, 3
    expect(result).toHaveLength(2);
  });
});

describe("monthlyRevenue", () => {
  it("returns 12 months always", () => {
    const result = monthlyRevenue(ROWS, 2026);
    expect(result).toHaveLength(12);
  });

  it("sums signed contracts by month for the given year", () => {
    const result = monthlyRevenue(ROWS, 2026);
    const jan = result.find((r) => r.month === 1)!;
    const mar = result.find((r) => r.month === 3)!;
    const feb = result.find((r) => r.month === 2)!;
    // Jan: ids 1 (3000) + 2 (2500) = 5500 (both signed)
    expect(jan.value).toBe(5500);
    // Mar: id 3 (4000)
    expect(mar.value).toBe(4000);
    // Feb: id 4 is pending, not counted
    expect(feb.value).toBe(0);
  });

  it("excludes contracts from other years", () => {
    const result = monthlyRevenue(ROWS, 2025);
    // id 5 is cancelled, so no signed contracts in 2025
    const total = result.reduce((s, r) => s + r.value, 0);
    expect(total).toBe(0);
  });

  it("filters by consultant", () => {
    const result = monthlyRevenue(ROWS, 2026, "Fouad Abdo");
    const jan = result.find((r) => r.month === 1)!;
    const mar = result.find((r) => r.month === 3)!;
    // Jan: only id 1 (3000) — Fouad
    expect(jan.value).toBe(3000);
    // Mar: id 3 (4000) — Fouad
    expect(mar.value).toBe(4000);
  });
});
