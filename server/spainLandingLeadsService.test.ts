import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import {
  classifySpainLandingProcessingError,
  landingPayloadSchema,
  pullLandingPayloadFromAliases,
  resolveSpainLandingContactMatch,
  SPAIN_LANDING_PROGRAM,
  SPAIN_LANDING_PULL_FALLBACK_URL,
  SPAIN_LANDING_PULL_URL,
  SPAIN_LANDING_SOURCE,
} from "./spainLandingLeadsService";

const projectRoot = path.resolve(import.meta.dirname, "..");
const validPayload = {
  submissionId: 27,
  fullName: "Amina Khalid",
  email: "amina@example.com",
  phoneE164: "+971501234567",
  phoneCountry: "AE",
  language: "ar",
  lookingFor: "residency_investment_business_financial",
  jobPosition: "freelancer_or_business_owner",
  feeCommitment: "yes",
  consentConfirmed: true,
  program: "Spain Digital Nomad Residency",
  source: "Spain DNV qualification landing page",
  submittedAt: "2026-09-07T09:00:00.000Z",
};

describe("Spain landing page to ELEVAY Leads ingestion", () => {
  it("accepts only the exact qualified server payload contract", () => {
    expect(landingPayloadSchema.parse(validPayload)).toEqual(validPayload);
    expect(() => landingPayloadSchema.parse({ ...validPayload, lookingFor: "tourist_or_schengen" })).toThrow();
    expect(() => landingPayloadSchema.parse({ ...validPayload, consentConfirmed: false })).toThrow();
    expect(() => landingPayloadSchema.parse({ ...validPayload, unexpected: "field" })).toThrow();
  });

  it("uses phone precedence, email fallback, and manual review for ambiguous or conflicting matches", () => {
    expect(resolveSpainLandingContactMatch([], [])).toEqual({ leadId: null, matchMethod: "new" });
    expect(resolveSpainLandingContactMatch([5], [])).toEqual({ leadId: 5, matchMethod: "phone" });
    expect(resolveSpainLandingContactMatch([], [6])).toEqual({ leadId: 6, matchMethod: "email" });
    expect(resolveSpainLandingContactMatch([5], [5])).toEqual({ leadId: 5, matchMethod: "phone" });
    expect(resolveSpainLandingContactMatch([5], [6])).toEqual({ leadId: null, matchMethod: "manual_review" });
    expect(resolveSpainLandingContactMatch([5, 7], [])).toEqual({ leadId: null, matchMethod: "manual_review" });
  });

  it("uses the exact requested Lead source and existing Spain DNV program", () => {
    expect(SPAIN_LANDING_SOURCE).toBe("Spain_landing page");
    expect(SPAIN_LANDING_PROGRAM).toBe("Spain DNV");
    expect(SPAIN_LANDING_PULL_URL).toBe(
      "https://elevayconsult-yttdaxru.manus.space/api/trpc/integrations/spain-dnv-leads/pull",
    );
    expect(SPAIN_LANDING_PULL_FALLBACK_URL).toBe(
      "https://elevayconsult-yttdaxru.manus.space/api/integrations/spain-dnv-leads/pull",
    );
  });

  it("falls back to the live compatibility handler only when the routed alias is unavailable", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(validPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    await expect(pullLandingPayloadFromAliases(27, "opaque-token", fetcher as typeof fetch))
      .resolves.toEqual(validPayload);
    expect(fetcher).toHaveBeenNthCalledWith(1, SPAIN_LANDING_PULL_URL, expect.any(Object));
    expect(fetcher).toHaveBeenNthCalledWith(2, SPAIN_LANDING_PULL_FALLBACK_URL, expect.any(Object));
  });

  it("falls back to the public compatibility handler when authentication middleware blocks the routed alias", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(validPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    await expect(pullLandingPayloadFromAliases(27, "opaque-token", fetcher as typeof fetch))
      .resolves.toEqual(validPayload);
    expect(fetcher).toHaveBeenNthCalledWith(1, SPAIN_LANDING_PULL_URL, expect.any(Object));
    expect(fetcher).toHaveBeenNthCalledWith(2, SPAIN_LANDING_PULL_FALLBACK_URL, expect.any(Object));
  });

  it("registers the dedicated endpoint before generic website ingestion, tRPC, static files, and SPA fallback", () => {
    const indexSource = fs.readFileSync(path.join(projectRoot, "server/_core/index.ts"), "utf8");
    const dedicated = indexSource.indexOf("registerSpainLandingLeadRoutes(app)");
    const generic = indexSource.indexOf('app.post("/api/webhook/leads/:token"');
    const trpc = indexSource.indexOf("createExpressMiddleware({");
    const staticFallback = indexSource.indexOf("serveStatic(app)");
    expect(dedicated).toBeGreaterThan(0);
    expect(dedicated).toBeLessThan(generic);
    expect(dedicated).toBeLessThan(trpc);
    expect(dedicated).toBeLessThan(staticFallback);
  });

  it("enforces idempotency and keeps landing ingestion outside every Meta/CAPI event path", () => {
    const migration = fs.readFileSync(path.join(projectRoot, "drizzle/0061_spain_landing_leads.sql"), "utf8");
    const service = fs.readFileSync(path.join(projectRoot, "server/spainLandingLeadsService.ts"), "utf8");
    expect(migration).toContain("externalSubmissionId_unique");
    expect(migration).toContain("Spain_landing page");
    expect(service).toContain("metaSyncStatus: null");
    expect(service).toContain('metaAssignmentStatus: "not_applicable"');
    expect(service).not.toContain("enqueueMappedMetaEvent");
    expect(service).not.toContain("sendMetaEvent");
    expect(service).not.toContain("META_CRM_PRODUCTION_ENABLED");
  });

  it("resolves newly inserted Leads without relying on driver-specific insert IDs", () => {
    const service = fs.readFileSync(path.join(projectRoot, "server/spainLandingLeadsService.ts"), "utf8");
    expect(service).not.toContain(".insertId");
    expect(service).toContain(".onDuplicateKeyUpdate({");
    expect(service).toContain("set: { id: sql`${leads.id}` }");
    expect(service).toContain("const postInsertMatch = await findUniqueRealLead(tx, payload)");
    expect(service).toContain('throw new Error("LANDING_LEAD_LOOKUP_FAILED")');
  });

  it("exposes only approved operational error codes and sanitizes unknown database errors", () => {
    expect(classifySpainLandingProcessingError(new Error("LANDING_LEAD_LOOKUP_FAILED")))
      .toBe("LANDING_LEAD_LOOKUP_FAILED");
    expect(classifySpainLandingProcessingError(new Error("LANDING_PHONE_NORMALIZATION_FAILED")))
      .toBe("LANDING_PHONE_NORMALIZATION_FAILED");
    expect(classifySpainLandingProcessingError(new Error("raw database details")))
      .toBe("LANDING_PROCESSING_FAILED");
  });
});
