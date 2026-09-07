import { asc } from "drizzle-orm";
import { publicPrograms } from "../drizzle/schema";
import { getDb } from "../server/db";

const db = await getDb();
if (!db) throw new Error("Database unavailable");

const rows = await db
  .select({
    id: publicPrograms.id,
    publicId: publicPrograms.publicId,
    slug: publicPrograms.slug,
    category: publicPrograms.category,
    nameEn: publicPrograms.nameEn,
    nameAr: publicPrograms.nameAr,
    country: publicPrograms.country,
    isActive: publicPrograms.isActive,
    isOverridden: publicPrograms.isOverridden,
    details: publicPrograms.details,
  })
  .from(publicPrograms)
  .orderBy(asc(publicPrograms.category), asc(publicPrograms.nameEn));

console.log(JSON.stringify(rows, null, 2));
process.exit(0);
