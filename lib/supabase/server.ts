// Клиент Supabase для использования на сервере (в серверных компонентах Next.js).
// Нужен, чтобы Next.js мог прочитать "кто сейчас вошёл в систему" из cookies
// ещё до отправки страницы в браузер пользователя.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // set() может не сработать, если вызывается из серверного компонента
            // (не из route handler / server action) — это ожидаемо и безопасно
            // игнорировать, если рядом есть middleware.ts, который обновляет сессию.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // см. комментарий выше
          }
        },
      },
    }
  );
}
