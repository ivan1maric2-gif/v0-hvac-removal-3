/**
 * Centralized status colour tokens.
 * All severity-based UI (status card, pH card, alerts, next step, summary)
 * must use this function instead of hardcoded Tailwind classes.
 *
 * In dark mode   → uses deep coloured backgrounds with light text (legible on navy).
 * In light mode  → uses pale tinted backgrounds with very dark text (legible on white).
 */

export type Severity = "ok" | "warn" | "critical" | "info" | "neutral";

export interface StatusTheme {
  card: string;       // wrapper card bg + border
  text: string;       // primary foreground text
  subtext: string;    // secondary / label text
  badge: string;      // small badge bg + text
  btn: string;        // secondary action button
  dot: string;        // coloured indicator dot bg
}

export function getStatusTheme(severity: Severity, isDark: boolean): StatusTheme {
  if (isDark) {
    switch (severity) {
      case "ok":
        return {
          card:    "bg-green-900 border border-green-700",
          text:    "text-green-100",
          subtext: "text-green-300",
          badge:   "bg-green-800 text-green-100",
          btn:     "bg-green-800 text-green-100 border border-green-600 hover:bg-green-700",
          dot:     "bg-green-400",
        };
      case "warn":
        return {
          card:    "bg-rose-800 border border-rose-600",
          text:    "text-rose-50",
          subtext: "text-rose-200",
          badge:   "bg-rose-700 text-rose-50",
          btn:     "bg-rose-700 text-rose-50 border border-rose-500 hover:bg-rose-600",
          dot:     "bg-rose-300",
        };
      case "critical":
        return {
          card:    "bg-rose-900 border border-rose-700",
          text:    "text-rose-50",
          subtext: "text-rose-200",
          badge:   "bg-rose-800 text-rose-50",
          btn:     "bg-rose-800 text-rose-50 border border-rose-600 hover:bg-rose-700",
          dot:     "bg-rose-300",
        };
      case "info":
        return {
          card:    "bg-blue-900 border border-blue-700",
          text:    "text-blue-100",
          subtext: "text-blue-300",
          badge:   "bg-blue-800 text-blue-100",
          btn:     "bg-blue-800 text-blue-100 border border-blue-600 hover:bg-blue-700",
          dot:     "bg-blue-400",
        };
      default: // neutral
        return {
          card:    "bg-slate-800 border border-slate-700",
          text:    "text-slate-100",
          subtext: "text-slate-300",
          badge:   "bg-slate-700 text-slate-100",
          btn:     "bg-slate-700 text-slate-100 border border-slate-600 hover:bg-slate-600",
          dot:     "bg-slate-400",
        };
    }
  }

  // Light mode — pale tinted bg + dark text
  switch (severity) {
    case "ok":
      return {
        card:    "bg-green-50 border border-green-300",
        text:    "text-green-800",
        subtext: "text-green-700",
        badge:   "bg-green-100 text-green-800",
        btn:     "bg-white text-green-900 border border-green-300 hover:bg-green-50",
        dot:     "bg-green-500",
      };
    case "warn":
      return {
        card:    "bg-rose-50 border border-rose-300",
        text:    "text-rose-900",
        subtext: "text-rose-700",
        badge:   "bg-rose-100 text-rose-900",
        btn:     "bg-white text-rose-900 border border-rose-300 hover:bg-rose-50",
        dot:     "bg-rose-500",
      };
    case "critical":
      return {
        card:    "bg-rose-100 border border-rose-400",
        text:    "text-rose-950",
        subtext: "text-rose-800",
        badge:   "bg-rose-200 text-rose-950",
        btn:     "bg-white text-rose-950 border border-rose-400 hover:bg-rose-50",
        dot:     "bg-rose-600",
      };
    case "info":
      return {
        card:    "bg-blue-50 border border-blue-300",
        text:    "text-blue-900",
        subtext: "text-blue-800",
        badge:   "bg-blue-100 text-blue-900",
        btn:     "bg-white text-blue-900 border border-blue-300 hover:bg-blue-50",
        dot:     "bg-blue-500",
      };
    default: // neutral
      return {
        card:    "bg-slate-50 border border-slate-300",
        text:    "text-slate-900",
        subtext: "text-slate-700",
        badge:   "bg-slate-100 text-slate-900",
        btn:     "bg-white text-slate-900 border border-slate-300 hover:bg-slate-50",
        dot:     "bg-slate-400",
      };
  }
}
