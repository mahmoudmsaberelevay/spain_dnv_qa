import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Deterministic React element-tree harness, following contractDocusignUi.test.ts.
// All tRPC hooks are mocked: no DOM, CRM writes, backend imports or live requests.
const harness = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, pending: false,
  lead: undefined as undefined | { id: number; fullName: string; stage: string; linkedContract: null | { contractCode: string } },
  mutate: vi.fn(), reset: vi.fn(), invalidate: vi.fn(), close: vi.fn(), toastError: vi.fn(),
}));

vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = typeof initial === "function" ? initial() : initial;
    return [harness.slots[index], (next: unknown) => {
      harness.slots[index] = typeof next === "function" ? next(harness.slots[index]) : next;
    }];
  },
}));
vi.mock("sonner", () => ({ toast: { error: harness.toastError, success: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ contracting: {
      contracts: { list: { invalidate: harness.invalidate } },
      analytics: { stats: { invalidate: harness.invalidate }, recentContracts: { invalidate: harness.invalidate } },
    } }),
    contracting: { contracts: {
      getCountries: { useQuery: () => ({ data: [
        { key: "spain", label: "Spain Digital Nomad Visa" },
        { key: "dominica", label: "Dominica Citizenship" },
        { key: "egypt", label: "Egypt Citizenship" },
      ] }) },
      getConsultants: { useQuery: () => ({ data: [{ id: 1, name: "Synthetic Consultant" }], isLoading: false }) },
      getMarketingLead: { useQuery: () => ({ data: harness.lead, isFetching: false, isError: false }) },
      create: { useMutation: () => ({ mutate: harness.mutate, reset: harness.reset, isPending: harness.pending }) },
    } },
  },
}));

import NewContractDialog from "../client/src/components/NewContractDialog";
import { formatCurrency } from "../client/src/lib/utils";

type Node = { type?: unknown; props?: Record<string, any> };
function render(): Node {
  harness.cursor = 0;
  return NewContractDialog({ open: true, onClose: harness.close }) as Node;
}
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Node;
  return [node, ...nodes(node.props?.children)];
}
function text(tree: unknown): string {
  if (tree == null || typeof tree === "boolean") return "";
  if (Array.isArray(tree)) return tree.map(text).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  return text((tree as Node).props?.children);
}
function field(id: string, tree = render()): Node {
  const found = nodes(tree).find(node => node.props?.id === id && typeof node.props.onChange === "function");
  expect(found, `Missing input ${id}`).toBeDefined();
  return found!;
}
function change(id: string, value: string): void {
  field(id).props!.onChange({ target: { value } });
}
function select(id: string, value: string): void {
  const root = nodes(render()).find(node => typeof node.props?.onValueChange === "function" && nodes(node.props.children).some(child => child.props?.id === id));
  expect(root, `Missing select ${id}`).toBeDefined();
  root!.props!.onValueChange(value);
}
function setCurrency(value: "EUR" | "USD"): void {
  const root = nodes(render()).find(node => typeof node.props?.onValueChange === "function" && nodes(node.props.children).some(child => child.props?.["aria-label"] === "Contract currency"));
  expect(root).toBeDefined();
  root!.props!.onValueChange(value);
}
function submitButton(tree = render()): Node {
  const found = nodes(tree).find(node => node.props?.type === "submit");
  expect(found).toBeDefined();
  return found!;
}
function submit(): void {
  const form = nodes(render()).find(node => node.type === "form");
  expect(form).toBeDefined();
  // Deliberately call the form handler even if the button is disabled/native validation
  // would block submission, proving the component independently guards its mutation.
  form!.props!.onSubmit({ preventDefault: vi.fn() });
}
function previewRow(label: string): string {
  const row = nodes(render()).find(node => node.type === "div" && nodes(node.props?.children).some(child => child.type === "dt" && text(child) === label));
  expect(row, `Missing preview row ${label}`).toBeDefined();
  return text(row);
}
function fillRequired(members = "5"): void {
  change("clientName", "Synthetic Arabic Name");
  change("invoicingName", "Synthetic English Name");
  change("clientMobile", "+201000000000");
  change("familyMembers", members);
  select("consultantName", "Synthetic Consultant");
  select("clientOrigin", "referral");
}
function cancel(): void {
  const button = nodes(render()).find(node => typeof node.props?.onClick === "function" && text(node) === "Cancel");
  expect(button).toBeDefined();
  button!.props!.onClick();
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.slots = []; harness.cursor = 0; harness.pending = false; harness.lead = undefined;
});

