import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TariffsClient from "./tariffs-client";

export default async function TariffsPage({
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

  // Ученикам раздел «Тарифы» не показываем — у них пока нет личного кабинета
  if (profile.role === "student") {
    redirect("/dashboard");
  }

  const isAdmin = profile.role === "admin";

  // Общий прайс — видят все (админ/менеджер/преподаватель), но редактировать
  // может только админ. RLS на subscription_plans (is_staff_or_teacher())
  // и так это ограничивает на уровне базы — здесь просто читаем список.
  const { data: plans } = await supabase
    .from("subscription_plans")
    .select("id, name, description, lessons_count, validity_days, price, is_active")
    .order("price");

  // Персональные условия — прерогатива только админа, поэтому подтягиваем
  // список учеников и их персональные ставки только если это админ.
  let students: { id: string; full_name: string }[] = [];
  let personalRates: {
    id: string;
    student_id: string;
    price: number;
    teacher_amount: number;
    is_active: boolean;
  }[] = [];

  if (isAdmin) {
    const { data: studentsData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "student")
      .order("full_name");
    students = studentsData ?? [];

    const { data: ratesData } = await supabase
      .from("personal_lesson_rates")
      .select("id, student_id, price, teacher_amount, is_active");
    personalRates = ratesData ?? [];
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
            ← Личный кабинет
          </Link>
        </div>

        <TariffsClient
          isAdmin={isAdmin}
          plans={plans ?? []}
          students={students}
          initialPersonalRates={personalRates}
          initialStudentId={searchParams.student ?? null}
        />
      </div>
    </main>
  );
}
