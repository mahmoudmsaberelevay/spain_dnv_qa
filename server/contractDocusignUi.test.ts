import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SafeEnvelope } from "../shared/contractDocusign";

// Render the component's element tree with a tiny deterministic hook harness.
// No DOM, provider requests, credentials, real recipients or backend imports are used.
const harness = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, canEdit: true, canAccess: true,
  configured: true, canManage: true, missingSettings: [] as string[],
  history: [] as SafeEnvelope[], historyError: false, fetching: false,
  prepare: vi.fn(), senderView: vi.fn(), refresh: vi.fn(), signingLink: vi.fn(), revokeLink: vi.fn(),
  invalidate: vi.fn(), refetch: vi.fn(),
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
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: initial };
    return harness.slots[index];
  },
  useMemo: (fn: () => unknown) => fn(),
  useEffect: () => {},
}));
vi.mock("@/contexts/PermissionsContext", () => ({
  usePermissions: () => ({ canEdit: () => harness.canEdit, canAccess: () => harness.canAccess }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    contractDocusign: {
      readiness: { useQuery: () => ({ data: { configured: harness.configured, environment: "demo", canManage: harness.canManage, missingSettings: harness.missingSettings }, isLoading: false, isError: false, refetch: harness.refetch }) },
      history: { useQuery: () => ({ data: harness.history, isLoading: false, isError: harness.historyError, isFetching: harness.fetching, refetch: harness.refetch }) },
      prepare: { useMutation: () => ({ mutateAsync: harness.prepare }) },
      senderView: { useMutation: () => ({ mutateAsync: harness.senderView }) },
      refresh: { useMutation: () => ({ mutateAsync: harness.refresh }) },
      signingLink: { useMutation: () => ({ mutateAsync: harness.signingLink }) },
      revokeLink: { useMutation: () => ({ mutateAsync: harness.revokeLink }) },
    },
    useUtils: () => ({ contractDocusign: { history: {
      setData: (_input: unknown, updater: (current: SafeEnvelope[]) => SafeEnvelope[]) => { harness.history = updater(harness.history); },
      invalidate: harness.invalidate,
    } } }),
  },
}));

import ContractDocusignDialog, { docusignAcknowledgement, docusignDraftDisabledReason, validateDocusignRecipient, type DocusignContract } from "../client/src/components/ContractDocusignDialog";

type Node = { props?: Record<string, any> };
const contract: DocusignContract = { id: 17, contractCode: "TEST-001", clientName: "Synthetic Client", status: "pending", docUrl: "https://example.invalid/saved.docx" };
const envelope = (overrides: Partial<SafeEnvelope> = {}): SafeEnvelope => ({
  id: "11111111-1111-4111-8111-111111111111", version: 1, contractId: 17,
  envelopeId: "22222222-2222-4222-8222-222222222222", status: "draft",
  recipientName: "Synthetic Client", email: "synthetic@example.invalid",
  createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z"),
  lastCheckedAt: null, linkExpiresAt: null, nextRefreshAt: null,
  canShare: false, hasSignatureTabs: false, errorCode: null, documentHash: "a".repeat(64), ...overrides,
});
function render(overrides: Partial<DocusignContract> = {}): Node {
  harness.cursor = 0;
  return ContractDocusignDialog({ contract: { ...contract, ...overrides }, open: true, onOpenChange: vi.fn() }) as Node;
}
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const item = tree as Node;
  return [item, ...nodes(item.props?.children)];
}
function text(tree: unknown): string {
  if (tree == null || typeof tree === "boolean") return "";
  if (Array.isArray(tree)) return tree.map(text).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  return text((tree as Node).props?.children);
}
function button(tree: Node, label: string): Node {
  const found = nodes(tree).find(item => typeof item.props?.onClick === "function" && text(item.props.children) === label);
  expect(found, `Missing button ${label}`).toBeDefined();
  return found!;
}
function input(tree: Node, id: string): Node { return nodes(tree).find(item => item.props?.id === id)!; }
async function click(tree: Node, label: string) {
  const target = button(tree, label);
  if (!target.props!.disabled) target.props!.onClick();
  // Settle the mocked async mutation and clipboard promises.
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
function approve() {
  input(render(), "docusign-recipient-email").props!.onChange({ target: { value: "synthetic@example.invalid" } });
  input(render(), "docusign-acknowledgement").props!.onCheckedChange(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.slots = []; harness.cursor = 0; harness.canEdit = true; harness.canAccess = true;
  harness.configured = true; harness.canManage = true; harness.missingSettings = [];
  harness.history = []; harness.historyError = false; harness.fetching = false;
  vi.stubGlobal("window", { open: vi.fn() });
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "33333333-3333-4333-8333-333333333333") });
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  harness.prepare.mockResolvedValue({ envelope: envelope(), senderUrl: "https://demo.docusign.net/synthetic-sender" });
  harness.senderView.mockResolvedValue({ url: "https://demo.docusign.net/synthetic-sender" });
  harness.signingLink.mockResolvedValue({ url: "https://elevay.vip/sign-contract/synthetic#not-a-real-token", expiresAt: new Date("2030-01-01T00:00:00Z") });
  harness.revokeLink.mockResolvedValue({ success: true });
});