describe("contract creation discount mutation and preview", () => {
  it("does not write on render and submits an omitted discount for the unchanged no-discount flow", () => {
    render();
    expect(harness.mutate).not.toHaveBeenCalled();
    expect(field("discountValue").props!.value).toBe("");
    fillRequired();
    expect(submitButton().props!.disabled).toBe(false);
    submit();
    expect(harness.mutate).toHaveBeenCalledOnce();
    expect(harness.mutate).toHaveBeenCalledWith(expect.objectContaining({
      discountValue: undefined, currency: "EUR", contractValueOverride: undefined,
      country: "spain", familyMembers: 5, clientOrigin: "referral", marketingLeadId: null,
    }));
    expect(previewRow("Net Contract Value")).toContain(formatCurrency(15000, "EUR"));
  });

  it("submits numeric 5000 for Spain 15000 original and previews 10000 net", () => {
    fillRequired();
    change("discountValue", "5000");
    expect(field("discountValue").props!.value).toBe("5000");
    expect(submitButton().props!.disabled).toBe(false);
    expect(previewRow("Original Contract Value")).toContain(formatCurrency(15000, "EUR"));
    expect(previewRow("Discount")).toContain(formatCurrency(5000, "EUR"));
    expect(previewRow("Net Contract Value")).toContain(formatCurrency(10000, "EUR"));
    submit();
    expect(harness.mutate).toHaveBeenCalledOnce();
    expect(harness.mutate).toHaveBeenCalledWith(expect.objectContaining({ discountValue: 5000, currency: "EUR" }));
    expect(typeof harness.mutate.mock.calls[0][0].discountValue).toBe("number");
  });

  it.each([["1", 12000], ["2", 13000], ["3", 14000], ["4", 14000], ["5", 15000], ["9", 15000]])(
    "uses the Spain family ladder for %s members", (members, original) => {
      fillRequired(members);
      change("discountValue", "0.01");
      expect(previewRow("Original Contract Value")).toContain(formatCurrency(original, "EUR"));
      expect(previewRow("Net Contract Value")).toContain(formatCurrency((original * 100 - 1) / 100, "EUR"));
      submit();
      expect(harness.mutate).toHaveBeenCalledWith(expect.objectContaining({ familyMembers: Number(members), discountValue: 0.01, currency: "EUR" }));
    },
  );

  it.each(["0", "0.00", "15000", "15000.00"])("accepts boundary discount %s including fully discounted contracts", discount => {
    fillRequired(); change("discountValue", discount);
    expect(submitButton().props!.disabled).toBe(false);
    submit();
    expect(harness.mutate).toHaveBeenCalledWith(expect.objectContaining({ discountValue: Number(discount) }));
    if (Number(discount) === 15000) expect(previewRow("Net Contract Value")).toContain(formatCurrency(0, "EUR"));
  });

  it.each(["EUR", "USD"] as const)("submits manual original and discount in %s with no FX conversion", currency => {
    fillRequired(); select("programCountry", "dominica"); setCurrency(currency);
    change("contractValueOverride", "15000"); change("discountValue", "5000.25");
    expect(previewRow("Original Contract Value")).toContain(formatCurrency(15000, currency));
    expect(previewRow("Discount")).toContain(formatCurrency(5000.25, currency));
    expect(previewRow("Net Contract Value")).toContain(formatCurrency(9999.75, currency));
    submit();
    expect(harness.mutate).toHaveBeenCalledWith(expect.objectContaining({ country: "dominica", currency, contractValueOverride: 15000, discountValue: 5000.25 }));
  });

  it("rounds the manual original before guarding or subtracting discount cents", () => {
    fillRequired(); select("programCountry", "egypt");
    change("contractValueOverride", "1.005"); change("discountValue", "1.01");
    expect(previewRow("Original Contract Value")).toContain(formatCurrency(1.01, "EUR"));
    expect(previewRow("Net Contract Value")).toContain(formatCurrency(0, "EUR"));
    expect(submitButton().props!.disabled).toBe(false);
    submit();
    expect(harness.mutate).toHaveBeenCalledWith(expect.objectContaining({ contractValueOverride: 1.005, discountValue: 1.01 }));
    harness.mutate.mockClear();
    change("discountValue", "1.02"); submit();
    expect(harness.mutate).not.toHaveBeenCalled();
  });

  it("keeps integer-cent arithmetic for decimal manual values", () => {
    fillRequired(); select("programCountry", "egypt");
    change("contractValueOverride", "100.129"); change("discountValue", "0.13");
    expect(previewRow("Original Contract Value")).toContain(formatCurrency(100.13, "EUR"));
    expect(previewRow("Net Contract Value")).toContain(formatCurrency(100, "EUR"));
    change("contractValueOverride", "0.3"); change("discountValue", "0.1");
    expect(previewRow("Net Contract Value")).toContain(formatCurrency(0.2, "EUR"));
  });

  it("preserves the optional blank manual original as zero and blocks a positive discount", () => {
    fillRequired(); select("programCountry", "dominica");
    expect(submitButton().props!.disabled).toBe(false);
    expect(previewRow("Original Contract Value")).toContain(formatCurrency(0, "EUR"));
    submit();
    expect(harness.mutate).toHaveBeenCalledWith(expect.objectContaining({ contractValueOverride: undefined, discountValue: undefined }));
    harness.mutate.mockClear(); change("discountValue", "0.01"); submit();
    expect(submitButton().props!.disabled).toBe(true);
    expect(harness.mutate).not.toHaveBeenCalled();
  });
});

