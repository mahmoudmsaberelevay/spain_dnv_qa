import React, { useEffect, useMemo, useRef, useState } from "react";
import type { SafeEnvelope } from "@shared/contractDocusign";
import { trpc } from "@/lib/trpc";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Download, ExternalLink, FileSignature, History, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type Envelope = SafeEnvelope;
export type DocusignContract = {
  id: number;
  contractCode: string;
  clientName: string;
  status: string;
  docUrl: string | null;
};

// UI-only rules: the server independently enforces permissions, source bytes and provider state.
export function docusignDraftDisabledReason(contract: DocusignContract): string | null {
  if (contract.status !== "pending") return "Only pending CRM contracts can create a DocuSign draft.";
  if (!contract.docUrl) return "Generate and save the Word document before preparing a DocuSign draft.";
  return null;
}

export function validateDocusignRecipient(name: string, email: string): string | null {
  const cleanName = name.trim();
  const cleanEmail = email.trim();
  if (cleanName.length < 2 || cleanName.length > 100 || /[\x00-\x1f\x7f]/.test(cleanName)) {
    return "Enter the client's full name (2–100 characters).";
  }
  if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return "Enter a valid client email address.";
  }
  return null;
}

export function docusignAcknowledgement(contract: DocusignContract, version: number, name: string, email: string): string {
  return `I reviewed the exact saved Word document for contract ${contract.contractCode}, client ${contract.clientName}, DocuSign version ${version}. I confirm the recipient is ${name.trim() || "[client full name]"} (${email.trim() || "[client email]"}) and authorize uploading this document and recipient details to external DocuSign to create a draft only. I will review the document, place all required client signature fields, and send it myself in DocuSign.`;
}

function timestamp(value: Date | string | number | null | undefined): number {
  if (value == null) return 0;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : 0;
}

function localTime(value: Date | string | number | null | undefined): string {
  return timestamp(value) ? new Date(timestamp(value)).toLocaleString() : "Not yet checked";
}

function isDraft(envelope: Envelope): boolean {
  return !!envelope.envelopeId && envelope.status === "draft";
}

function isActive(envelope: Envelope): boolean {
  // Unknown states block duplicate creation rather than risking a second active envelope.
  return !["completed", "declined", "voided", "cancelled"].includes(envelope.status)
    && !(envelope.status === "error" && !envelope.envelopeId);
}

