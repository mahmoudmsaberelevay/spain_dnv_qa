import type { Express, Request, Response } from "express";
import { createHash, randomUUID } from "crypto";
import { load } from "cheerio";
import { and, asc, desc, eq, notInArray } from "drizzle-orm";
import { getDb } from "./db";
import { publicContentSyncRuns, publicContentSyncSettings, publicPrograms, publicServiceProviders } from "../drizzle/schema";

const SOURCES = [
  { category: "residency" as const, url: "https://elevay.com/residency-by-investment/", path: "/residency-by-investment/" },
  { category: "citizenship" as const, url: "https://elevay.com/citizenship-by-investment/", path: "/citizenship-by-investment/" },
];

const ARABIC_PROGRAM_NAMES: Record<string, string> = {
  "Antigua & Barbuda": "أنتيغوا وبربودا",
  "Australia": "أستراليا",
  "Canada": "كندا",
  "Dominica": "دومينيكا",
  "Egypt": "مصر",
  "Grenada": "غرينادا",
  "Greece": "اليونان",
  "Hungary": "المجر",
  "Latvia": "لاتفيا",
  "Malta": "مالطا",
  "Nauru": "ناورو",
  "Portugal": "البرتغال",
  "saint kitts and nevis": "سانت كيتس ونيفيس",
  "saint kitts & nevis": "سانت كيتس ونيفيس",
  "saint lucia": "سانت لوسيا",
  "Saint Lucia": "سانت لوسيا",
  "São Tomé and Príncipe": "ساو تومي وبرينسيب",
  "Spain": "إسبانيا",
  "Turkey": "تركيا",
  "United Arab Emirates": "الإمارات العربية المتحدة",
  "United States": "الولايات المتحدة",
  "Vanuatu": "فانواتو",
};

function normalizeName(value: string) {
  const name = value.replace(/\s+/g, " ").trim();
  if (/st\.?\s*kitts/i.test(name)) return "Saint Kitts & Nevis";
  if (/st\.?\s*lucia/i.test(name)) return "Saint Lucia";
  if (/antigua/i.test(name)) return "Antigua & Barbuda";
  if (/s[aã]o tom/i.test(name)) return "São Tomé and Príncipe";
  return name;
}

function slugFromUrl(value: string) {
  const url = new URL(value);
  return url.pathname.split("/").filter(Boolean).pop() || "program";
}

export async function fetchProgramsFromElevay() {
  const programs: Array<{ category: "residency" | "citizenship"; nameEn: string; nameAr: string | null; country: string; sourceUrl: string; imageUrl: string | null; slug: string; sourceHash: string }> = [];
  for (const source of SOURCES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(source.url, { signal: controller.signal, headers: { "user-agent": "ElevayClientContentSync/1.0" } });
      if (!response.ok) throw new Error(`${source.category} source returned ${response.status}`);
      const html = await response.text();
      const $ = load(html);
      const seen = new Set<string>();
      $("h3 a").each((_index, element) => {
        const href = $(element).attr("href");
        const rawName = $(element).text();
        if (!href || !href.includes(source.path) || href.replace(/\/+$/, "") === source.url.replace(/\/+$/, "")) return;
        const absoluteUrl = new URL(href, source.url).toString();
        const slug = slugFromUrl(absoluteUrl);
        if (seen.has(slug)) return;
        const nameEn = normalizeName(rawName);
        if (!nameEn || nameEn.length > 100) return;
        const image = $(element).closest(".elementor-column").find("img").first();
        const rawImageUrl = image.attr("data-src") || image.attr("data-lazy-src") || image.attr("src") || "";
        const imageUrl = rawImageUrl.startsWith("http") ? rawImageUrl : null;
        seen.add(slug);
        programs.push({
          category: source.category,
          nameEn,
          nameAr: ARABIC_PROGRAM_NAMES[nameEn] ?? null,
          country: nameEn,
          sourceUrl: absoluteUrl,
          imageUrl,
          slug: `${source.category}-${slug}`,
          sourceHash: createHash("sha256").update(`${source.category}|${nameEn}|${absoluteUrl}|${imageUrl || ""}`).digest("hex"),
        });
      });
      if (seen.size < 3) throw new Error(`${source.category} parser returned only ${seen.size} programs`);
    } finally {
      clearTimeout(timer);
    }
  }
  return programs;
}

