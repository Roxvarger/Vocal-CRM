import { redirect } from "next/navigation";
import Link from "next/link";
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

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href="/dashboard/schedule"
            className="rounded-2xl bg-white p-6 shadow-md transition hover:shadow-lg"
          >
            <h2 className="font-semibold text-slate-800">Расписание</h2>
            <p className="mt-1 text-sm text-slate-500">
              Записи на занятия по неделям, с защитой от накладок
            </p>
          </Link>

          {profile?.role === "admin" || profile?.role === "manager" ? (
            <Link
              href="/dashboard/students"
              className="rounded-2xl bg-white p-6 shadow-md transition hover:shadow-lg"
            >
              <h2 className="font-semibold text-slate-800">Ученики и абонементы</h2>
              <p className="mt-1 text-sm text-slate-500">
                Список учеников, карточки, выдача абонементов
              </p>
            </Link>
          ) : (
            <div className="rounded-2xl bg-white p-6 text-slate-400 shadow-md">
              <h2 className="font-semibold">Ученики и абонементы</h2>
              <p className="mt-1 text-sm">Скоро появится здесь</p>
            </div>
          )}

          {(profile?.role === "admin" || profile?.role === "manager") && (
            <Link
              href="/dashboard/payments"
              className="rounded-2xl bg-white p-6 shadow-md transition hover:shadow-lg"
            >
              <h2 className="font-semibold text-slate-800">Оплата занятий</h2>
              <p className="mt-1 text-sm text-slate-500">
                Отметка оплаты разовых и пробных занятий
              </p>
            </Link>
          )}

          {profile?.role !== "student" && (
            <Link
              href="/dashboard/tariffs"
              className="rounded-2xl bg-white p-6 shadow-md transition hover:shadow-lg"
            >
              <h2 className="font-semibold text-slate-800">Тарифы</h2>
              <p className="mt-1 text-sm text-slate-500">
                {profile?.role === "admin"
                  ? "Общий прайс и персональные условия учеников"
                  : "Общий прайс абонементов и занятий"}
              </p>
            </Link>
          )}

          {profile?.role !== "student" && (
            <Link
              href="/dashboard/repertoire"
              className="rounded-2xl bg-white p-6 shadow-md transition hover:shadow-lg"
            >
              <h2 className="font-semibold text-slate-800">Репертуар</h2>
              <p className="mt-1 text-sm text-slate-500">
                Произведения учеников и их готовность к выступлениям
              </p>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
