import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

// The admin landing: send each role to a page it can actually open. Admins get Venue & Courts (the
// long-standing default); front-desk staff get their Front desk tab. Without this, the "Admin" link
// pointing straight at an admin-only page bounced front-desk users back to the home page.
export default async function AdminIndex() {
  const { role } = await requireStaff();
  redirect(role === "admin" ? "/admin/venue" : "/admin/front-desk");
}