describe("discount invalid-write and accessibility guards", () => {
  it.each(["-1", "-0.01", "NaN", "Infinity", "1e309", "abc", "1.234", "0.001", "15000.01", " ", "1e3", "0x10", "0.000"])(
    "blocks invalid discount %j even on direct form submission", discount => {
      fillRequired(); change("discountValue", discount);
      expect(submitButton().props!.disabled).toBe(true);
      expect(field("discountValue").props!["aria-invalid"]).toBe(true);
      expect(field("discountValue").props!["aria-describedby"]).toContain("discountError");
      const error = nodes(render()).find(node => node.props?.id === "discountError");
      expect(error?.props?.role).toBe("alert");
      expect(text(error)).toMatch(/Discount|discount/);
      expect(previewRow("Net Contract Value")).toContain("—");
      submit();
      expect(harness.mutate).not.toHaveBeenCalled();
      expect(harness.toastError).toHaveBeenCalledOnce();
    },
  );

  it.each(["-1", "NaN", "Infinity", "1e309", "10000000000000000"])("blocks invalid manual original %s", original => {
    fillRequired(); select("programCountry", "dominica"); change("contractValueOverride", original);
    expect(submitButton().props!.disabled).toBe(true);
    expect(field("contractValueOverride").props!["aria-invalid"]).toBe(true);
    expect(nodes(render()).find(node => node.props?.id === "contractValueError")?.props?.role).toBe("alert");
    submit(); expect(harness.mutate).not.toHaveBeenCalled();
  });

  it("revalidates on family size or manual original reduction and recovers after correction", () => {
    fillRequired(); change("discountValue", "14500");
    expect(submitButton().props!.disabled).toBe(false);
    change("familyMembers", "1");
    expect(submitButton().props!.disabled).toBe(true);
    submit(); expect(harness.mutate).not.toHaveBeenCalled();
    change("discountValue", "500");
    expect(submitButton().props!.disabled).toBe(false);
    expect(field("discountValue").props!["aria-invalid"]).toBe(false);
    select("programCountry", "dominica");
    change("contractValueOverride", "1000"); change("discountValue", "500");
    change("contractValueOverride", "400");
    submit(); expect(harness.mutate).not.toHaveBeenCalled();
    change("discountValue", "400"); submit();
    expect(harness.mutate).toHaveBeenCalledWith(expect.objectContaining({ contractValueOverride: 400, discountValue: 400 }));
  });

  it.each(["", "0", "-1", "1.5", "NaN", "Infinity"])("never creates a contract for invalid family size %j", family => {
    fillRequired(family); change("discountValue", "0");
    expect(submitButton().props!.disabled).toBe(true);
    submit(); expect(harness.mutate).not.toHaveBeenCalled();
  });

  it("does not let a valid discount bypass marketing lead verification or an existing active contract", () => {
    fillRequired(); change("discountValue", "5000"); select("clientOrigin", "marketing"); change("marketingLeadId", "12");
    submit(); expect(harness.mutate).not.toHaveBeenCalled();
    harness.lead = { id: 12, fullName: "Synthetic Lead", stage: "New", linkedContract: { contractCode: "SYNTHETIC-001" } };
    submit(); expect(harness.mutate).not.toHaveBeenCalled();
    harness.lead = { ...harness.lead, linkedContract: null };
    expect(submitButton().props!.disabled).toBe(false);
    submit(); expect(harness.mutate).toHaveBeenCalledWith(expect.objectContaining({ clientOrigin: "marketing", marketingLeadId: 12, discountValue: 5000 }));
  });

  it("does not write while a mutation is pending", () => {
    fillRequired(); change("discountValue", "5000"); harness.pending = true;
    expect(submitButton().props!.disabled).toBe(true);
    expect(field("discountValue").props!.disabled).toBe(true);
    submit(); expect(harness.mutate).not.toHaveBeenCalled();
  });

  it("labels the optional discount and announces the live original/discount/net preview", () => {
    fillRequired();
    expect(nodes(render()).find(node => node.props?.htmlFor === "discountValue")).toBeDefined();
    expect(field("discountValue").props!.inputMode).toBe("decimal");
    expect(field("discountValue").props!["aria-describedby"]).toBe("discountHelp");
    const live = nodes(render()).find(node => node.props?.role === "status");
    expect(live?.props?.["aria-live"]).toBe("polite");
    expect(live?.props?.["aria-atomic"]).toBe("true");
    for (const label of ["Original Contract Value", "Discount", "Net Contract Value"]) expect(text(live)).toContain(label);
  });
});

