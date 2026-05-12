import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  // Return cached client only if it was successfully created
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    // Ne bacamo grešku — vraćamo null da app može raditi bez Supabase-a
    // (npr. u sandbox/preview okruženju bez env varijabli)
    console.warn("[supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — Supabase disabled.");
    return null;
  }

  client = createBrowserClient(url, anonKey);
  return client;
}
