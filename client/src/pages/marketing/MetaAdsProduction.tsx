import {
  AlertTriangle,
  BadgeCheck,
  FileLock2,
  LockKeyhole,
  RefreshCcw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatDateTime(value: number) {
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusClass(status: string | null | undefined) {
  if (status === "ACTIVE")
    return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  if (!status || status === "Data not available")
    return "border-slate-300/20 bg-slate-300/10 text-slate-200";
  return "border-amber-300/30 bg-amber-300/10 text-amber-100";
}

function metric(value: number | undefined) {
  return Number(value ?? 0).toLocaleString("en-US");
}

export default function MetaAdsProduction() {
  const { data: access, isLoading: accessLoading } =
    trpc.metaAdsProduction.access.useQuery();
  const reports = trpc.metaAdsProduction.listReports.useQuery(undefined, {
    enabled: Boolean(access?.canView),
  });
  const refreshReport = trpc.metaAdsProduction.captureReadOnlyReportAfterParentReview.useMutation({ onSuccess: async () => { await reports.refetch(); } });

  if (accessLoading)
    return (
      <div className="flex min-h-[65vh] items-center justify-center text-slate-400">
        Loading controlled Meta Ads reporting…
      </div>
    );
  if (!access?.canView) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-6 text-center">
        <LockKeyhole className="mb-4 h-12 w-12 text-amber-300" />
        <h1 className="text-2xl font-bold text-white">
          Meta Ads production reports are administrator-controlled
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Access is restricted to the owner or a scoped Agentic Marketing
          administrator. Reports are read-only and no publishing, campaign, ad,
          spend, or release control exists here.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0c1320] px-4 py-6 text-white md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-[#5BA3B8]/30 bg-[radial-gradient(circle_at_90%_0%,rgba(91,163,184,.20),transparent_38%),linear-gradient(115deg,#182337,#0d1524)] p-6 md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="mb-3 flex items-center gap-2 text-[#A1C6CF]">
                <FileLock2 className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-[.16em]">
                  Production reporting · read only
                </span>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Meta Ads Production Reports
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Dated, immutable reporting snapshots for the approved EGP source
                account only. This page displays stored evidence and
                human-review proposals. The explicit read-only button may run a
                fresh Meta report; it cannot publish creative, change settings,
                alter campaigns or ads, or control spend.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <Badge variant="outline" className="w-fit border-amber-300/30 bg-amber-300/10 text-amber-100"><ShieldOff className="mr-2 h-3.5 w-3.5" />Publication locked</Badge>
              {access?.canCaptureAfterParentReview && <Button className="bg-[#5BA3B8] text-[#0A1628] hover:bg-[#77b7c8]" disabled={refreshReport.isPending} onClick={() => refreshReport.mutate()}><RefreshCcw className="mr-2 h-4 w-4" />{refreshReport.isPending ? "Reading Meta…" : "Capture dated report (read-only)"}</Button>}
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-white/10 bg-[#111b2c] text-white">
            <CardHeader className="pb-3">
              <CardDescription className="text-slate-400">
                Approved source account
              </CardDescription>
              <CardTitle className="font-mono text-base">
                act_548667060148825
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-300">
              EGP only · other ad accounts are excluded.
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-[#111b2c] text-white">
            <CardHeader className="pb-3">
              <CardDescription className="text-slate-400">
                Capture contract
              </CardDescription>
              <CardTitle className="text-lg">Seven completed days</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-300">
              No partial current-day reporting is used.
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-[#111b2c] text-white">
            <CardHeader className="pb-3">
              <CardDescription className="text-slate-400">
                External operations
              </CardDescription>
              <CardTitle className="text-lg text-emerald-200">
                0 enabled
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-300">
              Account reporting uses GET-only Graph retrieval.
            </CardContent>
          </Card>
        </div>

        <Card className="border-amber-400/25 bg-amber-400/10 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-200" />
              Attribution boundary
            </CardTitle>
            <CardDescription className="text-amber-100">
              Meta lead actions are attributed actions returned by Meta. They
              are not CRM leads, qualified leads, signed clients, or a CRM
              attribution reconciliation. No client or Lead personal data is
              shown or sent by this reporting foundation.
            </CardDescription>
          </CardHeader>
        </Card>

        {reports.isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-[#111b2c] p-8 text-center text-sm text-slate-400">
            Loading immutable report snapshots…
          </div>
        ) : reports.error ? (
          <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 p-6 text-sm text-rose-100">
            Unable to load report snapshots: {reports.error.message}
          </div>
        ) : (reports.data?.length ?? 0) === 0 ? (
          <Card className="border-dashed border-white/15 bg-[#111b2c] text-white">
            <CardContent className="py-12 text-center">
              <ShieldCheck className="mx-auto mb-3 h-9 w-9 text-[#A1C6CF]" />
              <h2 className="font-semibold">
                No report snapshot has been captured
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">
                Use the read-only capture button above to retrieve seven completed
                days from the selected EGP ad account. Reports are immutable;
                ad changes, spending and publication remain blocked.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {reports.data?.map((record: any) => {
              const snapshot = record.snapshot as any;
              const reportDate = `${snapshot.window?.dateStart ?? record.windowStart} → ${snapshot.window?.dateStop ?? record.windowEnd}`;
              return (
                <section
                  key={record.reportKey}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-[#111b2c] shadow-xl shadow-black/10"
                >
                  <div className="border-b border-white/10 bg-[#0c1320] px-5 py-4 md:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#A1C6CF]">
                          Completed date range · {reportDate}
                        </p>
                        <h2 className="mt-1 text-xl font-semibold">
                          Report run{" "}
                          {formatDateTime(
                            Number(snapshot.reportRunAt ?? record.reportRunAt)
                          )}
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                          Immutable key:{" "}
                          <span className="font-mono">{record.reportKey}</span>
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge className="border-amber-300/30 bg-amber-300/10 text-amber-100">
                          Publication locked
                        </Badge>
                        <p className="font-mono text-xs text-slate-500">
                          {record.adAccountId} · {record.currency}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-6 p-5 md:p-6">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        [
                          "Amount spent",
                          `EGP ${Number(snapshot.summary?.amountSpent ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        ],
                        ["Impressions", metric(snapshot.summary?.impressions)],
                        ["Clicks (all)", metric(snapshot.summary?.clicksAll)],
                        [
                          "Meta lead actions",
                          metric(snapshot.summary?.metaLeadActions),
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-xl border border-white/10 bg-[#0c1320] p-4"
                        >
                          <p className="text-xs text-slate-400">{label}</p>
                          <p className="mt-1 text-lg font-semibold">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[.12em] text-[#A1C6CF]">
                        Evidence-led findings
                      </h3>
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        {(snapshot.findings ?? []).map(
                          (finding: any, index: number) => (
                            <article
                              key={`${finding.title}-${index}`}
                              className="rounded-xl border border-white/10 bg-[#0c1320] p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <h4 className="font-semibold">
                                  {finding.title}
                                </h4>
                                <Badge
                                  className={
                                    finding.severity === "attention"
                                      ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                                      : "border-[#5BA3B8]/30 bg-[#5BA3B8]/10 text-[#c6e9f1]"
                                  }
                                >
                                  {finding.severity}
                                </Badge>
                              </div>
                              <p className="mt-3 text-sm leading-6 text-slate-300">
                                {finding.observation}
                              </p>
                              <p className="mt-3 rounded-lg bg-white/5 p-3 text-xs leading-5 text-slate-300">
                                <strong className="text-white">
                                  Evidence:
                                </strong>{" "}
                                {finding.evidence}
                              </p>
                              <p className="mt-3 text-xs leading-5 text-slate-400">
                                <strong className="text-slate-200">
                                  Human review:
                                </strong>{" "}
                                {finding.suggestedReview}
                              </p>
                            </article>
                          )
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[.12em] text-[#A1C6CF]">
                        Campaign reporting
                      </h3>
                      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
                        <table className="w-full min-w-[840px] text-left text-sm">
                          <thead className="bg-[#0c1320] text-xs uppercase tracking-wide text-slate-400">
                            <tr>
                              <th className="px-4 py-3">Campaign</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3 text-right">
                                Amount spent
                              </th>
                              <th className="px-4 py-3 text-right">
                                Impressions
                              </th>
                              <th className="px-4 py-3 text-right">
                                Clicks (all)
                              </th>
                              <th className="px-4 py-3 text-right">
                                Meta lead actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {(snapshot.campaigns ?? []).map((campaign: any) => (
                              <tr
                                key={campaign.campaignId}
                                className="border-t border-white/10"
                              >
                                <td className="px-4 py-3">
                                  <p className="font-medium">
                                    {campaign.campaignName}
                                  </p>
                                  <p className="font-mono text-xs text-slate-500">
                                    {campaign.campaignId}
                                  </p>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge
                                    className={statusClass(
                                      campaign.effectiveStatus
                                    )}
                                  >
                                    {campaign.effectiveStatus ??
                                      "Data not available"}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  EGP{" "}
                                  {Number(campaign.amountSpent ?? 0).toFixed(2)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {metric(campaign.impressions)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {metric(campaign.clicksAll)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {metric(campaign.metaLeadActions)}
                                </td>
                              </tr>
                            ))}
                            {(snapshot.campaigns ?? []).length === 0 && (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="px-4 py-8 text-center text-slate-400"
                                >
                                  No campaign-level delivery row was returned
                                  for this date range.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[.12em] text-[#A1C6CF]">
                        Ad reporting
                      </h3>
                      <p className="mt-2 text-sm text-slate-400">
                        The status context below is returned for the parent
                        campaign; this snapshot does not infer an ad-level
                        status.
                      </p>
                      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
                        <table className="w-full min-w-[900px] text-left text-sm">
                          <thead className="bg-[#0c1320] text-xs uppercase tracking-wide text-slate-400">
                            <tr>
                              <th className="px-4 py-3">Ad</th>
                              <th className="px-4 py-3">
                                Parent campaign status
                              </th>
                              <th className="px-4 py-3 text-right">
                                Amount spent
                              </th>
                              <th className="px-4 py-3 text-right">
                                Impressions
                              </th>
                              <th className="px-4 py-3 text-right">
                                Clicks (all)
                              </th>
                              <th className="px-4 py-3 text-right">
                                Meta lead actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {(snapshot.ads ?? []).map((ad: any) => (
                              <tr
                                key={ad.adId}
                                className="border-t border-white/10"
                              >
                                <td className="px-4 py-3">
                                  <p className="font-medium">{ad.adName}</p>
                                  <p className="font-mono text-xs text-slate-500">
                                    {ad.adId} · {ad.campaignName}
                                  </p>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge
                                    className={statusClass(
                                      ad.campaignEffectiveStatus
                                    )}
                                  >
                                    {ad.campaignEffectiveStatus ??
                                      "Data not available"}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  EGP {Number(ad.amountSpent ?? 0).toFixed(2)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {metric(ad.impressions)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {metric(ad.clicksAll)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {metric(ad.metaLeadActions)}
                                </td>
                              </tr>
                            ))}
                            {(snapshot.ads ?? []).length === 0 && (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="px-4 py-8 text-center text-slate-400"
                                >
                                  No ad-level delivery row was returned for this
                                  date range.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[.12em] text-[#A1C6CF]">
                        Draft proposal preview · approval readiness
                      </h3>
                      <p className="mt-2 text-sm text-slate-400">
                        These are transparent review prompts only. They do not
                        create media, publish, modify campaign or ad settings,
                        adjust spend, or release anything.
                      </p>
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        {(snapshot.draftProposals ?? []).map(
                          (proposal: any) => (
                            <article
                              key={proposal.proposalKey}
                              className="rounded-xl border border-[#C9A84C]/25 bg-[#0c1320] p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <h4 className="font-semibold">
                                  {proposal.title}
                                </h4>
                                <Badge className="border-amber-300/30 bg-amber-300/10 text-amber-100">
                                  Human review only
                                </Badge>
                              </div>
                              <p className="mt-3 text-sm leading-6 text-slate-300">
                                {proposal.hypothesis}
                              </p>
                              <p className="mt-3 rounded-lg bg-white/5 p-3 text-xs leading-5 text-slate-300">
                                <strong className="text-white">
                                  Evidence:
                                </strong>{" "}
                                {proposal.evidence}
                              </p>
                              <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                                <p>
                                  <strong className="text-slate-200">
                                    Settings display:
                                  </strong>{" "}
                                  {proposal.settingsDisplay?.configuredStatus ??
                                    "Data not available"}{" "}
                                  /{" "}
                                  {proposal.settingsDisplay?.effectiveStatus ??
                                    "Data not available"}
                                </p>
                                <p>
                                  <strong className="text-slate-200">
                                    Media review:
                                  </strong>{" "}
                                  {proposal.mediaReview?.status ??
                                    "not requested"}
                                </p>
                              </div>
                              <p className="mt-3 text-xs font-semibold text-amber-100">
                                Approval readiness:{" "}
                                {proposal.publicationStatus?.replaceAll(
                                  "_",
                                  " "
                                )}
                              </p>
                            </article>
                          )
                        )}
                        {(snapshot.draftProposals ?? []).length === 0 && (
                          <div className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-slate-400">
                            No draft review proposal is supported by this
                            snapshot. No claim or operating action is inferred.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
