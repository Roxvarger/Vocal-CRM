import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RepertoireClient from "./repertoire-client";

export default async function RepertoirePage({
  searchParams,
}: {
  searchParams: { student?: string };
}) {
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

  // Репертуар ведут администратор, менеджер и преподаватель — ученикам и их
  // представителям личный вход пока не сделан, эта версия только для студии
  if (profile.role === "student") {
    redirect("/dashboard");
  }

  const { data: students } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "student")
    .eq("is_active", true)
    .order("full_name");

  const { data: subjects } = await supabase
    .from("lesson_subjects")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
            ← Личный кабинет
          </Link>
        </div>

        <RepertoireClient
          currentUser={{ id: profile.id, fullName: profile.full_name }}
          students={students ?? []}
          subjects={subjects ?? []}
          initialStudentId={searchParams.student ?? null}
        />
      </div>
    </main>
  );
}
