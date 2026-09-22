// Создание нового ученика.
// Каждый профиль в базе обязательно привязан к учётной записи входа (auth.users),
// а создавать такие записи можно только сервисным ключом — поэтому это отдельный
// серверный маршрут, а не обычный запрос из браузера.
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

  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const fullName = (body?.fullName ?? "").trim();
  const phone = (body?.phone ?? "").trim();
  const emailInput = (body?.email ?? "").trim();

  if (!fullName) {
    return NextResponse.json({ error: "Укажите имя ученика" }, { status: 400 });
  }

  // Если email не указан — ученику пока не нужен вход в личный кабинет,
  // но в базе каждая запись в profiles обязана ссылаться на реальную учётную
  // запись. Поэтому создаём техническую (внутреннюю) учётную запись — её
  // никто не будет использовать для входа, пока администратор не впишет
  // настоящий email отдельно.
  const email = emailInput || `student.${crypto.randomUUID()}@internal.vocal-crm.local`;
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
    phone: phone || null,
    role: "student",
    is_active: true,
  });

  if (profileError) {
    // Не оставляем "осиротевшую" учётную запись без профиля
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ id: created.user.id });
}
