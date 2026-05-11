"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  userMsg: string;
}

/** Sanitizes a raw JS error message into a short, user-safe Croatian string. */
function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  // Never expose secrets, keys, or full Supabase URLs
  if (
    lower.includes("supabaseurl") ||
    lower.includes("anon") ||
    lower.includes("key") ||
    lower.includes("required") ||
    lower.includes("url")
  ) {
    return "Aplikacija nije mogla učitati konfiguraciju. Kontaktirajte podršku.";
  }
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("timeout")) {
    return "Nema veze s internetom ili je server nedostupan. Osvježite stranicu.";
  }
  if (lower.includes("chunk") || lower.includes("loading")) {
    return "Dio aplikacije nije mogao biti učitan. Osvježite stranicu.";
  }
  // Truncate anything longer than 120 chars
  if (raw.length > 120) return raw.slice(0, 120) + "…";
  return raw;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, userMsg: "" };
  }

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, userMsg: sanitizeError(err) };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    // Log to console only — never surface stack traces to the user
    console.warn("[ErrorBoundary] Caught error:", err.message);
    console.warn("[ErrorBoundary] Component stack:", info.componentStack?.slice(0, 300));
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col flex-1 min-h-dvh bg-background items-center justify-center px-6 text-center">
        <div className="w-12 h-12 mb-5 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center shrink-0">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-destructive"
            aria-hidden="true"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <p className="text-base font-bold text-foreground mb-2 leading-snug">
          Neočekivana greška
        </p>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs leading-relaxed break-words overflow-hidden">
          {this.state.userMsg}
        </p>

        <button
          onClick={() => window.location.reload()}
          className="bg-primary text-primary-foreground rounded-xl px-5 py-3 font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
        >
          Osvježi stranicu
        </button>
      </div>
    );
  }
}
