"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ---------- Типы ----------

type Role = "admin" | "manager" | "teacher" | "student";

type CurrentUser = {
  id: string;
  fullName: string;
  role: Role;
};

type Location = { id: string; name: string };

type StudentProfile = {
  id: string;
  full_name: string;
  phone: string | null;
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

  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [personalRates, setPersonalRates] = useState<PersonalRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [plansModalOpen, setPlansModalOpen] = useState(false);
  const [issueModalStudentId, setIssueModalStudentId] = useState<string | null>(null);

  async function loadStudents() {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, phone, is_active")
      .eq("role", "student")
      .order("full_name");
    setStudents(data ?? []);
  }

  async function loadPlans() {
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
        <div className="flex gap-2">
          {isAdmin && (
            <button
              onClick={() => setPlansModalOpen(true)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              Тарифы абонементов
            </button>
          )}
          <button
            onClick={() => setAddModalOpen(true)}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            + Добавить ученика
          </button>
        </div>
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

      {plansModalOpen && isAdmin && (
        <PlansModal
          plans={plans}
          supabase={supabase}
          onClose={() => setPlansModalOpen(false)}
          onChanged={loadPlans}
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
  const [fullName, setFullName] = useState(student.full_name);
  const [phone, setPhone] = useState(student.phone ?? "");
  const [isActive, setIsActive] = useState(student.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rateForm, setRateForm] = useState(false);
  const [ratePrice, setRatePrice] = useState(personalRate?.price ?? 0);
  const [rateTeacherAmount, setRateTeacherAmount] = useState(personalRate?.teacher_amount ?? 0);

  async function saveContact() {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone: phone || null, is_active: isActive })
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Карточка ученика</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">ФИО</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Телефон</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Не указан"
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Активный ученик (снимите галочку, если ученик больше не занимается)
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={saveContact}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {saving ? "Сохраняем…" : "Сохранить изменения"}
          </button>
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
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Доля преподавателя, ₽</label>
                    <input
                      type="number"
                      value={rateTeacherAmount}
                      onChange={(e) => setRateTeacherAmount(Number(e.target.value) || 0)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
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
            В справочнике нет действующих тарифов — сначала добавьте тариф через «Тарифы абонементов».
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

// ---------- Тарифы абонементов (только владелец) ----------

function PlansModal({
  plans,
  supabase,
  onClose,
  onChanged,
}: {
  plans: SubscriptionPlan[];
  supabase: SupabaseClient;
  onClose: () => void;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Тарифы абонементов</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-lg border border-slate-200 p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <input
                  value={row.name}
                  onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  className="col-span-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm sm:col-span-1"
                  placeholder="Название"
                />
                <input
                  type="number"
                  value={row.lessons_count}
                  onChange={(e) => updateRow(row.id, { lessons_count: Number(e.target.value) || 0 })}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="Занятий"
                />
                <input
                  type="number"
                  value={row.validity_days}
                  onChange={(e) => updateRow(row.id, { validity_days: Number(e.target.value) || 0 })}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="Дней"
                />
                <input
                  type="number"
                  value={row.price}
                  onChange={(e) => updateRow(row.id, { price: Number(e.target.value) || 0 })}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="Цена"
                />
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={row.is_active}
                    onChange={(e) => updateRow(row.id, { is_active: e.target.checked })}
                  />
                  Активен
                </label>
              </div>
              <input
                value={row.description ?? ""}
                onChange={(e) => updateRow(row.id, { description: e.target.value })}
                className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Описание (необязательно)"
              />
              <button
                onClick={() => saveRow(row)}
                disabled={savingId === row.id}
                className="mt-2 rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                {savingId === row.id ? "Сохраняем…" : "Сохранить"}
              </button>
            </div>
          ))}
        </div>

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
      </div>
    </div>
  );
}
