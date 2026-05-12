import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function createClient() {
  // Vrati cached client ako već postoji
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  // Provjeri da su postavljene i da su neprazne
  if (!url || !anonKey) {
    console.warn("[supabase] Env varijable nisu postavljene — Supabase disabled.");
    return null;
  }

  // Provjeri da je URL validan http/https URL
  if (!isValidUrl(url)) {
    console.warn("[supabase] NEXT_PUBLIC_SUPABASE_URL nije validan URL:", url, "— Supabase disabled.");
    return null;
  }

  // Sve provjere prošle — sigurno inicijaliziraj client
  try {
    client = createBrowserClient(url, anonKey);
    return client;
  } catch (err) {
    console.warn("[supabase] createBrowserClient greška:", (err as Error).message, "— Supabase disabled.");
    return null;
  }
}