function openSender(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !/(^|\.)docusign\.(com|net)$/.test(parsed.hostname)) {
    throw new Error("Invalid sender destination");
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function ContractDocusignDialog({ contract, open, onOpenChange }: {
  contract: DocusignContract;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { canEdit, canAccess } = usePermissions();
  const canRead = canAccess("contracts");
  const utils = trpc.useUtils();
  const historyInput = useMemo(() => ({ contractId: contract.id }), [contract.id]);
  const readiness = trpc.contractDocusign.readiness.useQuery(undefined, {
    enabled: open && canRead, retry: false, refetchOnWindowFocus: false,
  });
  const history = trpc.contractDocusign.history.useQuery(historyInput, {
    enabled: open && canRead, retry: false, refetchOnWindowFocus: false,
  });
  const prepare = trpc.contractDocusign.prepare.useMutation({ retry: false });
  const senderView = trpc.contractDocusign.senderView.useMutation({ retry: false });
  const refresh = trpc.contractDocusign.refresh.useMutation({ retry: false });
  const signingLink = trpc.contractDocusign.signingLink.useMutation({ retry: false });
  const revokeLink = trpc.contractDocusign.revokeLink.useMutation({ retry: false });

  const [recipientName, setRecipientName] = useState(contract.clientName);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  // Kept in memory across close/reopen and retries; never put recipient data or bearer links in storage.
  const requestId = useRef<string | null>(null);
  const requestVersion = useRef<number | null>(null);
  const acknowledgedVersion = useRef<number | null>(null);
  const acknowledgedDocument = useRef<string | null>(null);
  const actionLock = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [senderFallbackId, setSenderFallbackId] = useState<string | null>(null);
  const [copyFallback, setCopyFallback] = useState<{ id: string; url: string; expiresAt: Date | string | number } | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const canManage = canEdit("contracts") && readiness.data?.canManage === true;
  const connected = readiness.data?.configured === true && !readiness.isError;
  const envelopes = useMemo(() => [...(history.data ?? [])].sort((a, b) => b.version - a.version), [history.data]);
  const nextVersion = Math.max(0, ...envelopes.map(item => item.version)) + 1;
  const activeEnvelope = envelopes.find(isActive);
  const recipientError = validateDocusignRecipient(recipientName, recipientEmail);
  const draftReason = docusignDraftDisabledReason(contract);
  const historyReady = !!history.data && !history.isFetching && !history.isError;
  const documentIdentity = `${contract.id}:${contract.contractCode}:${contract.clientName}:${contract.docUrl}`;
  const acknowledgementCurrent = acknowledgedVersion.current === nextVersion && acknowledgedDocument.current === documentIdentity;
  const createAllowed = canManage && connected && historyReady && !draftReason && !activeEnvelope && !recipientError && confirmed && acknowledgementCurrent;

  useEffect(() => {
    if (!open) { setCopyFallback(null); return; }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (acknowledgedVersion.current !== null && (acknowledgedVersion.current !== nextVersion || acknowledgedDocument.current !== documentIdentity)) {
      setConfirmed(false);
      acknowledgedVersion.current = null;
      acknowledgedDocument.current = null;
    }
  }, [nextVersion, documentIdentity]);

  function editRecipient(field: "name" | "email", value: string) {
    if (actionLock.current) return;
    if (field === "name") setRecipientName(value); else setRecipientEmail(value);
    setConfirmed(false);
    acknowledgedVersion.current = null;
    acknowledgedDocument.current = null;
    requestId.current = null;
    setError(null);
  }

  function startAction(key: string): boolean {
    if (!canManage || !connected || actionLock.current) return false;
    actionLock.current = true;
    setBusy(key);
    setError(null);
    setMessage(null);
    return true;
  }

  function finishAction() { actionLock.current = false; setBusy(null); }

  function rememberEnvelope(envelope: Envelope) {
    utils.contractDocusign.history.setData(historyInput, current => {
      const rest = (current ?? []).filter(item => item.id !== envelope.id);
      return [...rest, envelope].sort((a, b) => b.version - a.version);
    });
    setNow(Date.now());
  }

  async function createDraft() {
    if (!createAllowed || !startAction("prepare")) return;
    try {
      // A newly acknowledged version after terminal history is a new operation, not a retry.
      if (requestVersion.current !== nextVersion) requestId.current = null;
      requestId.current ??= crypto.randomUUID();
      requestVersion.current = nextVersion;
      const result = await prepare.mutateAsync({
        contractId: contract.id, requestId: requestId.current,
        recipientName: recipientName.trim(), recipientEmail: recipientEmail.trim(), confirmed: true,
      });
      rememberEnvelope(result.envelope);
      setConfirmed(false);
      setSenderFallbackId(result.envelope.id);
      setMessage("Draft created, not sent. Open sender preparation to REVIEW, PLACE required client signature fields, then SEND yourself in DocuSign.");
      try { openSender(result.senderUrl); } catch { setError("The sender window could not open. Use Open sender preparation below for a fresh link."); }
    } catch {
      setError("Could not prepare the DocuSign draft. Check connection and history before retrying. Retrying the unchanged recipient form uses the same request ID to avoid duplicates.");
      void utils.contractDocusign.history.invalidate(historyInput);
    } finally { finishAction(); }
  }

  async function reopenSender(envelope: Envelope) {
    if (!isDraft(envelope) || !startAction(`sender:${envelope.id}`)) return;
    try {
      const result = await senderView.mutateAsync({ id: envelope.id });
      setSenderFallbackId(envelope.id);
      openSender(result.url);
      setMessage("Sender preparation requested. If your browser blocked the window, allow pop-ups and click Open sender preparation again. Each click obtains a fresh, short-lived link.");
    } catch { setError("Could not open sender preparation. Refresh the provider status or check the connection, then try again."); }
    finally { finishAction(); }
  }

  async function refreshEnvelope(envelope: Envelope) {
    if (timestamp(envelope.nextRefreshAt) > Date.now() || !startAction(`refresh:${envelope.id}`)) return;
    try {
      const result = await refresh.mutateAsync({ id: envelope.id });
      rememberEnvelope(result);
      setMessage(timestamp(result.lastCheckedAt) > timestamp(envelope.lastCheckedAt)
        ? "Fresh DocuSign provider status received. CRM status and financial records were not changed."
        : `Cached provider status. Next refresh allowed: ${localTime(result.nextRefreshAt)}. CRM status and financial records were not changed.`);
    } catch { setError("Provider status could not be refreshed. The displayed status remains cached; no CRM status was changed."); }
    finally { finishAction(); }
  }

  async function copySigningLink(envelope: Envelope) {
    if (!envelope.canShare || !startAction(`copy:${envelope.id}`)) return;
    setCopyFallback(null);
    try {
      const result = await signingLink.mutateAsync({ id: envelope.id });
      try {
        await navigator.clipboard.writeText(result.url);
        setMessage(`Confidential ELEVAY signing link copied. Expires ${localTime(result.expiresAt)}. Share privately with the confirmed client only.`);
      } catch {
        setCopyFallback({ id: envelope.id, url: result.url, expiresAt: result.expiresAt });
        setMessage("Clipboard access is unavailable. Select and copy the confidential link below manually.");
      }
      void utils.contractDocusign.history.invalidate(historyInput);
    } catch { setError("A signing link is not available. Send the reviewed draft in DocuSign, refresh provider status, and try again."); }
    finally { finishAction(); }
  }

  async function confirmRevoke(envelope: Envelope) {
    if (revokeId !== envelope.id || !startAction(`revoke:${envelope.id}`)) return;
    try {
      await revokeLink.mutateAsync({ id: envelope.id });
      setCopyFallback(null);
      setRevokeId(null);
      setMessage("The ELEVAY signing link was revoked locally. This does not void the DocuSign envelope or undo signatures.");
      void utils.contractDocusign.history.invalidate(historyInput);
    } catch { setError("Could not revoke the ELEVAY link. Check the connection and try again."); }
    finally { finishAction(); }
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!actionLock.current) onOpenChange(value); }}>
      <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-4 text-foreground sm:max-w-3xl sm:p-6" showCloseButton={!busy}>
        <DialogHeader className="min-w-0 pr-6 text-left">
          <DialogTitle className="flex items-center gap-2 leading-snug"><FileSignature className="h-5 w-5 shrink-0 text-primary" />Send contract to DocuSign</DialogTitle>
          <DialogDescription className="break-words">Contract {contract.contractCode} · {contract.clientName}. Create a draft first; this app does not send the contract.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 min-w-0 space-y-5 overflow-y-auto overflow-x-hidden pr-1 text-sm">
          {readiness.data?.environment === "demo" && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-foreground" role="status"><strong>DocuSign DEMO — sandbox only.</strong> Test envelopes are not legally live. Do not treat demo completion as a real signed contract.</div>
          )}
          {readiness.data?.environment === "production" && <Badge variant="outline">DocuSign production</Badge>}
          <div className="elevay-glass-panel rounded-xl border p-3 leading-relaxed">
            <p className="font-semibold">1. Create draft → 2. Review & place fields → 3. Send in DocuSign</p>
            <p className="mt-1 text-muted-foreground">The approved template has multiple signatures without safe unique anchors. Staff must REVIEW the entire document and PLACE all required client signature fields in sender preparation, then SEND in DocuSign themselves. A draft is not sent and cannot be shared for signing.</p>
            <p className="mt-2 text-muted-foreground">DocuSign provider status is separate from CRM status. This workflow never automatically marks the CRM contract signed or changes financial records.</p>
          </div>
          {!canManage && !readiness.isLoading && <p className="text-muted-foreground">Read-only DocuSign history. Full contract-edit permission is required to prepare drafts, refresh provider status or manage links.</p>}
          {readiness.isLoading && <p role="status">Checking DocuSign configuration…</p>}
          {readiness.isError && <div role="alert" className="space-y-2"><p>Could not check the DocuSign connection. Actions are disabled.</p><Button variant="outline" size="sm" onClick={() => void readiness.refetch()}>Retry connection check</Button></div>}
          {!readiness.isLoading && !readiness.isError && !connected && <p role="status">DocuSign is not configured. Ask an authorized administrator to complete the managed server connection.</p>}
          {canManage && (
            <details className="elevay-glass-panel min-w-0 rounded-xl border p-3">
              <summary className="cursor-pointer font-medium">Manage DocuSign connection</summary>
              <div className="mt-3 space-y-2 break-words text-muted-foreground">
                <p>Configure these names in managed server secrets; never enter credentials in this dialog. No account login is handled here. An administrator must authorize the integration outside this app.</p>
                <p>A successful configuration check validates local settings only; it does not verify live DocuSign authorization or connectivity.</p>
                <p><code>DOCUSIGN_ENVIRONMENT</code>: demo or production. Also configure <code>DOCUSIGN_INTEGRATION_KEY</code>, <code>DOCUSIGN_USER_ID</code>, <code>DOCUSIGN_ACCOUNT_ID</code>, <code>DOCUSIGN_PRIVATE_KEY_BASE64</code> and <code>DOCUSIGN_LINK_SECRET</code>.</p>
                <p><code>DOCUSIGN_PRIVATE_KEY_BASE64</code>: single-line Base64 encoding of the complete original private-key PEM. It is decoded and validated only on the server. Legacy <code>DOCUSIGN_RSA_PRIVATE_KEY</code> is used only when the Base64 setting is absent or empty; invalid Base64 never silently falls back.</p>
                {!!readiness.data?.missingSettings.length && <p className="break-all">Missing settings: {readiness.data.missingSettings.join(", ")}</p>}
                <Button variant="outline" size="sm" disabled={readiness.isFetching || !!busy} onClick={() => void readiness.refetch()}>Recheck connection</Button>
              </div>
            </details>
          )}
          {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-foreground">{error}</div>}
          {message && <div role="status" aria-live="polite" className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-foreground">{message}</div>}
          {canManage && !activeEnvelope && (
            <section className="min-w-0 space-y-3" aria-labelledby="docusign-create-heading">
              <h3 id="docusign-create-heading" className="font-semibold">Prepare saved document · version {nextVersion}</h3>
              {draftReason && <p className="text-muted-foreground">{draftReason}</p>}
              {contract.docUrl && <Button variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal text-left" asChild><a href={contract.docUrl} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4 shrink-0" />Download existing Word document</a></Button>}
              <p className="text-muted-foreground">Download and review the exact existing saved Word document before approving. Draft creation uploads those saved bytes, not a regenerated contract.</p>
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5"><Label htmlFor="docusign-recipient-name">Client full name</Label><Input id="docusign-recipient-name" value={recipientName} maxLength={100} disabled={!!busy || !!draftReason} onChange={event => editRecipient("name", event.target.value)} autoComplete="off" /></div>
                <div className="min-w-0 space-y-1.5"><Label htmlFor="docusign-recipient-email">Client email</Label><Input id="docusign-recipient-email" type="email" inputMode="email" value={recipientEmail} maxLength={254} disabled={!!busy || !!draftReason} onChange={event => editRecipient("email", event.target.value)} autoComplete="off" aria-describedby="docusign-recipient-validation" /></div>
              </div>
              <p id="docusign-recipient-validation" className="text-xs text-muted-foreground">{recipientError ?? "Confirm this exact recipient before creating the draft."}</p>
              <div className="flex items-start gap-3 rounded-xl border p-3">
                <Checkbox id="docusign-acknowledgement" className="mt-0.5 shrink-0" checked={confirmed && acknowledgementCurrent} disabled={!!busy || !!draftReason || !!recipientError || !historyReady || !connected} onCheckedChange={value => { setConfirmed(value === true); acknowledgedVersion.current = value === true ? nextVersion : null; acknowledgedDocument.current = value === true ? documentIdentity : null; }} />
                <Label htmlFor="docusign-acknowledgement" className="min-w-0 break-words text-sm font-normal leading-relaxed">{docusignAcknowledgement(contract, nextVersion, recipientName, recipientEmail)}</Label>
              </div>
              <Button className="w-full gap-2 sm:w-auto" disabled={!createAllowed || !!busy} onClick={() => void createDraft()}>{busy === "prepare" && <Loader2 className="h-4 w-4 animate-spin" />}Create DocuSign draft</Button>
            </section>
          )}
          {activeEnvelope && <p className="rounded-xl border p-3 text-muted-foreground">Version {activeEnvelope.version} already has an active DocuSign record. Reopen the existing draft below instead of creating a duplicate. Terminal versions remain in history.</p>}
          <section className="min-w-0 space-y-3" aria-labelledby="docusign-history-heading">
            <h3 id="docusign-history-heading" className="flex items-center gap-2 font-semibold"><History className="h-4 w-4" />DocuSign version history</h3>
            {history.isLoading && <p role="status">Loading history…</p>}
            {history.isError && <div role="alert" className="space-y-2"><p>History could not be loaded. Draft creation is disabled to prevent duplicates.</p><Button variant="outline" size="sm" onClick={() => void history.refetch()}>Retry history</Button></div>}
            {!history.isLoading && !history.isError && !envelopes.length && <p className="text-muted-foreground">No DocuSign drafts yet.</p>}
            {envelopes.map(envelope => {
              const nextAllowed = timestamp(envelope.nextRefreshAt);
              const coolingDown = nextAllowed > now;
              return (
                <article key={envelope.id} className="elevay-glass-panel min-w-0 space-y-3 rounded-xl border p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-2"><strong>Version {envelope.version}</strong><Badge variant="outline" className="break-all">DocuSign: {envelope.status}</Badge><Badge variant="secondary">CRM: {contract.status}</Badge></div>
                  <p className="break-words">{envelope.recipientName} · {envelope.email}</p>
                  <dl className="grid min-w-0 grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <div><dt>Created</dt><dd>{localTime(envelope.createdAt)}</dd></div>
                    <div><dt>Cached provider status · last checked</dt><dd>{localTime(envelope.lastCheckedAt)}</dd></div>
                    {!!nextAllowed && <div><dt>Next refresh allowed</dt><dd>{localTime(envelope.nextRefreshAt)}{coolingDown ? " (please wait)" : ""}</dd></div>}
                    {envelope.linkExpiresAt && <div><dt>ELEVAY link expires</dt><dd>{localTime(envelope.linkExpiresAt)}</dd></div>}
                  </dl>
                  {envelope.documentHash && <p className="break-all text-xs text-muted-foreground">Saved document SHA-256: {envelope.documentHash}</p>}
                  {envelope.errorCode && <p className="text-sm text-destructive">This version needs attention. Check the connection or contact an administrator before retrying.</p>}
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      {isDraft(envelope) && <Button size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal" disabled={!!busy || !connected} onClick={() => void reopenSender(envelope)}><ExternalLink className="h-4 w-4" />Open sender preparation</Button>}
                      {!!envelope.envelopeId && <Button size="sm" variant="outline" disabled={!!busy || !connected || coolingDown} onClick={() => void refreshEnvelope(envelope)}><RefreshCw className={`h-4 w-4 ${busy === `refresh:${envelope.id}` ? "animate-spin" : ""}`} />Refresh provider status</Button>}
                      <Button size="sm" className="h-auto min-h-9 whitespace-normal" disabled={!!busy || !connected || !envelope.canShare || history.isFetching || history.isError} onClick={() => void copySigningLink(envelope)}><Copy className="h-4 w-4" />Copy client signing link</Button>
                      {envelope.linkExpiresAt && <Button size="sm" variant="outline" disabled={!!busy || !connected} onClick={() => setRevokeId(envelope.id)}>Revoke ELEVAY link</Button>}
                    </div>
                  )}
                  {!envelope.canShare && <p className="text-xs text-muted-foreground">Client sharing is disabled until DocuSign authoritatively confirms the envelope can be signed. For a draft: review, place required fields, and send in DocuSign, then refresh here.</p>}
                  {senderFallbackId === envelope.id && isDraft(envelope) && <p className="text-xs text-muted-foreground">If the sender window did not open, allow pop-ups and use Open sender preparation again. Sender links expire quickly; reopening gets a fresh link for this same draft.</p>}
                  {copyFallback && copyFallback.id === envelope.id && canManage && envelope.canShare && (
                    <div className="min-w-0 space-y-2"><Label htmlFor={`docusign-copy-${envelope.id}`}>Confidential link — select and copy manually</Label><Input id={`docusign-copy-${envelope.id}`} readOnly value={copyFallback.url} onFocus={event => event.target.select()} /><p className="text-xs text-muted-foreground">Expires {localTime(copyFallback.expiresAt)}. Share with the confirmed client only.</p><Button size="sm" variant="outline" onClick={() => setCopyFallback(null)}>Hide link</Button></div>
                  )}
                  {revokeId === envelope.id && canManage && <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-3"><p>Revoke this confidential ELEVAY link for version {envelope.version}? Anyone holding it will lose access through ELEVAY. This only revokes the local link; it does not void or cancel the DocuSign envelope.</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="destructive" disabled={!!busy} onClick={() => void confirmRevoke(envelope)}>Confirm revoke local link</Button><Button size="sm" variant="outline" disabled={!!busy} onClick={() => setRevokeId(null)}>Keep link</Button></div></div>}
                </article>
              );
            })}
          </section>
          <div className="flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>The copied URL is an ELEVAY <code>/sign-contract</code> secure bearer link, confidential to the client, with a 30-day expiry. It dynamically opens DocuSign; the provider signing links are single-use and expire in about 5 minutes. The embedded client does not need a DocuSign account. Copying a link does not open it or send an email.</p></div>
        </div>
        <DialogFooter className="min-w-0 border-t pt-3"><Button variant="outline" disabled={!!busy} onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
