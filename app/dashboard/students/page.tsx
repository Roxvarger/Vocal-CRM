import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StudentsClient from "./students-client";

export default async function StudentsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  // Раздел "Ученики и абонементы" — только для администратора и менеджеров
  if (profile.role !== "admin" && profile.role !== "manager") {
    redirect("/dashboard");
  }

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
            ← Личный кабинет
          </Link>
        </div>

        <StudentsClient
          currentUser={{
            id: profile.id,
            fullName: profile.full_name,
            role: profile.role as "admin" | "manager" | "teacher" | "student",
          }}
          locations={locations ?? []}
        />
      </div>
    </main>
  );
}
