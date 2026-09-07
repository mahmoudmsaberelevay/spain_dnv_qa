import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { leads } from "../drizzle/schema";
import { getDb } from "./db";
import {
  normalizeLeadContacts,
  resolveLeadContactCandidates,
  type LeadContactInput,
} from "./leadContactIdentity";

type DbLike = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type QueryExecutor = { select: DbLike["select"] };

export async function findLeadContactMatch(
  input: LeadContactInput & { isMetaTestLead?: boolean },
  executor?: QueryExecutor,
) {
  const db = executor || await getDb();
  if (!db) throw new Error("DB not available");
  const contact = normalizeLeadContacts(input);
  if (!contact.phones.length && !contact.email) {
    return resolveLeadContactCandidates(input, []);
  }

  const conditions = [];
  if (contact.phones.length) {
    const rawDigitVariants = Array.from(new Set(contact.phones.flatMap(phone => {
      const digits = phone.replace(/\D/g, "");
      const variants = [digits, `00${digits}`];
      if (digits.startsWith("20") && digits.length === 12) {
        variants.push(`0${digits.slice(2)}`, digits.slice(2));
      }
      return variants;
    })));
    const rawDigitsSql = sql.join(rawDigitVariants.map(value => sql`${value}`), sql`, `);
    conditions.push(
      inArray(leads.normalizedPhone, contact.phones),
      sql`REGEXP_REPLACE(COALESCE(${leads.phone}, ''), '[^0-9]', '') IN (${rawDigitsSql})`,
      sql`REGEXP_REPLACE(COALESCE(${leads.whatsapp}, ''), '[^0-9]', '') IN (${rawDigitsSql})`,
    );
  }
  if (contact.email) {
    conditions.push(
      eq(leads.normalizedEmail, contact.email),
      sql`LOWER(TRIM(COALESCE(${leads.email}, ''))) = ${contact.email}`,
    );
  }

  const rows = await db.select({
    id: leads.id,
    fullName: leads.fullName,
    phone: leads.phone,
    whatsapp: leads.whatsapp,
    email: leads.email,
    normalizedPhone: leads.normalizedPhone,
    normalizedEmail: leads.normalizedEmail,
  }).from(leads)
    .where(and(
      eq(leads.isMetaTestLead, input.isMetaTestLead ?? false),
      or(...conditions),
    ))
    .orderBy(asc(leads.createdAt));

  return resolveLeadContactCandidates(input, rows);
}
