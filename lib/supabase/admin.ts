// Клиент Supabase с сервисным ключом (service role).
// Работает ТОЛЬКО на сервере (в API-роутах) — этот ключ обходит все правила
// безопасности (RLS) и никогда не должен попадать в браузер пользователя.
// Нужен, например, чтобы создать логин для нового ученика.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
