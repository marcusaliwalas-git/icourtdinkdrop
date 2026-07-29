import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "./account-form";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, skill_level, role")
    .eq("id", user.id)
    .single();

  return (
    <div className="mx-auto max-w-md p-4">
      <h1 className="mb-1 text-xl font-semibold">My account</h1>
      <p className="mb-6 text-sm text-muted-foreground">{user.email}</p>
      <AccountForm
        fullName={profile?.full_name ?? ""}
        phone={profile?.phone ?? ""}
        skillLevel={profile?.skill_level ?? undefined}
      />
    </div>
  );
}
