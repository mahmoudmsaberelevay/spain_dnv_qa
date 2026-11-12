import React, { useId, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/** UI authorization is advisory; configureSync independently verifies the real owner. */
export default function ContractDocusignSyncControls({
  canConfigure,
}: {
  canConfigure: boolean;
}) {
  const id = useId();
  const lock = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const status = trpc.contractDocusign.syncStatus.useQuery(undefined, {
    enabled: canConfigure,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const configure = trpc.contractDocusign.configureSync.useMutation({
    retry: false,
  });
  if (!canConfigure) return null;
  const data = status.data;
  const disabled =
    !data ||
    status.isError ||
    status.isFetching ||
    configure.isPending ||
    data.busy ||
    (!data.enabled && (!data.canEnable || data.reconciliationRequired));

  async function change(enabled: boolean) {
    if (disabled || lock.current || !canConfigure) return;
    lock.current = true;
    setMessage(null);
    setError(null);
    try {
      const result = await configure.mutateAsync({ enabled });
      utils.contractDocusign.syncStatus.setData(undefined, result);
      setMessage(
        result.enabled
          ? "Automatic Signed-status sync enabled. Eligible production envelopes are checked every 15 minutes."
          : "Automatic Signed-status sync disabled. No new scheduled checks will start."
      );
    } catch {
      // Provider/DB/scheduler error text is never rendered verbatim.
      setError(
        "Could not change automatic sync. Recheck its status before retrying. An uncertain schedule creation requires administrator reconciliation; do not create another job."
      );
    } finally {
      lock.current = false;
      void utils.contractDocusign.syncStatus.invalidate();
    }
  }

  return (
    <section
      className="min-w-0 space-y-3 rounded-xl border p-3 text-sm"
      aria-labelledby={`${id}-heading`}
    >
      <h3 id={`${id}-heading`} className="font-semibold">
        Automatic DocuSign sync · owner only
      </h3>
      <div className="flex items-start gap-3">
        <Switch
          id={id}
          checked={data?.enabled === true}
          disabled={disabled}
          onCheckedChange={enabled => void change(enabled)}
          aria-describedby={`${id}-description`}
        />
        <Label htmlFor={id} className="min-w-0 leading-relaxed">
          Enable automatic Signed-status sync
        </Label>
      </div>
      <p id={`${id}-description`} className="text-muted-foreground">
        Off by default. After production configuration and deployment, the owner
        can explicitly enable a 15-minute schedule. Only eligible new production
        envelopes with verified completion proof may mark a CRM contract Signed.
        This does not send envelopes, generate documents or create receipts.
      </p>
      {status.isLoading && <p role="status">Checking automatic sync status…</p>}
      {data?.environment === "demo" && (
        <p role="status" className="text-muted-foreground">
          DocuSign DEMO — automatic Signed-status sync is disabled. Demo and
          DS-DEMO contracts cannot change real CRM signing status. Production is
          not activated by changing a setting or deploying.
        </p>
      )}
      {data?.environment === "production" && !data.canEnable && (
        <p role="status" className="text-muted-foreground">
          Production configuration is not ready. Complete and review the managed
          connection before enabling sync.
        </p>
      )}
      {data?.reconciliationRequired && (
        <p role="alert">
          Schedule creation is unresolved. An administrator must reconcile the
          existing platform job before automatic sync can be enabled. No
          duplicate job will be created automatically.
        </p>
      )}
      {data?.busy && (
        <p role="status">
          A scheduled check or configuration change is in progress. Recheck
          status when it finishes.
        </p>
      )}
      {data?.lastRunAt && (
        <p className="text-xs text-muted-foreground">
          Last scheduled run: {new Date(data.lastRunAt).toLocaleString()}
        </p>
      )}
      {data?.lastErrorCode && !data.reconciliationRequired && (
        <p role="alert">
          Automatic sync needs attention. Ask an administrator to review the
          safe run status.
        </p>
      )}
      {(status.isError || error) && (
        <p role="alert" className="text-destructive">
          {error ??
            "Could not load automatic sync status. Changes are disabled until status is available."}
        </p>
      )}
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={status.isFetching || configure.isPending}
        onClick={() => void status.refetch()}
      >
        Recheck sync status
      </Button>
    </section>
  );
}