export async function runPublicContentSync(triggerType: "scheduled" | "manual") {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(publicContentSyncRuns).values({ triggerType, status: "running" });
  const [run] = await db.select().from(publicContentSyncRuns).orderBy(desc(publicContentSyncRuns.id)).limit(1);
  const runId = run?.id;
  const attemptedAt = new Date();
  try {
    const scraped = await fetchProgramsFromElevay();
    const existingActive = await db.select({ id: publicPrograms.id }).from(publicPrograms).where(eq(publicPrograms.isActive, true));
    if (existingActive.length >= 10 && scraped.length < Math.ceil(existingActive.length * 0.6)) {
      throw new Error(`parser count dropped from ${existingActive.length} to ${scraped.length}; last-known-good content retained`);
    }
    let created = 0;
    let updated = 0;
    for (let index = 0; index < scraped.length; index += 1) {
      const program = scraped[index];
      const [existing] = await db.select().from(publicPrograms).where(eq(publicPrograms.slug, program.slug)).limit(1);
      if (!existing) {
        await db.insert(publicPrograms).values({
          publicId: randomUUID(),
          ...program,
          summaryEn: `${program.nameEn} ${program.category === "residency" ? "residency" : "citizenship"} programme. Contact Elevay for a personalised eligibility assessment.`,
          summaryAr: `برنامج ${program.category === "residency" ? "الإقامة" : "الجنسية"} في ${program.nameAr ?? program.nameEn}. تواصل مع إليفاي لتقييم الأهلية وفق حالتك.`,
          displayOrder: index,
          lastSyncedAt: attemptedAt,
        });
        created += 1;
      } else if (!existing.isOverridden) {
        await db.update(publicPrograms).set({
          nameEn: program.nameEn,
          nameAr: program.nameAr,
          country: program.country,
          sourceUrl: program.sourceUrl,
          imageUrl: program.imageUrl,
          sourceHash: program.sourceHash,
          isActive: true,
          displayOrder: index,
          lastSyncedAt: attemptedAt,
        }).where(eq(publicPrograms.id, existing.id));
        updated += 1;
      }
    }
    const scrapedSlugs = scraped.map(program => program.slug);
    if (scrapedSlugs.length) {
      await db.update(publicPrograms).set({ isActive: false, lastSyncedAt: attemptedAt }).where(and(eq(publicPrograms.isOverridden, false), notInArray(publicPrograms.slug, scrapedSlugs)));
    }
    if (runId) await db.update(publicContentSyncRuns).set({ status: "success", programsFound: scraped.length, programsCreated: created, programsUpdated: updated, completedAt: new Date() }).where(eq(publicContentSyncRuns.id, runId));
    await db.insert(publicContentSyncSettings).values({ id: 1, lastSuccessfulAt: attemptedAt, lastAttemptAt: attemptedAt, lastError: null }).onDuplicateKeyUpdate({ set: { lastSuccessfulAt: attemptedAt, lastAttemptAt: attemptedAt, lastError: null } });
    return { programsFound: scraped.length, programsCreated: created, programsUpdated: updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runId) await db.update(publicContentSyncRuns).set({ status: "failed", errorMessage: message.slice(0, 4000), completedAt: new Date() }).where(eq(publicContentSyncRuns.id, runId));
    await db.insert(publicContentSyncSettings).values({ id: 1, lastAttemptAt: attemptedAt, lastError: message.slice(0, 4000) }).onDuplicateKeyUpdate({ set: { lastAttemptAt: attemptedAt, lastError: message.slice(0, 4000) } });
    throw error;
  }
}

export function registerPublicContentRoutes(app: Express) {
  app.use("/public-api", (_req: Request, res: Response, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Device-Name, X-OS-Version, X-App-Version");
    if (_req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.get("/public-api/programs", async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "service_unavailable" });
      const category = req.query.category;
      const rows = category === "residency" || category === "citizenship"
        ? await db.select().from(publicPrograms).where(and(eq(publicPrograms.isActive, true), eq(publicPrograms.category, category))).orderBy(asc(publicPrograms.displayOrder), asc(publicPrograms.nameEn))
        : await db.select().from(publicPrograms).where(eq(publicPrograms.isActive, true)).orderBy(asc(publicPrograms.category), asc(publicPrograms.displayOrder), asc(publicPrograms.nameEn));
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
      return res.json(rows.map(row => ({ publicId: row.publicId, slug: row.slug, category: row.category, nameEn: row.nameEn, nameAr: row.nameAr, country: row.country, summaryEn: row.summaryEn, summaryAr: row.summaryAr, details: row.details, imageUrl: row.imageUrl, sourceUrl: row.sourceUrl })));
    } catch (error) {
      console.error("[PublicContent] programs failed:", error);
      return res.status(500).json({ error: "programs_unavailable" });
    }
  });

  app.get("/public-api/programs/:publicId", async (req: Request, res: Response) => {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "service_unavailable" });
    const [row] = await db.select().from(publicPrograms).where(and(eq(publicPrograms.publicId, req.params.publicId), eq(publicPrograms.isActive, true))).limit(1);
    if (!row) return res.status(404).json({ error: "not_found" });
    return res.json({ publicId: row.publicId, slug: row.slug, category: row.category, nameEn: row.nameEn, nameAr: row.nameAr, country: row.country, summaryEn: row.summaryEn, summaryAr: row.summaryAr, details: row.details, imageUrl: row.imageUrl, sourceUrl: row.sourceUrl });
  });

  app.get("/public-api/service-providers", async (req: Request, res: Response) => {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "service_unavailable" });
    const type = req.query.type;
    const rows = type === "lawyer" || type === "accountant" || type === "service_facilitator"
      ? await db.select().from(publicServiceProviders).where(and(eq(publicServiceProviders.isActive, true), eq(publicServiceProviders.providerType, type))).orderBy(asc(publicServiceProviders.displayOrder), asc(publicServiceProviders.name))
      : await db.select().from(publicServiceProviders).where(eq(publicServiceProviders.isActive, true)).orderBy(asc(publicServiceProviders.displayOrder), asc(publicServiceProviders.name));
    return res.json(rows.map(row => ({ publicId: row.publicId, providerType: row.providerType, name: row.name, country: row.country, city: row.city, logoUrl: row.logoUrl, description: row.description, services: row.services, price: row.price, currency: row.currency, phone: row.phone, whatsapp: row.whatsapp, email: row.email, website: row.website, languages: row.languages, availability: row.availability })));
  });

  app.get("/public-api/service-providers/:publicId", async (req: Request, res: Response) => {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "service_unavailable" });
    const [row] = await db.select().from(publicServiceProviders).where(and(eq(publicServiceProviders.publicId, req.params.publicId), eq(publicServiceProviders.isActive, true))).limit(1);
    if (!row) return res.status(404).json({ error: "not_found" });
    return res.json(row);
  });
}