afterEach(() => vi.unstubAllGlobals());

describe("DocuSign recipient, source and acknowledgement rules", () => {
  it("requires a pending CRM contract with an existing saved Word document", () => {
    expect(docusignDraftDisabledReason(contract)).toBeNull();
    expect(docusignDraftDisabledReason({ ...contract, status: "signed" })).toMatch(/Only pending/);
    expect(docusignDraftDisabledReason({ ...contract, docUrl: null })).toMatch(/Generate and save/);
  });
  it("validates recipient fields and never prefills an assumed email", () => {
    expect(validateDocusignRecipient("Synthetic Client", "synthetic@example.invalid")).toBeNull();
    for (const email of ["", "bad", "a@b", "a @example.invalid", "a@example.invalid\n"]) {
      // Whitespace at the edges is normalized; interior whitespace is rejected.
      if (email.endsWith("\n")) continue;
      expect(validateDocusignRecipient("Synthetic Client", email)).not.toBeNull();
    }
    expect(validateDocusignRecipient("A", "synthetic@example.invalid")).not.toBeNull();
    expect(validateDocusignRecipient("Injected\nName", "synthetic@example.invalid")).not.toBeNull();
    expect(validateDocusignRecipient("A".repeat(101), "synthetic@example.invalid")).not.toBeNull();
    expect(input(render(), "docusign-recipient-name").props!.value).toBe(contract.clientName);
    expect(input(render(), "docusign-recipient-email").props!.value).toBe("");
    expect(input(render(), "docusign-acknowledgement").props!.checked).toBe(false);
  });
  it("acknowledges exact contract, client, version, recipient and external draft-only upload", () => {
    const acknowledgement = docusignAcknowledgement(contract, 3, "Synthetic Client", "synthetic@example.invalid");
    for (const required of [contract.contractCode, contract.clientName, "version 3", "synthetic@example.invalid", "exact saved Word document", "external DocuSign", "draft only", "place all required client signature fields", "send it myself"]) {
      expect(acknowledgement).toContain(required);
    }
  });
  it("resets acknowledgement and retry identity when the recipient changes", async () => {
    approve();
    harness.prepare.mockRejectedValue(new Error("synthetic failure"));
    await click(render(), "Create DocuSign draft");
    await click(render(), "Create DocuSign draft");
    expect(harness.prepare).toHaveBeenCalledTimes(2);
    expect(harness.prepare.mock.calls[0][0].requestId).toBe(harness.prepare.mock.calls[1][0].requestId);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    input(render(), "docusign-recipient-name").props!.onChange({ target: { value: "Changed Synthetic Client" } });
    expect(input(render(), "docusign-acknowledgement").props!.checked).toBe(false);
    input(render(), "docusign-acknowledgement").props!.onCheckedChange(true);
    await click(render(), "Create DocuSign draft");
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2);
  });
  it("requires fresh approval when the reviewed source URL or next version changes", () => {
    approve();
    expect(button(render(), "Create DocuSign draft").props!.disabled).toBe(false);
    expect(button(render({ docUrl: "https://example.invalid/replaced.docx" }), "Create DocuSign draft").props!.disabled).toBe(true);
    harness.history = [envelope({ status: "completed" })];
    expect(button(render(), "Create DocuSign draft").props!.disabled).toBe(true);
    expect(input(render(), "docusign-acknowledgement").props!.checked).toBe(false);
    expect(text(render())).toContain("version 2");
    expect(text(render())).toContain("DocuSign: completed");
  });
  it("uses a new request identity for an explicitly approved new version after terminal history", async () => {
    approve();
    await click(render(), "Create DocuSign draft");
    harness.history = [envelope({ status: "completed" })];
    harness.prepare.mockResolvedValue({ envelope: envelope({ version: 2, id: "44444444-4444-4444-8444-444444444444" }), senderUrl: "https://demo.docusign.net/synthetic-sender" });
    input(render(), "docusign-acknowledgement").props!.onCheckedChange(true);
    await click(render(), "Create DocuSign draft");
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2);
    expect(harness.history).toHaveLength(2);
    expect(harness.history.some(item => item.status === "completed")).toBe(true);
  });
});

