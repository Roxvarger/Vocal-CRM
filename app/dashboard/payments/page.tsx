import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PaymentsClient from "./payments-client";

export default async function PaymentsPage() {
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

  // Учёт оплат — это работа с деньгами, доступна только администратору и менеджеру.
  // Преподаватель видит статус оплаты прямо в расписании, но отмечает оплату
  // здесь только сотрудник, принимающий деньги.
  if (profile.role !== "admin" && profile.role !== "manager") {
    redirect("/dashboard");
  }

  const { data: locations } = await supabase.from("locations").select("id, name").order("name");

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
            ← Личный кабинет
          </Link>
        </div>

        <PaymentsClient locations={locations ?? []} />
      </div>
    </main>
  );
}
