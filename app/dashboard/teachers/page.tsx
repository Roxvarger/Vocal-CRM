import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TeachersClient from "./teachers-client";

export default async function TeachersPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  // Ставки преподавателей — зарплатные данные, поэтому раздел доступен
  // только главному администратору (даже не менеджеру).
  if (profile.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
            ← Личный кабинет
          </Link>
        </div>

        <TeachersClient />
      </div>
    </main>
  );
}
