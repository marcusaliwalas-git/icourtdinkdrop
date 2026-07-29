import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Next.js 15: cookies() is async. Call this fresh in every server component/route/action
// that needs a Supabase client rather than caching the instance.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
            // Called from a Server Component that can't set cookies (e.g. during render).
            // Safe to ignore as long as middleware refreshes the session.
          }
        },
      },
    }
  );
}
