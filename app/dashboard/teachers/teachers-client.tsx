"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ---------- Типы ----------

const CONTACT_CHANNEL_LABELS: Record<string, string> = {
  phone: "Телефон (звонок/SMS)",
  email: "Email",
  vk: "ВКонтакте",
  telegram: "Telegram",
  max: "MAX",
};

type TeacherProfile = {
  id: string;
  full_name: string;
  short_name: string | null;
  phone: string | null;
  contact_email: string | null;
  birth_date: string | null;
  vk_contact: string | null;
  telegram_contact: string | null;
  max_contact: string | null;
  preferred_contact_channel: string | null;
  preferred_contact_note: string | null;
  rate_30: number | null;
  rate_50: number | null;
  is_active: boolean;
};

type SupabaseClient = ReturnType<typeof createClient>;

// ---------- Вспомогательные функции ----------

function formatMoney(n: number): string {
  return `${n.toLocaleString("ru-RU")} ₽`;
}

// ---------- Основной компонент ----------

export default function TeachersClient() {
  const supabase = useMemo(() => createClient(), []);
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);

  async function loadTeachers() {
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, full_name, short_name, phone, contact_email, birth_date, vk_contact, telegram_contact, max_contact, preferred_contact_channel, preferred_contact_note, rate_30, rate_50, is_active"
      )
      .eq("role", "teacher")
      .order("full_name");
    setTeachers(data ?? []);
  }

  useEffect(() => {
    setLoading(true);
    loadTeachers().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTeachers = teachers.filter((t) =>
    t.full_name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const detailTeacher = teachers.find((t) => t.id === detailId) ?? null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Преподаватели</h1>
          <p className="mt-1 text-sm text-slate-500">
            Контакты и ставки преподавателей. «Короткое имя» — как преподаватель будет
            подписан в фильтрах расписания, например «Вероника В.».
          </p>
        </div>
        <button
          onClick={() => setAddModalOpen(true)}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          + Добавить преподавателя
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск по имени…"
        className="mb-4 w-full max-w-sm rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />

      {loading ? (
        <p className="text-sm text-slate-400">Загрузка…</p>
      ) : filteredTeachers.length === 0 ? (
        <p className="text-sm text-slate-400">Преподаватели не найдены</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-4 py-2 font-medium">ФИО</th>
                <th className="px-4 py-2 font-medium">Короткое имя</th>
                <th className="px-4 py-2 font-medium">Телефон</th>
                <th className="px-4 py-2 font-medium">Ставка 30 мин</th>
                <th className="px-4 py-2 font-medium">Ставка 50 мин</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTeachers.map((t) => (
                <tr
                  key={t.id}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                  onClick={() => setDetailId(t.id)}
                >
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <span className={t.is_active ? "text-slate-800" : "text-slate-400 line-through"}>
                      {t.full_name}
                    </span>
                    {!t.is_active && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
                        Архив
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{t.short_name ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{t.phone ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">
                    {t.rate_30 != null ? formatMoney(t.rate_30) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">
                    {t.rate_50 != null ? formatMoney(t.rate_50) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-slate-400">
                    Открыть →
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailTeacher && (
        <TeacherDetailModal
          teacher={detailTeacher}
          supabase={supabase}
          onClose={() => setDetailId(null)}
          onChanged={loadTeachers}
        />
      )}

      {addModalOpen && (
        <AddTeacherModal
          onClose={() => setAddModalOpen(false)}
          onCreated={async () => {
            setAddModalOpen(false);
            await loadTeachers();
          }}
        />
      )}
    </div>
  );
}

// ---------- Карточка преподавателя ----------

function TeacherDetailModal({
  teacher,
  supabase,
  onClose,
  onChanged,
}: {
  teacher: TeacherProfile;
  supabase: SupabaseClient;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    full_name: teacher.full_name,
    short_name: teacher.short_name ?? "",
    phone: teacher.phone ?? "",
    contact_email: teacher.contact_email ?? "",
    birth_date: teacher.birth_date ?? "",
    vk_contact: teacher.vk_contact ?? "",
    telegram_contact: teacher.telegram_contact ?? "",
    max_contact: teacher.max_contact ?? "",
    preferred_contact_channel: teacher.preferred_contact_channel ?? "",
    preferred_contact_note: teacher.preferred_contact_note ?? "",
    rate_30: teacher.rate_30 != null ? String(teacher.rate_30) : "",
    rate_50: teacher.rate_50 != null ? String(teacher.rate_50) : "",
  });
  const [isActive, setIsActive] = useState(teacher.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name,
        short_name: form.short_name || null,
        phone: form.phone || null,
        contact_email: form.contact_email || null,
        birth_date: form.birth_date || null,
        vk_contact: form.vk_contact || null,
        telegram_contact: form.telegram_contact || null,
        max_contact: form.max_contact || null,
        preferred_contact_channel: form.preferred_contact_channel || null,
        preferred_contact_note: form.preferred_contact_note || null,
        rate_30: form.rate_30 ? Number(form.rate_30) : null,
        rate_50: form.rate_50 ? Number(form.rate_50) : null,
        is_active: isActive,
      })
      .eq("id", teacher.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await onChanged();
  }

  const inputClass = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm";
  const labelClass = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Карточка преподавателя</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">Основные данные</p>
            <div className="space-y-2">
              <div>
                <label className={labelClass}>ФИО</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => update("full_name", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Короткое имя для фильтров расписания (например, «Вероника В.»)
                </label>
                <input
                  type="text"
                  value={form.short_name}
                  onChange={(e) => update("short_name", e.target.value)}
                  placeholder="Имя Фамилия."
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Телефон</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Дата рождения</label>
                  <input
                    type="date"
                    value={form.birth_date}
                    onChange={(e) => update("birth_date", e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Email для уведомлений (необязательно)</label>
                <input
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => update("contact_email", e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-400">
                  Это не логин для входа — email для входа задаётся один раз при создании
                  преподавателя и здесь не меняется.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Активный преподаватель (снимите галочку, если больше не работает в студии)
              </label>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">Ставка за занятие</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>За 30 минут, ₽</label>
                <input
                  type="number"
                  value={form.rate_30}
                  onChange={(e) => update("rate_30", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>За 50 минут, ₽</label>
                <input
                  type="number"
                  value={form.rate_50}
                  onChange={(e) => update("rate_50", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">
              Мессенджеры (необязательно — заполняются по мере получения данных)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelClass}>VK</label>
                <input
                  type="text"
                  value={form.vk_contact}
                  onChange={(e) => update("vk_contact", e.target.value)}
                  placeholder="ссылка или id"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Telegram</label>
                <input
                  type="text"
                  value={form.telegram_contact}
                  onChange={(e) => update("telegram_contact", e.target.value)}
                  placeholder="@username"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>MAX</label>
                <input
                  type="text"
                  value={form.max_contact}
                  onChange={(e) => update("max_contact", e.target.value)}
                  placeholder="контакт"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-2">
              <label className={labelClass}>Приоритетный способ связи</label>
              <select
                value={form.preferred_contact_channel}
                onChange={(e) => update("preferred_contact_channel", e.target.value)}
                className={inputClass}
              >
                <option value="">Не указано</option>
                {Object.entries(CONTACT_CHANNEL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={form.preferred_contact_note}
                onChange={(e) => update("preferred_contact_note", e.target.value)}
                placeholder="Уточнение (необязательно)"
                className={`${inputClass} mt-2`}
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {saving ? "Сохраняем…" : "Сохранить изменения"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Новый преподаватель ----------

function AddTeacherModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [fullName, setFullName] = useState("");
  const [shortName, setShortName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      setError("Укажите ФИО и email");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          shortName: shortName.trim(),
          phone: phone.trim(),
          email: email.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Не удалось добавить преподавателя");
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      setCreatedPassword(body.temporaryPassword ?? null);
    } catch {
      setError("Не удалось связаться с сервером");
      setSubmitting(false);
    }
  }

  if (createdPassword) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h2 className="mb-3 text-lg font-semibold text-slate-800">Преподаватель добавлен</h2>
          <p className="mb-3 text-sm text-slate-600">
            Сообщите преподавателю данные для входа — приложение пока не отправляет их само:
          </p>
          <div className="mb-4 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
            <p>
              <span className="text-slate-400">Email: </span>
              {email.trim()}
            </p>
            <p>
              <span className="text-slate-400">Временный пароль: </span>
              <span className="font-mono">{createdPassword}</span>
            </p>
          </div>
          <p className="mb-4 text-xs text-slate-400">
            Остальные данные — короткое имя для расписания, ставки, контакты — можно заполнить
            в карточке преподавателя в списке.
          </p>
          <button
            onClick={async () => {
              await onCreated();
            }}
            className="w-full rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Готово
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Новый преподаватель</h2>
        <p className="mb-3 text-xs text-slate-400">
          Ставки, короткое имя для расписания и остальные контакты можно будет добавить позже —
          откройте карточку преподавателя в списке.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">ФИО</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Короткое имя для фильтров расписания (например, «Вероника В.»)
            </label>
            <input
              type="text"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Телефон</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Email — нужен для входа преподавателя в приложение
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              required
            />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {submitting ? "Добавляем…" : "Добавить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
