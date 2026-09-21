# CRM студии вокала

## Как запустить (для Vercel — ничего устанавливать на компьютер не нужно)

1. Загрузите все эти файлы в свой репозиторий на GitHub.
2. В Vercel: New Project → выберите этот репозиторий.
3. В настройках проекта Vercel (Settings → Environment Variables) добавьте:
   - `NEXT_PUBLIC_SUPABASE_URL` — адрес вашего проекта Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — публичный (anon) ключ Supabase

   Оба значения найдёте в Supabase: Project Settings → API.
4. Нажмите Deploy.

Файл `.env.local.example` — это только образец для справки, он не используется Vercel напрямую и никогда не должен содержать настоящие ключи в загруженном на GitHub виде.
