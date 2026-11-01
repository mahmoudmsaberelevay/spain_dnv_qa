import axios from "axios";
import * as cheerio from "cheerio";

export type ExchangeRateResult = {
  rate: number;
  source: string;
  fetchedAt: Date;
};

export type PostingExchangeRate = ExchangeRateResult & {
  currency: "EGP" | "EUR" | "USD";
};

let cachedEurToEgpRate: ExchangeRateResult | null = null;
let eurToEgpCacheExpiry: Date | null = null;
let cachedEurToUsdRate: ExchangeRateResult | null = null;
let eurToUsdCacheExpiry: Date | null = null;

const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour cache
const DEFAULT_EUR_TO_EGP_RATE = 62.5;

function isPositiveRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isVerifiedRate(result: ExchangeRateResult): boolean {
  return result.source !== "default (all sources unavailable)";
}

/**
 * Returns the display EUR/EGP rate. Existing dashboards can still display the
 * last available quote, but financial writes use getAutomaticPostingExchangeRate
 * below and refuse the placeholder fallback.
 */
export async function getEurToEgpRate(): Promise<ExchangeRateResult> {
  const now = new Date();

  if (cachedEurToEgpRate && eurToEgpCacheExpiry && now < eurToEgpCacheExpiry) {
    return cachedEurToEgpRate;
  }

  const sources = [
    { name: "cibeg.com", fn: fetchEurToEgpFromCibeg },
    { name: "exchangerate-api.com", fn: () => fetchEurQuoteFromExchangeRateApi("EGP") },
    { name: "frankfurter.app", fn: () => fetchEurQuoteFromFrankfurter("EGP") },
  ];

  for (const source of sources) {
    try {
      const rate = await source.fn();
      cachedEurToEgpRate = { rate, source: source.name, fetchedAt: now };
      eurToEgpCacheExpiry = new Date(now.getTime() + CACHE_DURATION_MS);
      return cachedEurToEgpRate;
    } catch (error) {
      console.warn(`[ExchangeRate] ${source.name} failed:`, (error as Error).message);
    }
  }

  if (cachedEurToEgpRate) {
    console.warn("[ExchangeRate] All EUR/EGP sources failed, using cached rate");
    return { ...cachedEurToEgpRate, source: `${cachedEurToEgpRate.source} (cached)` };
  }

  // Display-only fallback. Financial writes explicitly reject this placeholder.
  console.error("[ExchangeRate] All EUR/EGP sources failed, using display fallback");
  return { rate: DEFAULT_EUR_TO_EGP_RATE, source: "default (all sources unavailable)", fetchedAt: now };
}

/** Returns the verified EUR/USD quote needed when a client pays in USD. */
export async function getEurToUsdRate(): Promise<ExchangeRateResult> {
  const now = new Date();

  if (cachedEurToUsdRate && eurToUsdCacheExpiry && now < eurToUsdCacheExpiry) {
    return cachedEurToUsdRate;
  }

  const sources = [
    { name: "exchangerate-api.com", fn: () => fetchEurQuoteFromExchangeRateApi("USD") },
    { name: "frankfurter.app", fn: () => fetchEurQuoteFromFrankfurter("USD") },
  ];

  for (const source of sources) {
    try {
      const rate = await source.fn();
      cachedEurToUsdRate = { rate, source: source.name, fetchedAt: now };
      eurToUsdCacheExpiry = new Date(now.getTime() + CACHE_DURATION_MS);
      return cachedEurToUsdRate;
    } catch (error) {
      console.warn(`[ExchangeRate] ${source.name} failed:`, (error as Error).message);
    }
  }

  if (cachedEurToUsdRate) {
    console.warn("[ExchangeRate] All EUR/USD sources failed, using cached rate");
    return { ...cachedEurToUsdRate, source: `${cachedEurToUsdRate.source} (cached)` };
  }

  throw new Error("No verified EUR/USD quote is available. Please try again shortly.");
}

/**
 * The only source for a new client payment's EUR conversion. The resulting
 * currency-per-EUR rate is stored with the payment, so later rate changes never
 * alter the historic EUR equivalent or remaining balance.
 */
export async function getAutomaticPostingExchangeRate(
  currency: "EGP" | "EUR" | "USD",
): Promise<PostingExchangeRate> {
  if (currency === "EUR") {
    return { rate: 1, currency, source: "EUR parity", fetchedAt: new Date() };
  }

  const quote = currency === "EGP" ? await getEurToEgpRate() : await getEurToUsdRate();
  if (!isVerifiedRate(quote) || !isPositiveRate(quote.rate)) {
    throw new Error(`No verified EUR/${currency} rate is available. Please try again shortly.`);
  }

  return { ...quote, currency };
}

async function fetchEurToEgpFromCibeg(): Promise<number> {
  const response = await axios.get("https://www.cibeg.com/en/currency-converter", {
    timeout: 8000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Referer": "https://www.cibeg.com/",
    },
  });

  if (response.data && (response.data.includes("hCaptcha") || response.data.includes("Imperva") || response.data.includes("security check"))) {
    throw new Error("cibeg.com returned security challenge page");
  }

  const $ = cheerio.load(response.data);
  let eurRate: number | null = null;
  const selectors = ["table tr", ".currency-row", ".rate-row", "[data-currency='EUR']", "[data-code='EUR']", ".eur-rate", "td"];

  for (const selector of selectors) {
    $(selector).each((_: number, el: ReturnType<typeof $>[0]) => {
      const text = $(el).text();
      if (text.includes("EUR") || text.includes("Euro")) {
        const numbers = text.match(/[\d,]+\.?\d*/g);
        if (numbers) {
          for (const num of numbers) {
            const value = Number.parseFloat(num.replace(/,/g, ""));
            if (value > 40 && value < 200) {
              eurRate = value;
              return false;
            }
          }
        }
      }
    });
    if (eurRate) break;
  }

  if (!eurRate) throw new Error("Could not parse EUR/EGP rate from cibeg.com");
  return eurRate;
}

async function fetchEurQuoteFromExchangeRateApi(currency: "EGP" | "USD"): Promise<number> {
  const response = await axios.get("https://api.exchangerate-api.com/v4/latest/EUR", { timeout: 8000 });
  const rate = response.data?.rates?.[currency];
  if (!isPositiveRate(rate)) throw new Error("Invalid response from exchangerate-api.com");
  return rate;
}

async function fetchEurQuoteFromFrankfurter(currency: "EGP" | "USD"): Promise<number> {
  const response = await axios.get(`https://api.frankfurter.app/latest?from=EUR&to=${currency}`, { timeout: 8000 });
  const rate = response.data?.rates?.[currency];
  if (!isPositiveRate(rate)) throw new Error("Invalid response from frankfurter.app");
  return rate;
}

export function convertEurToEgp(eurAmount: number, rate: number): number {
  return Math.round(eurAmount * rate * 100) / 100;
}

/** Force-refresh the EUR/EGP display cache at the scheduled Cairo refresh times. */
export async function forceRefreshRate(): Promise<ExchangeRateResult> {
  cachedEurToEgpRate = null;
  eurToEgpCacheExpiry = null;
  const result = await getEurToEgpRate();
  console.log(`[ExchangeRate] Scheduled refresh: 1 EUR = ${result.rate} EGP (source: ${result.source})`);
  return result;
}
