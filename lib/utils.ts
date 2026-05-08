import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Returns the current time as an ISO 8601 string. */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Generates a sortable, prefixed unique ID.
 * Format: `{prefix}-{timestamp}-{random4hex}`
 * Example: `ses-1714000000000-a3f1`
 */
export function genId(prefix: string): string {
  const ts = Date.now().toString();
  const rnd = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `${prefix}-${ts}-${rnd}`;
}