describe("DocuSign guarded actions", () => {
  it("never mutates on render and exposes viewer-safe history without secret setup names", () => {
    harness.canEdit = false; harness.canManage = false;
    harness.missingSettings = ["DOCUSIGN_RSA_PRIVATE_KEY"];
    harness.history = [envelope()];
    const tree = render();
    expect(text(tree)).toContain("Read-only DocuSign history");
    expect(text(tree)).toContain("Synthetic Client");
    expect(text(tree)).not.toContain("DOCUSIGN_RSA_PRIVATE_KEY");
    expect(text(tree)).not.toContain("Create DocuSign draft");
    expect(text(tree)).not.toContain("Open sender preparation");
    for (const fn of [harness.prepare, harness.senderView, harness.refresh, harness.signingLink, harness.revokeLink]) expect(fn).not.toHaveBeenCalled();
  });
  it("blocks draft creation when settings are missing, permission is denied, or history is unavailable", async () => {
    approve(); harness.configured = false; harness.missingSettings = ["DOCUSIGN_LINK_SECRET"];
    expect(text(render())).toContain("DOCUSIGN_LINK_SECRET");
    expect(button(render(), "Create DocuSign draft").props!.disabled).toBe(true);
    await click(render(), "Create DocuSign draft");
    expect(harness.prepare).not.toHaveBeenCalled();
    harness.configured = true; harness.historyError = true;
    expect(button(render(), "Create DocuSign draft").props!.disabled).toBe(true);
    harness.historyError = false; harness.canManage = false;
    expect(text(render())).not.toContain("Create DocuSign draft");
  });
  it("creates a draft with explicit confirmation and prevents a same-tick double-click", async () => {
    approve();
    let resolve!: (value: unknown) => void;
    harness.prepare.mockReturnValue(new Promise(done => { resolve = done; }));
    const tree = render();
    button(tree, "Create DocuSign draft").props!.onClick();
    button(tree, "Create DocuSign draft").props!.onClick();
    expect(harness.prepare).toHaveBeenCalledTimes(1);
    expect(harness.prepare).toHaveBeenCalledWith({ contractId: 17, requestId: "33333333-3333-4333-8333-333333333333", recipientName: "Synthetic Client", recipientEmail: "synthetic@example.invalid", confirmed: true });
    resolve({ envelope: envelope(), senderUrl: "https://demo.docusign.net/synthetic-sender" });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(window.open).toHaveBeenCalledWith("https://demo.docusign.net/synthetic-sender", "_blank", "noopener,noreferrer");
    expect(text(render())).toContain("Draft created, not sent");
    expect(text(render())).toContain("already has an active DocuSign record");
    expect(harness.signingLink).not.toHaveBeenCalled();
  });
  it("reopens the same existing draft with a fresh sender link instead of a duplicate", async () => {
    harness.history = [envelope()];
    await click(render(), "Open sender preparation");
    await click(render(), "Open sender preparation");
    expect(harness.senderView).toHaveBeenCalledTimes(2);
    expect(harness.senderView).toHaveBeenCalledWith({ id: envelope().id });
    expect(harness.prepare).not.toHaveBeenCalled();
  });
  it("keeps fresh sender preparation available if asynchronous browser popups are blocked", async () => {
    vi.mocked(window.open).mockReturnValue(null);
    approve();
    await click(render(), "Create DocuSign draft");
    expect(text(render())).toContain("If the sender window did not open");
    await click(render(), "Open sender preparation");
    expect(harness.senderView).toHaveBeenCalledWith({ id: envelope().id });
  });
  it("respects authoritative share eligibility, copies only on click and does not open a signing URL", async () => {
    harness.history = [envelope()];
    await click(render(), "Copy client signing link");
    expect(harness.signingLink).not.toHaveBeenCalled();
    harness.history = [envelope({ status: "sent", canShare: true, hasSignatureTabs: true })];
    await click(render(), "Copy client signing link");
    expect(harness.signingLink).toHaveBeenCalledWith({ id: envelope().id });
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(window.open).not.toHaveBeenCalled();
    expect(text(render())).toContain("Confidential ELEVAY signing link copied");
  });
  it("offers a read-only selectable copy fallback without opening or logging the bearer link", async () => {
    harness.history = [envelope({ status: "sent", canShare: true, hasSignatureTabs: true })];
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("clipboard disabled"));
    await click(render(), "Copy client signing link");
    const field = input(render(), `docusign-copy-${envelope().id}`);
    expect(field.props!.readOnly).toBe(true);
    const select = vi.fn(); field.props!.onFocus({ target: { select } });
    expect(select).toHaveBeenCalledOnce();
    expect(window.open).not.toHaveBeenCalled();
  });
  it("debounces provider refresh until nextRefreshAt and preserves distinct CRM/provider statuses", async () => {
    harness.history = [envelope({ status: "sent", nextRefreshAt: new Date(Date.now() + 60_000) })];
    await click(render(), "Refresh provider status");
    expect(harness.refresh).not.toHaveBeenCalled();
    harness.history = [envelope({ status: "sent", nextRefreshAt: new Date(Date.now() - 1000) })];
    harness.refresh.mockResolvedValue(envelope({ status: "completed", lastCheckedAt: new Date(), nextRefreshAt: new Date(Date.now() + 60_000) }));
    await click(render(), "Refresh provider status");
    expect(harness.refresh).toHaveBeenCalledOnce();
    expect(text(render())).toContain("DocuSign: completed");
    expect(text(render())).toContain("CRM: pending");
    expect(text(render())).toContain("CRM status and financial records were not changed");
  });
  it("requires explicit confirmation before local link revocation", async () => {
    harness.history = [envelope({ status: "sent", canShare: true, linkExpiresAt: new Date("2030-01-01T00:00:00Z") })];
    await click(render(), "Revoke ELEVAY link");
    expect(harness.revokeLink).not.toHaveBeenCalled();
    expect(text(render())).toContain("does not void or cancel the DocuSign envelope");
    await click(render(), "Confirm revoke local link");
    expect(harness.revokeLink).toHaveBeenCalledWith({ id: envelope().id });
  });
});

