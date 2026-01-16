/**
 * Supabase Browser Client
 *
 * Creates a Supabase client for browser-side operations.
 * Uses dynamic import to avoid SSR issues.
 */
import type { Database } from "database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Get or create a Supabase browser client singleton
 * Uses dynamic import to avoid SSR module loading issues
 */
export async function getSupabaseBrowserClient(): Promise<SupabaseClient<Database>> {
  if (browserClient) return browserClient;

  if (typeof window === "undefined") {
    throw new Error("Browser client can only be used in browser environment");
  }

  // Dynamic import to avoid SSR issues
  const { createClient } = await import("@supabase/supabase-js");

  const supabaseUrl = window.ENV?.SUPABASE_URL;
  const supabaseAnonKey = window.ENV?.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables not found");
  }

  browserClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
  return browserClient;
}

// Type declaration for window.ENV
declare global {
  interface Window {
    ENV?: {
      SUPABASE_URL?: string;
      SUPABASE_ANON_KEY?: string;
    };
  }
}
