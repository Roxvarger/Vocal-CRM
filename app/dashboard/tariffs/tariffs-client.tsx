"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ---------- Типы ----------

type SubscriptionPlan = {
  id: string;
  name: string;
  description: string | null;
  lessons_count: number;
  validity_days: number;
  price: number;
  is_active: boolean;
};

type StudentOption = { id: string; full_name: string };

type PersonalRate = {
  id: string;
  student_id: string;
  price: number;
  teacher_amount: number;
  is_active: boolean;
};

type SupabaseClient = ReturnType<typeof createClient>;

// ---------- Вспомогательные функции ----------

function formatMoney(n: number): string {
  return `${n.toLocaleString("ru-RU")} ₽`;
}

// ---------- Основной компонент ----------

export default function TariffsClient({
  isAdmin,
  plans: initialPlans,
  students,
  initialPersonalRates,
  initialStudentId,
}: {
  isAdmin: boolean;
  plans: SubscriptionPlan[];
  students: StudentOption[];
  initialPersonalRates: PersonalRate[];
  initialStudentId: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  if (!isAdmin) {
    return <GeneralPriceListReadOnly plans={initialPlans} />;
  }

  return (
    <AdminTariffs
      supabase={supabase}
      initialPlans={initialPlans}
      students={students}
      initialPersonalRates={initialPersonalRates}
      initialStudentId={initialStudentId}
    />
  );
}

// ---------- Только просмотр (менеджер, преподаватель) ----------

function GeneralPriceListReadOnly({ plans }: { plans: SubscriptionPlan[] }) {
  const activePlans = plans.filter((p) => p.is_active);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Тарифы</h1>
      <p className="mb-4 text-sm text-slate-500">
        Общий прайс абонементов и занятий. Персональные условия учеников видит и назначает только
        главный администратор.
      </p>

      {activePlans.length === 0 ? (
        <p className="text-sm text-slate-400">Тарифы пока не добавлены</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {activePlans.map((p) => (
            <div key={p.id} className="rounded-2xl bg-white p-4 shadow-md">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">{p.name}</h3>
                <span className="text-base font-semibold text-slate-800">{formatMoney(p.price)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {p.lessons_count} занятий · действует {p.validity_days} дн.
              </p>
              {p.description && <p className="mt-2 text-sm text-slate-500">{p.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Полный доступ (главный администратор) ----------

function AdminTariffs({
  supabase,
  initialPlans,
  students,
  initialPersonalRates,
  initialStudentId,
}: {
  supabase: SupabaseClient;
  initialPlans: SubscriptionPlan[];
  students: StudentOption[];
  initialPersonalRates: PersonalRate[];
  initialStudentId: string | null;
}) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>(initialPlans);
  const [personalRates, setPersonalRates] = useState<PersonalRate[]>(initialPersonalRates);
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState<string | null>(initialStudentId);
  const [addFormOpen, setAddFormOpen] = useState(false);

  async function reloadPlans() {
    const { data } = await supabase
      .from("subscription_plans")
      .select("id, name, description, lessons_count, validity_days, price, is_active")
      .order("price");
    setPlans(data ?? []);
  }

  async function reloadPersonalRates() {
    const { data } = await supabase
      .from("personal_lesson_rates")
      .select("id, student_id, price, teacher_amount, is_active");
    setPersonalRates(data ?? []);
  }

  const personalRateByStudent = useMemo(() => {
    const map: Record<string, PersonalRate> = {};
    personalRates.forEach((r) => {
      map[r.student_id] = r;
    });
    return map;
  }, [personalRates]);

  const filteredStudents = students.filter((s) =>
    s.full_name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const student = students.find((s) => s.id === studentId) ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-1 text-xl font-semibold text-slate-800">Тарифы</h1>
        <p className="mb-4 text-sm text-slate-500">
          Общий прайс абонементов и занятий. Здесь может редактировать только главный
          администратор — менеджер и преподаватель видят этот раздел без персональных условий.
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Общие тарифы</h2>
          <button
            onClick={() => setAddFormOpen((v) => !v)}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            {addFormOpen ? "Отмена" : "+ Добавить тариф"}
          </button>
        </div>

        {addFormOpen && (
          <AddPlanForm
            supabase={supabase}
            onAdded={async () => {
              setAddFormOpen(false);
              await reloadPlans();
            }}
          />
        )}

        {plans.length === 0 ? (
          <p className="text-sm text-slate-400">Тарифы пока не добавлены</p>
        ) : (
          <div className="space-y-2">
            {plans.map((p) => (
              <PlanRow key={p.id} plan={p} supabase={supabase} onChanged={reloadPlans} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-800">
          Персональные условия учеников
        </h2>
        <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
          <div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск ученика…"
              className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <div className="max-h-[60vh] overflow-y-auto rounded-2xl bg-white shadow-md">
              {filteredStudents.length === 0 ? (
                <p className="p-3 text-xs text-slate-400">Ученики не найдены</p>
              ) : (
                filteredStudents.map((s) => {
                  const rate = personalRateByStudent[s.id];
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStudentId(s.id)}
                      className={`flex w-full items-center justify-between border-b border-slate-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50 ${
                        s.id === studentId ? "bg-slate-100 font-medium text-slate-800" : "text-slate-600"
                      }`}
                    >
                      <span>{s.full_name}</span>
                      {rate?.is_active && <span className="h-2 w-2 rounded-full bg-pink-400" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div>
            {!student ? (
              <p className="text-sm text-slate-400">
                Выберите ученика слева, чтобы назначить или изменить его персональные условия
              </p>
            ) : (
              <PersonalRateEditor
                key={student.id}
                student={student}
                rate={personalRateByStudent[student.id]}
                supabase={supabase}
                onChanged={reloadPersonalRates}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------- Строка тарифа с редактированием ----------

function PlanRow({
  plan,
  supabase,
  onChanged,
}: {
  plan: SubscriptionPlan;
  supabase: SupabaseClient;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: plan.name,
    description: plan.description ?? "",
    lessons_count: String(plan.lessons_count),
    validity_days: String(plan.validity_days),
    price: String(plan.price),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("subscription_plans")
      .update({
        name: form.name,
        description: form.description || null,
        lessons_count: Number(form.lessons_count) || 0,
        validity_days: Number(form.validity_days) || 0,
        price: Number(form.price) || 0,
      })
      .eq("id", plan.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEditing(false);
    await onChanged();
  }

  async function toggleActive() {
    await supabase.from("subscription_plans").update({ is_active: !plan.is_active }).eq("id", plan.id);
    await onChanged();
  }

  const inputClass = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm";

  if (!editing) {
    return (
      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-md">
        <div>
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold ${plan.is_active ? "text-slate-800" : "text-slate-400 line-through"}`}>
              {plan.name}
            </h3>
            {!plan.is_active && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">Скрыт</span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {plan.lessons_count} занятий · {plan.validity_days} дн. · {formatMoney(plan.price)}
          </p>
          {plan.description && <p className="mt-1 text-xs text-slate-400">{plan.description}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleActive}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            {plan.is_active ? "Скрыть" : "Показать"}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Изменить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-md">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Название</label>
          <input value={form.name} onChange={(e) => update("name", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Цена, ₽</label>
          <input
            type="number"
            value={form.price}
            onChange={(e) => update("price", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Занятий в абонементе</label>
          <input
            type="number"
            value={form.lessons_count}
            onChange={(e) => update("lessons_count", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Срок действия, дней</label>
          <input
            type="number"
            value={form.validity_days}
            onChange={(e) => update("validity_days", e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div className="mt-2">
        <label className="mb-1 block text-xs font-medium text-slate-600">Описание (необязательно)</label>
        <textarea
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          rows={2}
          className={inputClass}
        />
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setEditing(false)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          Отмена
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

// ---------- Добавить тариф ----------

function AddPlanForm({
  supabase,
  onAdded,
}: {
  supabase: SupabaseClient;
  onAdded: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lessonsCount, setLessonsCount] = useState("4");
  const [validityDays, setValidityDays] = useState("30");
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !price) {
      setError("Укажите название и цену");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: insertError } = await supabase.from("subscription_plans").insert({
      name: name.trim(),
      description: description.trim() || null,
      lessons_count: Number(lessonsCount) || 0,
      validity_days: Number(validityDays) || 0,
      price: Number(price) || 0,
      is_active: true,
    });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setName("");
    setDescription("");
    setLessonsCount("4");
    setValidityDays("30");
    setPrice("");
    await onAdded();
  }

  const inputClass = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm";

  return (
    <form onSubmit={handleSubmit} className="mb-3 space-y-2 rounded-2xl bg-slate-50 p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Название</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Цена, ₽</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Занятий в абонементе</label>
          <input
            type="number"
            value={lessonsCount}
            onChange={(e) => setLessonsCount(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Срок действия, дней</label>
          <input
            type="number"
            value={validityDays}
            onChange={(e) => setValidityDays(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Описание (необязательно)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={inputClass}
        />
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
      >
        {submitting ? "Добавляем…" : "Добавить тариф"}
      </button>
    </form>
  );
}

// ---------- Персональные условия ученика ----------

function PersonalRateEditor({
  student,
  rate,
  supabase,
  onChanged,
}: {
  student: StudentOption;
  rate: PersonalRate | undefined;
  supabase: SupabaseClient;
  onChanged: () => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(rate?.is_active ?? false);
  const [price, setPrice] = useState(rate ? String(rate.price) : "");
  const [teacherAmount, setTeacherAmount] = useState(rate ? String(rate.teacher_amount) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);

    if (rate) {
      const { error: updateError } = await supabase
        .from("personal_lesson_rates")
        .update({
          price: Number(price) || 0,
          teacher_amount: Number(teacherAmount) || 0,
          is_active: enabled,
        })
        .eq("id", rate.id);
      setSaving(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("personal_lesson_rates").insert({
        student_id: student.id,
        price: Number(price) || 0,
        teacher_amount: Number(teacherAmount) || 0,
        is_active: enabled,
      });
      setSaving(false);
      if (insertError) {
        setError(insertError.message);
        return;
      }
    }
    await onChanged();
  }

  const inputClass = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm";

  return (
    <div className="rounded-2xl bg-white p-4 shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">{student.full_name}</h3>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Персональные условия активны
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Цена занятия для ученика, ₽</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Выплата преподавателю, ₽</label>
          <input
            type="number"
            value={teacherAmount}
            onChange={(e) => setTeacherAmount(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="mt-3 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
      >
        {saving ? "Сохраняем…" : "Сохранить"}
      </button>
    </div>
  );
}