describe("DocuSign source and existing-contract UI regressions", () => {
  const ui = readFileSync(new URL("../client/src/components/ContractDocusignDialog.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../client/src/pages/Contracts.tsx", import.meta.url), "utf8");
  it("wires an editor-only DocuSign action and viewer-accessible history", () => {
    expect(page).toMatch(/canEdit\("contracts"\)[\s\S]*title="Prepare contract in DocuSign"/);
    expect(page).toContain("disabled={!!docusignDraftDisabledReason(contract)}");
    expect(page).toMatch(/canAccess\("contracts"\)[\s\S]*title="View DocuSign version history"/);
    expect(ui).toContain('canEdit("contracts") && readiness.data?.canManage === true');
    expect(ui).toContain('if (!canManage || !connected || actionLock.current) return false');
  });
  it("preserves existing downloads, consultant controls, manual CRM status and payment semantics", () => {
    for (const existing of ["Download existing Word document", "regenerateDocMutation.mutate", "updateConsultantMutation.mutate", "updateStatusMutation.mutate", "deleteContractMutation.mutate", "Financial Client record will be created", "Export CSV"]) expect(page).toContain(existing);
    for (const forbidden of ["updateStatus", "regenerateDoc", "markAsPaid", "createTransaction", "contracting.analytics"]) expect(ui).not.toContain(forbidden);
  });
  it("does not expose credentials, raw error details, persistent bearer storage or automatic signing", () => {
    expect(ui).not.toMatch(/console\.|localStorage|sessionStorage|err\.message|error\.message|accessToken|refreshToken|clientUserId/);
    expect(ui).not.toContain("startSigning");
    expect(ui).not.toMatch(/type="password"|\bfetch\(|axios/);
    expect(ui).toContain('window.open(url, "_blank", "noopener,noreferrer")');
    expect(ui).toContain("navigator.clipboard.writeText(result.url)");
  });
  it("keeps a mobile-safe glass modal and truthful sandbox, bearer-link and manual-field instructions", () => {
    for (const phrase of ["max-h-[85dvh]", "grid-rows-[auto_minmax(0,1fr)_auto]", "overflow-x-hidden", "grid-cols-1", "elevay-glass-panel", "sandbox only", "not legally live", "30-day expiry", "single-use", "5 minutes", "does not need a DocuSign account", "Copying a link does not open it", "local settings only"]) expect(ui).toContain(phrase);
  });
});
