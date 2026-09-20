"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database.types";
import { env } from "@/lib/env";

/**
 * Supabase-client voor gebruik in Client Components.
 * Maakt telkens een nieuwe instantie; @supabase/ssr regelt
 * intern het hergebruiken van de sessie via cookies.
 */
export function createClient() {
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
}
