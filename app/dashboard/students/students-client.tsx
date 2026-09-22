"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// ---------- Типы ----------

type Role = "admin" | "manager" | "teacher" | "student";

type CurrentUser = {
  id: string;
  fullName: string;
  role: Role;
};

type Location = { id: string; name: string };

const CONTACT_CHANNEL_LABELS: Record<string, string> = {
  phone: "Телефон (звонок/SMS)",
  email: "Email",
  vk: "ВКонтакте",
  telegram: "Telegram",
  max: "MAX",
};

type StudentProfile = {
  id: string;
  full_name: string;
  phone: string | null;
  contact_email: string | null;
  guardian_full_name: string | null;
  guardian_phone: string | null;
  birth_date: string | null;
  notes: string | null;
  vk_contact: string | null;
  telegram_contact: string | null;
  max_contact: string | null;
  preferred_contact_channel: string | null;
  preferred_contact_note: string | null;
  is_active: boolean;
};

type SubscriptionPlan = {
  id: string;
  name: string;
  description: string | null;
  lessons_count: number;
  validity_days: number;
  price: number;
  is_active: boolean;
};

type Subscription = {
  id: string;
  student_id: string;
  plan_id: string;
  location_id: string;
  lessons_total: number;
  lessons_used: number;
  lessons_remaining: number;
  status: string;
  starts_at: string;
  expires_at: string;
  plan: { name: string } | null;
};

type PersonalRate = {
  id: string;
  student_id: string;
  price: number;
  teacher_amount: number;
  is_active: boolean;
};

type SupabaseClient = ReturnType<typeof createClient>;

// ---------- Вспомогательные функции ----------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU");
}

function formatMoney(n: number): string {
  return `${n.toLocaleString("ru-RU")} ₽`;
}

function isSubscriptionActive(sub: Subscription): boolean {
  return sub.status === "active" && sub.lessons_remaining > 0 && new Date(sub.expires_at) > new Date();
}

// ---------- Основной компонент ----------

