import { getTenant } from "@/lib/tenant";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Resolve the tenant from the hostname so a new signup is pinned to this venue.
  const venue = await getTenant();
  return <LoginForm tenantId={venue?.id ?? null} />;
}
