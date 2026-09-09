export type MarketingComparisonCategory = "residency" | "citizenship";

export type MarketingComparisonProgram = {
  key: string;
  label: string;
  flag: string;
  category: MarketingComparisonCategory;
};

export const MARKETING_COMPARISON_PROGRAMS: MarketingComparisonProgram[] = [
  { key: "spain_dnv", label: "Spain Digital Nomad Residency", flag: "🇪🇸", category: "residency" },
  { key: "portugal_d7", label: "Portugal D7 Residency", flag: "🇵🇹", category: "residency" },
  { key: "portugal_d8", label: "Portugal D8 Digital Nomad", flag: "🇵🇹", category: "residency" },
  { key: "portugal_d2", label: "Portugal D2 Entrepreneur", flag: "🇵🇹", category: "residency" },
  { key: "greece_golden_visa", label: "Greece Golden Visa", flag: "🇬🇷", category: "residency" },
  { key: "malta_mprp", label: "Malta Permanent Residence", flag: "🇲🇹", category: "residency" },
  { key: "uk_expansion_worker", label: "UK Expansion Worker", flag: "🇬🇧", category: "residency" },
  { key: "canada_skilled_migration", label: "Canada Skilled Migration", flag: "🇨🇦", category: "residency" },
  { key: "dominica", label: "Dominica", flag: "🇩🇲", category: "citizenship" },
  { key: "grenada", label: "Grenada", flag: "🇬🇩", category: "citizenship" },
  { key: "egypt", label: "Egypt", flag: "🇪🇬", category: "citizenship" },
  { key: "st_kitts", label: "Saint Kitts & Nevis", flag: "🇰🇳", category: "citizenship" },
  { key: "st_lucia", label: "Saint Lucia", flag: "🇱🇨", category: "citizenship" },
  { key: "antigua", label: "Antigua & Barbuda", flag: "🇦🇬", category: "citizenship" },
  { key: "vanuatu", label: "Vanuatu", flag: "🇻🇺", category: "citizenship" },
  { key: "nauru", label: "Nauru", flag: "🇳🇷", category: "citizenship" },
  { key: "sao_tome", label: "São Tomé & Príncipe", flag: "🇸🇹", category: "citizenship" },
  { key: "turkey", label: "Turkey", flag: "🇹🇷", category: "citizenship" },
];

export function getMarketingComparisonProgram(key: string) {
  return MARKETING_COMPARISON_PROGRAMS.find(program => program.key === key);
}
