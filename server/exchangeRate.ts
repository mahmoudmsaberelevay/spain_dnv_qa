import axios from "axios";
import * as cheerio from "cheerio";

interface ExchangeRateResult {
  rate: number;
  source: string;
  fetchedAt: Date;
}

let cachedRate: ExchangeRateResult | null = null;
let cacheExpiry: Date | null = null;

const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour cache

export async function getEurToEgpRate(): Promise<ExchangeRateResult> {
  const now = new Date();

  // Return cached rate if still valid
  if (cachedRate && cacheExpiry && now < cacheExpiry) {
    return cachedRate;
  }

  // Try sources in order of preference
  const sources = [
    { name: "cibeg.com", fn: fetchFromCibeg },
    { name: "exchangerate-api.com", fn: fetchFromExchangeRateApi },
    { name: "frankfurter.app", fn: fetchFromFrankfurter },
  ];

  for (const source of sources) {
    try {
      const rate = await source.fn();
      cachedRate = { rate, source: source.name, fetchedAt: now };
      cacheExpiry = new Date(now.getTime() + CACHE_DURATION_MS);
      return cachedRate;
    } catch (error) {
      console.warn(`[ExchangeRate] ${source.name} failed:`, (error as Error).message);
    }
  }

  // Return last cached rate if available
  if (cachedRate) {
    console.warn("[ExchangeRate] All sources failed, using cached rate");
    return { ...cachedRate, source: `${cachedRate.source} (cached)` };
  }

  // Last resort default (approximate market rate)
  console.error("[ExchangeRate] All sources failed, using default rate");
  return { rate: 62.5, source: "default (all sources unavailable)", fetchedAt: now };
}

async function fetchFromCibeg(): Promise<number> {
  const response = await axios.get("https://www.cibeg.com/en/currency-converter", {
    timeout: 8000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Referer": "https://www.cibeg.com/",
    },
  });

  // Check if we got a CAPTCHA/security page
  if (response.data && (response.data.includes("hCaptcha") || response.data.includes("Imperva") || response.data.includes("security check"))) {
    throw new Error("cibeg.com returned security challenge page");
  }

  const $ = cheerio.load(response.data);
  let eurRate: number | null = null;

  // Try multiple selectors for the EUR rate
  const selectors = [
    "table tr",
    ".currency-row",
    ".rate-row",
    "[data-currency='EUR']",
    "[data-code='EUR']",
    ".eur-rate",
    "td",
  ];

  for (const selector of selectors) {
    $(selector).each((_: number, el: ReturnType<typeof $>[0]) => {
      const text = $(el).text();
      if (text.includes("EUR") || text.includes("Euro")) {
        const numbers = text.match(/[\d,]+\.?\d*/g);
        if (numbers) {
          for (const num of numbers) {
            const val = parseFloat(num.replace(/,/g, ""));
            if (val > 40 && val < 200) {
              eurRate = val;
              return false; // break
            }
          }
        }
      }
    });
    if (eurRate) break;
  }

  if (!eurRate) {
    throw new Error("Could not parse EUR/EGP rate from cibeg.com");
  }

  return eurRate;
}

async function fetchFromExchangeRateApi(): Promise<number> {
  const response = await axios.get("https://api.exchangerate-api.com/v4/latest/EUR", {
    timeout: 8000,
  });
  const egpRate = response.data?.rates?.EGP;
  if (!egpRate || typeof egpRate !== "number") {
    throw new Error("Invalid response from exchangerate-api.com");
  }
  return egpRate;
}

async function fetchFromFrankfurter(): Promise<number> {
  const response = await axios.get("https://api.frankfurter.app/latest?from=EUR&to=EGP", {
    timeout: 8000,
  });
  const egpRate = response.data?.rates?.EGP;
  if (!egpRate || typeof egpRate !== "number") {
    throw new Error("Invalid response from frankfurter.app");
  }
  return egpRate;
}

export function convertEurToEgp(eurAmount: number, rate: number): number {
  return Math.round(eurAmount * rate * 100) / 100;
}

/**
 * Force-refresh the exchange rate cache regardless of expiry.
 * Called by the scheduled refresher at 9am, 1pm, 3pm Cairo time.
 */
export async function forceRefreshRate(): Promise<ExchangeRateResult> {
  // Clear cache to force a fresh fetch
  cachedRate = null;
  cacheExpiry = null;
  const result = await getEurToEgpRate();
  console.log(`[ExchangeRate] Scheduled refresh: 1 EUR = ${result.rate} EGP (source: ${result.source})`);
  return result;
}
