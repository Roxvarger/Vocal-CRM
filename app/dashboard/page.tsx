import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./logout-button";

// Человекопонятные названия ролей — техническое значение в базе данных
// (admin/manager/teacher/student) остаётся английским, а на экране показываем русский текст.
const ROLE_LABELS: Record<string, string> = {
  admin: "Главный администратор",
  manager: "Администратор",
  teacher: "Преподаватель",
  student: "Ученик",
};

export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Подтягиваем профиль (имя и роль) из нашей таблицы public.profiles.
  // RLS-правило "self read" гарантирует, что мы получим ровно одну строку —
  // свою собственную, даже если бы в запросе не было условия id = user.id.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const roleLabel = profile ? ROLE_LABELS[profile.role] ?? profile.role : "—";

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between rounded-2xl bg-white p-6 shadow-md">
          <div>
            <p className="text-sm text-slate-500">Добро пожаловать,</p>
            <h1 className="text-2xl font-semibold text-slate-800">
              {profile?.full_name ?? "Без имени"}
            </h1>
            <p className="mt-1 inline-block rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
              {roleLabel}
            </p>
          </div>
          <LogoutButton />
        </div>

        <div className="mt-6 rounded-2xl bg-white p-6 text-slate-500 shadow-md">
          Здесь скоро появится расписание, ученики и абонементы — мы будем
          добавлять разделы по одному, шаг за шагом.
        </div>
      </div>
    </main>
  );
}