export default function StudentsClient({
  currentUser,
  locations,
}: {
  currentUser: CurrentUser;
  locations: Location[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = currentUser.role === "admin";
  // "Администратор" и "Главный администратор" в терминах студии — это роли manager и admin.
  const isStaff = currentUser.role === "admin" || currentUser.role === "manager";

  const [tab, setTab] = useState<"students" | "plans">("students");

  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [personalRates, setPersonalRates] = useState<PersonalRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [issueModalStudentId, setIssueModalStudentId] = useState<string | null>(null);

  async function loadStudents() {
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, full_name, phone, contact_email, guardian_full_name, guardian_phone, birth_date, notes, vk_contact, telegram_contact, max_contact, preferred_contact_channel, preferred_contact_note, is_active"
      )
      .eq("role", "student")
      .order("full_name");
    setStudents(data ?? []);
  }

  async function loadPlans() {
    // Тарифы доступны только администратору и менеджеру (staff) — преподаватели
    // на эту страницу вообще не попадают, а правило безопасности в Supabase
    // дополнительно не отдаст им эти данные, даже если запрос уйдёт напрямую.
    if (!isStaff) return;
    const { data } = await supabase
      .from("subscription_plans")
      .select("id, name, description, lessons_count, validity_days, price, is_active")
      .order("price");
    setPlans(data ?? []);
  }

  async function loadSubscriptions() {
    const { data } = await supabase
      .from("subscriptions")
      .select(
        "id, student_id, plan_id, location_id, lessons_total, lessons_used, lessons_remaining, status, starts_at, expires_at, plan:plan_id(name)"
      )
      .order("expires_at", { ascending: false });
    setSubscriptions((data as unknown as Subscription[]) ?? []);
  }

  async function loadPersonalRates() {
    const { data } = await supabase
      .from("personal_lesson_rates")
      .select("id, student_id, price, teacher_amount, is_active");
    setPersonalRates(data ?? []);
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([loadStudents(), loadPlans(), loadSubscriptions(), loadPersonalRates()]).finally(() =>
      setLoading(false)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscriptionsByStudent = useMemo(() => {
    const map: Record<string, Subscription[]> = {};
    subscriptions.forEach((s) => {
      (map[s.student_id] ??= []).push(s);
    });
    return map;
  }, [subscriptions]);

  const personalRateByStudent = useMemo(() => {
    const map: Record<string, PersonalRate> = {};
    personalRates.forEach((r) => {
      map[r.student_id] = r;
    });
    return map;
  }, [personalRates]);

  function currentSubscription(studentId: string): Subscription | undefined {
    const subs = subscriptionsByStudent[studentId] ?? [];
    return subs.find(isSubscriptionActive) ?? subs[0];
  }

  const filteredStudents = students.filter((s) =>
    s.full_name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const detailStudent = students.find((s) => s.id === detailStudentId) ?? null;

  async function refreshAll() {
    await Promise.all([loadStudents(), loadSubscriptions(), loadPersonalRates()]);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Ученики и абонементы</h1>
        {tab === "students" && (
          <button
            onClick={() => setAddModalOpen(true)}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            + Добавить ученика
          </button>
        )}
      </div>

      {isStaff && (
        <div className="mb-4 flex gap-1 border-b border-slate-200">
          <button
            onClick={() => setTab("students")}
            className={`px-3 py-2 text-sm font-medium ${
              tab === "students"
                ? "border-b-2 border-slate-800 text-slate-800"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Ученики
          </button>
          <button
            onClick={() => setTab("plans")}
            className={`px-3 py-2 text-sm font-medium ${
              tab === "plans"
                ? "border-b-2 border-slate-800 text-slate-800"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Тарифы
          </button>
        </div>
      )}

      {tab === "students" ? (
        <>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени…"
            className="mb-4 w-full max-w-sm rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />

          {loading ? (
            <p className="text-sm text-slate-400">Загрузка…</p>
          ) : filteredStudents.length === 0 ? (
            <p className="text-sm text-slate-400">Ученики не найдены</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-white shadow-md">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                    <th className="px-4 py-2 font-medium">Имя</th>
                    <th className="px-4 py-2 font-medium">Телефон</th>
                    <th className="px-4 py-2 font-medium">Абонемент</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s) => {
                    const sub = currentSubscription(s.id);
                    const personalRate = personalRateByStudent[s.id];
                    return (
                      <tr
                        key={s.id}
                        className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                        onClick={() => setDetailStudentId(s.id)}
                      >
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <span className={s.is_active ? "text-slate-800" : "text-slate-400 line-through"}>
                            {s.full_name}
                          </span>
                          {!s.is_active && (
                            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
                              Архив
                            </span>
                          )}
                          {personalRate?.is_active && (
                            <span className="ml-2 rounded-full bg-pink-50 px-2 py-0.5 text-xs text-pink-600">
                              Персональные условия
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{s.phone ?? "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          {sub && isSubscriptionActive(sub) ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                              {sub.plan?.name ?? "Абонемент"}: {sub.lessons_remaining}/{sub.lessons_total} до{" "}
                              {formatDate(sub.expires_at)}
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                              Нет активного абонемента
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-slate-400">
                          Открыть →
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        isStaff && (
          <PlansTab plans={plans} readOnly={!isAdmin} supabase={supabase} onChanged={loadPlans} />
        )
      )}

      {detailStudent && (
        <StudentDetailModal
          student={detailStudent}
          isAdmin={isAdmin}
          subscriptions={subscriptionsByStudent[detailStudent.id] ?? []}
          personalRate={personalRateByStudent[detailStudent.id]}
          onClose={() => setDetailStudentId(null)}
          onChanged={refreshAll}
          onIssueSubscription={() => setIssueModalStudentId(detailStudent.id)}
          supabase={supabase}
        />
      )}

      {addModalOpen && (
        <AddStudentModal
          onClose={() => setAddModalOpen(false)}
          onCreated={async () => {
            setAddModalOpen(false);
            await loadStudents();
          }}
        />
      )}

      {issueModalStudentId && (
        <IssueSubscriptionModal
          studentId={issueModalStudentId}
          plans={plans.filter((p) => p.is_active)}
          locations={locations}
          currentUser={currentUser}
          supabase={supabase}
          onClose={() => setIssueModalStudentId(null)}
          onIssued={async () => {
            setIssueModalStudentId(null);
            await loadSubscriptions();
          }}
        />
      )}
    </div>
  );
}

// ---------- Карточка ученика ----------

function StudentDetailModal({
  student,
  isAdmin,
  subscriptions,
  personalRate,
  onClose,
  onChanged,
  onIssueSubscription,
  supabase,
}: {
  student: StudentProfile;
  isAdmin: boolean;
  subscriptions: Subscription[];
  personalRate: PersonalRate | undefined;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onIssueSubscription: () => void;
  supabase: SupabaseClient;
}) {
  const [form, setForm] = useState({
    full_name: student.full_name,
    phone: student.phone ?? "",
    contact_email: student.contact_email ?? "",
    guardian_full_name: student.guardian_full_name ?? "",
    guardian_phone: student.guardian_phone ?? "",
    birth_date: student.birth_date ?? "",
    notes: student.notes ?? "",
    vk_contact: student.vk_contact ?? "",
    telegram_contact: student.telegram_contact ?? "",
    max_contact: student.max_contact ?? "",
    preferred_contact_channel: student.preferred_contact_channel ?? "",
    preferred_contact_note: student.preferred_contact_note ?? "",
  });
  const [isActive, setIsActive] = useState(student.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rateForm, setRateForm] = useState(false);
  const [ratePrice, setRatePrice] = useState(personalRate?.price ?? 0);
  const [rateTeacherAmount, setRateTeacherAmount] = useState(personalRate?.teacher_amount ?? 0);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveProfile() {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name,
        phone: form.phone || null,
        contact_email: form.contact_email || null,
        guardian_full_name: form.guardian_full_name || null,
        guardian_phone: form.guardian_phone || null,
        birth_date: form.birth_date || null,
        notes: form.notes || null,
        vk_contact: form.vk_contact || null,
        telegram_contact: form.telegram_contact || null,
        max_contact: form.max_contact || null,
        preferred_contact_channel: form.preferred_contact_channel || null,
        preferred_contact_note: form.preferred_contact_note || null,
        is_active: isActive,
      })
      .eq("id", student.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await onChanged();
  }

  async function togglePersonalRate(active: boolean) {
    if (!personalRate) return;
    await supabase.from("personal_lesson_rates").update({ is_active: active }).eq("id", personalRate.id);
    await onChanged();
  }

  async function savePersonalRate() {
    if (personalRate) {
      await supabase
        .from("personal_lesson_rates")
        .update({ price: ratePrice, teacher_amount: rateTeacherAmount, is_active: true })
        .eq("id", personalRate.id);
    } else {
      await supabase.from("personal_lesson_rates").insert({
        student_id: student.id,
        price: ratePrice,
        teacher_amount: rateTeacherAmount,
        is_active: true,
      });
    }
    setRateForm(false);
    await onChanged();
  }

  const inputClass = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm";
  const labelClass = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Карточка ученика</h2>
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Телефон</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="Не указан"
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
                <label className={labelClass}>Email (необязательно, для уведомлений)</label>
                <input
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => update("contact_email", e.target.value)}
                  className={inputClass}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Активный ученик (снимите галочку, если ученик больше не занимается)
              </label>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">
              Представитель (родитель) — если ученик несовершеннолетний
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>ФИО представителя</label>
                <input
                  type="text"
                  value={form.guardian_full_name}
                  onChange={(e) => update("guardian_full_name", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Телефон представителя</label>
                <input
                  type="text"
                  value={form.guardian_phone}
                  onChange={(e) => update("guardian_phone", e.target.value)}
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
              <label className={labelClass}>
                Приоритетный способ связи — куда в первую очередь писать по важным вопросам
              </label>
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
                placeholder="Уточнение, например: писать маме, а не ученику"
                className={`${inputClass} mt-2`}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">Заметки (особенности, увлечения)</p>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="Например: стесняется на первых занятиях, любит поп-музыку, аллергия на цветы в кабинете…"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={saveProfile}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {saving ? "Сохраняем…" : "Сохранить изменения"}
          </button>
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Репертуар</p>
            <Link
              href={`/dashboard/repertoire?student=${student.id}`}
              className="text-xs font-medium text-slate-600 underline hover:text-slate-800"
            >
              Открыть репертуар →
            </Link>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Список произведений, готовность и заметки педагога — необязательно, заполняется постепенно
          </p>
        </div>

        {isAdmin && (
          <div className="mt-5 rounded-lg bg-slate-50 p-3">
            <p className="mb-2 text-xs font-medium text-slate-500">Персональные условия занятий</p>
            {personalRate?.is_active ? (
              <div className="text-sm text-slate-700">
                <p>
                  Стоимость занятия: <strong>{formatMoney(personalRate.price)}</strong>, преподавателю:{" "}
                  <strong>{formatMoney(personalRate.teacher_amount)}</strong>
                </p>
                <p className="mt-1 text-xs text-pink-600">
                  Пока эти условия активны, все занятия ученика автоматически ставятся как «Персональное»
                </p>
                <button
                  onClick={() => togglePersonalRate(false)}
                  className="mt-2 rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-white"
                >
                  Снять персональные условия
                </button>
              </div>
            ) : rateForm ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Цена занятия, ₽</label>
                    <input
                      type="number"
                      value={ratePrice}
                      onChange={(e) => setRatePrice(Number(e.target.value) || 0)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Доля преподавателя, ₽</label>
                    <input
                      type="number"
                      value={rateTeacherAmount}
                      onChange={(e) => setRateTeacherAmount(Number(e.target.value) || 0)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRateForm(false)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-white"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={savePersonalRate}
                    className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                  >
                    Назначить
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setRateForm(true)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-white"
              >
                {personalRate ? "Возобновить персональные условия" : "+ Назначить персональные условия"}
              </button>
            )}
          </div>
        )}

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">История абонементов</p>
            <button
              onClick={onIssueSubscription}
              className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
            >
              + Выдать абонемент
            </button>
          </div>
          {subscriptions.length === 0 ? (
            <p className="text-xs text-slate-400">Абонементов ещё не было</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {subscriptions.map((s) => (
                <li key={s.id} className="rounded-lg border border-slate-100 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">{s.plan?.name ?? "Абонемент"}</span>
                    <span className={isSubscriptionActive(s) ? "text-xs text-emerald-600" : "text-xs text-slate-400"}>
                      {isSubscriptionActive(s) ? "Активен" : "Завершён"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Осталось {s.lessons_remaining} из {s.lessons_total}, с {formatDate(s.starts_at)} до{" "}
                    {formatDate(s.expires_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Новый ученик ----------

function AddStudentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Укажите имя ученика");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim(), phone: phone.trim(), email: email.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Не удалось добавить ученика");
        setSubmitting(false);
        return;
      }
      await onCreated();
    } catch {
      setError("Не удалось связаться с сервером");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Новый ученик</h2>
        <p className="mb-3 text-xs text-slate-400">
          Здесь только самое необходимое для создания карточки. Телефон представителя, мессенджеры,
          день рождения и заметки можно будет добавить позже — откройте карточку ученика в списке.
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
              Email (необязательно — только если ученику нужен вход в личный кабинет)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
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

// ---------- Выдать абонемент ----------

function IssueSubscriptionModal({
  studentId,
  plans,
  locations,
  currentUser,
  supabase,
  onClose,
  onIssued,
}: {
  studentId: string;
  plans: SubscriptionPlan[];
  locations: Location[];
  currentUser: CurrentUser;
  supabase: SupabaseClient;
  onClose: () => void;
  onIssued: () => Promise<void>;
}) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = plans.find((p) => p.id === planId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!planId || !locationId || !plan) {
      setError("Выберите тариф и офис");
      return;
    }
    setSubmitting(true);
    setError(null);

    const starts = new Date(`${startsAt}T00:00:00`);
    const expires = new Date(starts);
    expires.setDate(expires.getDate() + plan.validity_days);

    const { error: insertError } = await supabase.from("subscriptions").insert({
      student_id: studentId,
      plan_id: planId,
      location_id: locationId,
      lessons_total: plan.lessons_count,
      lessons_used: 0,
      lessons_remaining: plan.lessons_count,
      status: "active",
      starts_at: starts.toISOString(),
      expires_at: expires.toISOString(),
      created_by: currentUser.id,
    });

    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    await onIssued();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Выдать абонемент</h2>
        {plans.length === 0 ? (
          <p className="text-sm text-slate-500">
            В справочнике нет действующих тарифов — сначала добавьте тариф на вкладке «Тарифы».
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Тариф</label>
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatMoney(p.price)}, {p.lessons_count} занятий на {p.validity_days} дн.
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Офис</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Дата начала</label>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            {plan && (
              <p className="text-xs text-slate-400">
                Абонемент будет действовать до{" "}
                {new Date(
                  new Date(`${startsAt}T00:00:00`).getTime() + plan.validity_days * 86400000
                ).toLocaleDateString("ru-RU")}
              </p>
            )}
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
                {submitting ? "Сохраняем…" : "Выдать"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------- Тарифы абонементов (вкладка, только для admin/manager; цену меняет только admin) ----------

function PlansTab({
  plans,
  readOnly,
  supabase,
  onChanged,
}: {
  plans: SubscriptionPlan[];
  readOnly: boolean;
  supabase: SupabaseClient;
  onChanged: () => Promise<void>;
}) {
  const [rows, setRows] = useState(plans);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => setRows(plans), [plans]);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newLessonsCount, setNewLessonsCount] = useState(8);
  const [newValidityDays, setNewValidityDays] = useState(30);
  const [newPrice, setNewPrice] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(id: string, patch: Partial<SubscriptionPlan>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveRow(row: SubscriptionPlan) {
    setSavingId(row.id);
    await supabase
      .from("subscription_plans")
      .update({
        name: row.name,
        description: row.description,
        lessons_count: row.lessons_count,
        validity_days: row.validity_days,
        price: row.price,
        is_active: row.is_active,
      })
      .eq("id", row.id);
    setSavingId(null);
    await onChanged();
  }

  async function createPlan() {
    if (!newName.trim()) {
      setError("Укажите название тарифа");
      return;
    }
    setCreating(true);
    setError(null);
    const { error: insertError } = await supabase.from("subscription_plans").insert({
      name: newName.trim(),
      description: newDescription.trim() || null,
      lessons_count: newLessonsCount,
      validity_days: newValidityDays,
      price: newPrice,
      is_active: true,
    });
    setCreating(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setNewName("");
    setNewDescription("");
    setNewLessonsCount(8);
    setNewValidityDays(30);
    setNewPrice(0);
    await onChanged();
  }

  return (
    <div>
      {readOnly && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Изменение тарифов и цен доступно только владельцу студии — здесь можно только посмотреть.
        </p>
      )}
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <input
                value={row.name}
                onChange={(e) => updateRow(row.id, { name: e.target.value })}
                disabled={readOnly}
                className="col-span-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 sm:col-span-1"
                placeholder="Название"
              />
              <input
                type="number"
                value={row.lessons_count}
                onChange={(e) => updateRow(row.id, { lessons_count: Number(e.target.value) || 0 })}
                disabled={readOnly}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                placeholder="Занятий"
              />
              <input
                type="number"
                value={row.validity_days}
                onChange={(e) => updateRow(row.id, { validity_days: Number(e.target.value) || 0 })}
                disabled={readOnly}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                placeholder="Дней"
              />
              <input
                type="number"
                value={row.price}
                onChange={(e) => updateRow(row.id, { price: Number(e.target.value) || 0 })}
                disabled={readOnly}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                placeholder="Цена"
              />
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={row.is_active}
                  onChange={(e) => updateRow(row.id, { is_active: e.target.checked })}
                  disabled={readOnly}
                />
                Активен
              </label>
            </div>
            <input
              value={row.description ?? ""}
              onChange={(e) => updateRow(row.id, { description: e.target.value })}
              disabled={readOnly}
              className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
              placeholder="Описание (необязательно)"
            />
            {!readOnly && (
              <button
                onClick={() => saveRow(row)}
                disabled={savingId === row.id}
                className="mt-2 rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                {savingId === row.id ? "Сохраняем…" : "Сохранить"}
              </button>
            )}
          </div>
        ))}
      </div>

      {!readOnly && (
        <div className="mt-5 rounded-lg bg-slate-50 p-3">
          <p className="mb-2 text-xs font-medium text-slate-500">+ Новый тариф</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="col-span-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm sm:col-span-1"
              placeholder="Название"
            />
            <input
              type="number"
              value={newLessonsCount}
              onChange={(e) => setNewLessonsCount(Number(e.target.value) || 0)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Занятий"
            />
            <input
              type="number"
              value={newValidityDays}
              onChange={(e) => setNewValidityDays(Number(e.target.value) || 0)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Дней"
            />
            <input
              type="number"
              value={newPrice}
              onChange={(e) => setNewPrice(Number(e.target.value) || 0)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Цена"
            />
          </div>
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="Описание (необязательно)"
          />
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <button
            onClick={createPlan}
            disabled={creating}
            className="mt-2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {creating ? "Добавляем…" : "Добавить тариф"}
          </button>
        </div>
      )}
    </div>
  );
}