describe("discount resets, currency transitions, and mobile-safe layout", () => {
  it("resets discount on program changes and forces EUR when returning from a USD program to Spain", () => {
    fillRequired(); change("discountValue", "5000"); select("programCountry", "dominica");
    expect(field("discountValue").props!.value).toBe("");
    setCurrency("USD"); change("contractValueOverride", "10000"); change("discountValue", "500");
    select("programCountry", "spain");
    expect(field("discountValue").props!.value).toBe("");
    expect(previewRow("Original Contract Value")).toContain(formatCurrency(15000, "EUR"));
    change("discountValue", "5000"); submit();
    expect(harness.mutate).toHaveBeenCalledWith(expect.objectContaining({ country: "spain", currency: "EUR", discountValue: 5000, contractValueOverride: undefined }));
    select("programCountry", "egypt");
    expect(field("contractValueOverride").props!.value).toBe("");
    expect(previewRow("Discount")).toContain(formatCurrency(0, "EUR"));
  });

  it("resets discount, currency and fields on explicit cancel", () => {
    fillRequired(); select("programCountry", "dominica"); setCurrency("USD");
    change("contractValueOverride", "10000"); change("discountValue", "1000");
    cancel();
    expect(harness.close).toHaveBeenCalledOnce();
    expect(harness.reset).toHaveBeenCalledOnce();
    expect(field("discountValue").props!.value).toBe("");
    expect(field("clientName").props!.value).toBe("");
    expect(field("familyMembers").props!.value).toBe("");
    expect(text(render())).toContain("Discount ( EUR )");
    expect(submitButton().props!.disabled).toBe(true);
  });

  it("resets discount on dialog dismissal but not on an open event", () => {
    fillRequired(); change("discountValue", "5000");
    render().props!.onOpenChange(true);
    expect(field("discountValue").props!.value).toBe("5000");
    expect(harness.close).not.toHaveBeenCalled();
    render().props!.onOpenChange(false);
    expect(field("discountValue").props!.value).toBe("");
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it("uses an 85dvh scrolling dialog, shrinkable manual amount controls and wrapping preview rows", () => {
    select("programCountry", "dominica");
    const modal = nodes(render()).find(node => String(node.props?.className).includes("max-h-[85dvh]"));
    expect(modal).toBeDefined();
    for (const token of ["overflow-y-auto", "overflow-x-hidden", "min-w-0", "p-4", "sm:p-6"]) expect(modal!.props!.className).toContain(token);
    expect(field("contractValueOverride").props!.className).toContain("min-w-0");
    const live = nodes(render()).find(node => node.props?.role === "status");
    expect(nodes(live).filter(node => node.type === "dt")).toHaveLength(3);
    expect(nodes(live).filter(node => node.type === "div" && String(node.props?.className).includes("flex-wrap"))).toHaveLength(3);
  });

  it("keeps discount math client-only without backend helpers or raw requests", () => {
    const source = readFileSync(new URL("../client/src/components/NewContractDialog.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["'][^"']*(?:server\/|contractCreationPricing)/);
    expect(source).not.toMatch(/\bfetch\(|axios|createTransaction|applyContractDiscount/);
    expect(source).not.toContain('{formatCurrency(Number(contractValueOverride), currency)} will be recorded');
    expect(source).toContain("The net amount will be recorded as the contract value.");
  });
});
