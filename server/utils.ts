import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string = "EUR"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "pending": return "bg-yellow-100 text-yellow-800 border border-yellow-200 hover:bg-yellow-100";
    case "signed": return "bg-green-100 text-green-800 border border-green-200 hover:bg-green-100";
    case "cancelled": return "bg-red-100 text-red-800 border border-red-200 hover:bg-red-100";
    case "paid": return "bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-100";
    case "unpaid": return "bg-orange-100 text-orange-800 border border-orange-200 hover:bg-orange-100";
    default: return "bg-gray-100 text-gray-800 border border-gray-200 hover:bg-gray-100";
  }
}
