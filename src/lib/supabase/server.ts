import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database.types";
import { env } from "@/lib/env";

/**
 * Supabase-client voor gebruik in Server Components, Server Actions
 * en Route Handlers. Moet per request opnieuw aangemaakt worden
 * omdat de cookie store aan het request gebonden is.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll wordt ook aangeroepen vanuit Server Components waar
          // cookies niet geschreven mogen worden. De middleware ververst
          // de sessie in dat geval, dus dit kan veilig genegeerd worden.
        }
      },
    },
  });
}
