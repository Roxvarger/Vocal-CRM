// Создание нового преподавателя.
// В отличие от ученика, преподавателю нужен реальный вход в приложение (он сам
// смотрит своё расписание), поэтому email здесь обязателен — на него будет
// привязана учётная запись. Пароль генерируется случайный; администратор
// сообщает его преподавателю сам (отдельного письма приложение пока не шлёт).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Ставки преподавателей — это, по сути, зарплатные данные, поэтому раздел
  // «Преподаватели» доступен только главному администратору.
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const fullName = (body?.fullName ?? "").trim();
  const shortName = (body?.shortName ?? "").trim();
  const email = (body?.email ?? "").trim();
  const phone = (body?.phone ?? "").trim();

  if (!fullName) {
    return NextResponse.json({ error: "Укажите ФИО преподавателя" }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json({ error: "Укажите email — он нужен для входа преподавателя" }, { status: 400 });
  }

  const password = crypto.randomUUID();
  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Не удалось создать учётную запись" },
      { status: 400 }
    );
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: fullName,
    short_name: shortName || null,
    phone: phone || null,
    role: "teacher",
    is_active: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ id: created.user.id, temporaryPassword: password });
}
