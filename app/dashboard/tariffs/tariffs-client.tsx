"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ---------- Типы ----------

type Duration = 30 | 50;
type PlanKind = "trial" | "single" | "subscription" | "rental";

type SubscriptionPlan = {
  id: string;
  name: string;
  description: string | null;
  lessons_count: number;
  validity_days: number;
  price: number;
  is_active: boolean;
  duration_minutes: Duration;
  kind: PlanKind;
  subject_id: string | null;
  subject: { name: string } | null;
};

type LessonSubject = { id: string; name: string; is_active: boolean };

type StudentOption = { id: string; full_name: string };

// Три варианта персональных условий. Ставка самого преподавателя сюда не входит —
// она задаётся один раз в разделе «Преподаватели» и подставляется по факту занятия
// (в зависимости от того, кто именно ведёт), поэтому здесь её не вводят и не хранят:
// - rate_only: ученик платит ровно ставку преподавателя, студия ничего не добавляет
// - fixed: просто фиксированная цена занятия для этого ученика, без привязки к ставке
// - rate_plus_markup: ставка преподавателя (по факту занятия) + фиксированная надбавка студии
type PersonalRateMode = "fixed" | "rate_only" | "rate_plus_markup";

type PersonalRate = {
  id: string;
  student_id: string;
  price: number | null;
  markup_amount: number | null;
  is_active: boolean;
  mode: PersonalRateMode;
};

type SupabaseClient = ReturnType<typeof createClient>;

const KIND_LABELS: Record<PlanKind, string> = {
  trial: "Пробное занятие",
  single: "Разовое занятие",
  subscription: "Абонемент",
  rental: "Аренда",
};

const DURATION_LABELS: Record<Duration, string> = {
  30: "Для самых маленьких (30 мин)",
  50: "Полноценное занятие (50 мин)",
};

// ---------- Вспомогательные функции ----------

function formatMoney(n: number): string {
  return `${n.toLocaleString("ru-RU")} ₽`;
}

function describeRate(rate: PersonalRate): string {
  if (rate.mode === "rate_only") {
    return "Только ставка преподавателя (по факту занятия)";
  }
  if (rate.mode === "rate_plus_markup") {
    return `Ставка преподавателя + надбавка ${formatMoney(rate.markup_amount ?? 0)}`;
  }
  return `Фиксированная цена — ${formatMoney(rate.price ?? 0)}`;
}

// ---------- Модальное окно ----------

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8"
      onClick={onClose}
    >
      <div
        className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl bg-white p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- Основной компонент ----------

export default function TariffsClient({
  isAdmin,
  plans: initialPlans,
  students,
  initialPersonalRates,
  initialStudentId,
  initialSubjects,
}: {
  isAdmin: boolean;
  plans: SubscriptionPlan[];
  students: StudentOption[];
  initialPersonalRates: PersonalRate[];
  initialStudentId: string | null;
  initialSubjects: LessonSubject[];
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
      initialSubjects={initialSubjects}
    />
  );
}

// ---------- Только просмотр (менеджер, преподаватель) ----------

function GeneralPriceListReadOnly({ plans }: { plans: SubscriptionPlan[] }) {
  const activePlans = plans.filter((p) => p.is_active);
  const lessonPlans = activePlans.filter((p) => p.kind !== "rental");
  const rentalPlans = activePlans.filter((p) => p.kind === "rental");

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Тарифы</h1>
      <p className="mb-4 text-sm text-slate-500">
        Общий прайс абонементов и занятий. Персональные условия учеников видит и назначает только
        главный администратор.
      </p>

      {lessonPlans.length === 0 ? (
        <p className="text-sm text-slate-400">Тарифы пока не добавлены</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {([30, 50] as Duration[]).map((d) => (
            <div key={d}>
              <h2 className="mb-2 text-sm font-semibold text-slate-600">{DURATION_LABELS[d]}</h2>
              <div className="space-y-2">
                {lessonPlans
                  .filter((p) => p.duration_minutes === d)
                  .map((p) => (
                    <PlanCardReadOnly key={p.id} plan={p} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {rentalPlans.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-base font-semibold text-slate-800">Аренда</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {([30, 50] as Duration[]).map((d) => (
              <div key={d}>
                <h3 className="mb-2 text-sm font-semibold text-slate-600">{d} мин</h3>
                <div className="space-y-2">
                  {rentalPlans
                    .filter((p) => p.duration_minutes === d)
                    .map((p) => (
                      <PlanCardReadOnly key={p.id} plan={p} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanCardReadOnly({ plan }: { plan: SubscriptionPlan }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-md">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">{plan.name}</h3>
        <span className="text-base font-semibold text-slate-800">{formatMoney(plan.price)}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {plan.kind === "subscription"
          ? `${plan.lessons_count} занятий · действует ${plan.validity_days} дн.`
          : KIND_LABELS[plan.kind]}
        {plan.subject?.name ? ` · ${plan.subject.name}` : ""}
      </p>
      {plan.description && <p className="mt-2 text-sm text-slate-500">{plan.description}</p>}
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
  initialSubjects,
}: {
  supabase: SupabaseClient;
  initialPlans: SubscriptionPlan[];
  students: StudentOption[];
  initialPersonalRates: PersonalRate[];
  initialStudentId: string | null;
  initialSubjects: LessonSubject[];
}) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>(initialPlans);
  const [personalRates, setPersonalRates] = useState<PersonalRate[]>(initialPersonalRates);
  const [subjects, setSubjects] = useState<LessonSubject[]>(initialSubjects);
  const [hideHiddenPlans, setHideHiddenPlans] = useState(true);
  const [subjectsModalOpen, setSubjectsModalOpen] = useState(false);
  const [personalModalOpen, setPersonalModalOpen] = useState(Boolean(initialStudentId));

  async function reloadPlans() {
    const { data } = await supabase
      .from("subscription_plans")
      .select(
        "id, name, description, lessons_count, validity_days, price, is_active, duration_minutes, kind, subject_id, subject:subject_id(name)"
      )
      .order("price");
    setPlans((data as unknown as SubscriptionPlan[]) ?? []);
  }

  async function reloadSubjects() {
    const { data } = await supabase
      .from("lesson_subjects")
      .select("id, name, is_active")
      .order("name");
    setSubjects(data ?? []);
  }

  async function reloadPersonalRates() {
    const { data } = await supabase
      .from("personal_lesson_rates")
      .select("id, student_id, price, markup_amount, is_active, mode");
    setPersonalRates(data ?? []);
  }

  const visiblePlans = hideHiddenPlans ? plans.filter((p) => p.is_active) : plans;
  const lessonPlans = visiblePlans.filter((p) => p.kind !== "rental");
  const rentalPlans = visiblePlans.filter((p) => p.kind === "rental");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-1 text-xl font-semibold text-slate-800">Тарифы</h1>
        <p className="mb-4 text-sm text-slate-500">
          Общий прайс абонементов и занятий. Здесь может редактировать только главный
          администратор — менеджер и преподаватель видят этот раздел без персональных условий.
        </p>
      </div>

      <label className="flex w-fit items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={hideHiddenPlans}
          onChange={(e) => setHideHiddenPlans(e.target.checked)}
        />
        Не показывать скрытые тарифы
      </label>

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-800">Общие тарифы</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {([30, 50] as Duration[]).map((d) => (
            <TariffColumn
              key={d}
              title={DURATION_LABELS[d]}
              duration={d}
              allowKindChoice
              plans={lessonPlans.filter((p) => p.duration_minutes === d)}
              subjects={subjects}
              supabase={supabase}
              onChanged={reloadPlans}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-800">Аренда</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {([30, 50] as Duration[]).map((d) => (
            <TariffColumn
              key={d}
              title={`${d} мин`}
              duration={d}
              fixedKind="rental"
              plans={rentalPlans.filter((p) => p.duration_minutes === d)}
              subjects={subjects}
              supabase={supabase}
              onChanged={reloadPlans}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        <button
          onClick={() => setSubjectsModalOpen(true)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Направления занятий →
        </button>
        <button
          onClick={() => setPersonalModalOpen(true)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Персональные условия учеников →
        </button>
      </section>

      {subjectsModalOpen && (
        <Modal title="Направления занятий" onClose={() => setSubjectsModalOpen(false)}>
          <SubjectsManager supabase={supabase} subjects={subjects} onChanged={reloadSubjects} />
        </Modal>
      )}

      {personalModalOpen && (
        <Modal title="Персональные условия учеников" onClose={() => setPersonalModalOpen(false)} wide>
          <PersonalConditionsPanel
            supabase={supabase}
            students={students}
            personalRates={personalRates}
            initialStudentId={initialStudentId}
            onChanged={reloadPersonalRates}
          />
        </Modal>
      )}
    </div>
  );
}

// ---------- Колонка тарифов (одна длительность) ----------

function TariffColumn({
  title,
  duration,
  plans,
  subjects,
  supabase,
  onChanged,
  fixedKind,
  allowKindChoice,
}: {
  title: string;
  duration: Duration;
  plans: SubscriptionPlan[];
  subjects: LessonSubject[];
  supabase: SupabaseClient;
  onChanged: () => Promise<void>;
  fixedKind?: PlanKind;
  allowKindChoice?: boolean;
}) {
  const [addFormOpen, setAddFormOpen] = useState(false);

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <button
          onClick={() => setAddFormOpen((v) => !v)}
          className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700"
        >
          {addFormOpen ? "Отмена" : "+ Добавить"}
        </button>
      </div>

      {addFormOpen && (
        <AddPlanForm
          supabase={supabase}
          duration={duration}
          fixedKind={fixedKind}
          allowKindChoice={allowKindChoice}
          subjects={subjects}
          onAdded={async () => {
            setAddFormOpen(false);
            await onChanged();
          }}
        />
      )}

      {plans.length === 0 ? (
        <p className="text-xs text-slate-400">Тарифы пока не добавлены</p>
      ) : (
        <div className="space-y-2">
          {plans.map((p) => (
            <PlanRow key={p.id} plan={p} subjects={subjects} supabase={supabase} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Строка тарифа с редактированием ----------

function PlanRow({
  plan,
  subjects,
  supabase,
  onChanged,
}: {
  plan: SubscriptionPlan;
  subjects: LessonSubject[];
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
    subject_id: plan.subject_id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSubscriptionKind = plan.kind === "subscription";
  const showSubjectField = plan.kind !== "rental";

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
        lessons_count: isSubscriptionKind ? Number(form.lessons_count) || 0 : 1,
        validity_days: isSubscriptionKind ? Number(form.validity_days) || 0 : 0,
        price: Number(form.price) || 0,
        subject_id: showSubjectField ? form.subject_id || null : null,
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
      <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-md">
        <div>
          <div className="flex items-center gap-2">
            <h4 className={`text-sm font-semibold ${plan.is_active ? "text-slate-800" : "text-slate-400 line-through"}`}>
              {plan.name}
            </h4>
            {!plan.is_active && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">Скрыт</span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {plan.kind !== "subscription"
              ? `${KIND_LABELS[plan.kind]} · ${formatMoney(plan.price)}`
              : `${plan.lessons_count} занятий · ${plan.validity_days} дн. · ${formatMoney(plan.price)}`}
            {plan.subject?.name ? ` · ${plan.subject.name}` : ""}
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
    <div className="rounded-2xl bg-white p-3 shadow-md">
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
        {isSubscriptionKind && (
          <>
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
          </>
        )}
        {showSubjectField && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Направление</label>
            <select
              value={form.subject_id}
              onChange={(e) => update("subject_id", e.target.value)}
              className={inputClass}
            >
              <option value="">Все направления</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
  duration,
  fixedKind,
  allowKindChoice,
  subjects,
  onAdded,
}: {
  supabase: SupabaseClient;
  duration: Duration;
  fixedKind?: PlanKind;
  allowKindChoice?: boolean;
  subjects: LessonSubject[];
  onAdded: () => Promise<void>;
}) {
  const [kind, setKind] = useState<PlanKind>(fixedKind ?? "subscription");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lessonsCount, setLessonsCount] = useState("4");
  const [validityDays, setValidityDays] = useState("30");
  const [price, setPrice] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSubscriptionKind = kind === "subscription";
  const showSubjectField = kind !== "rental";
  // Для абонемента нужно собственное название (например, "8 занятий за 2 месяца"),
  // а для пробного/разового/аренды название не нужно — оно и так одно на всю
  // колонку, поэтому подставляем его автоматически по типу тарифа.
  const effectiveName = isSubscriptionKind ? name.trim() : KIND_LABELS[kind];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveName || !price) {
      setError(isSubscriptionKind ? "Укажите название и цену" : "Укажите цену");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: insertError } = await supabase.from("subscription_plans").insert({
      name: effectiveName,
      description: description.trim() || null,
      lessons_count: isSubscriptionKind ? Number(lessonsCount) || 0 : 1,
      validity_days: isSubscriptionKind ? Number(validityDays) || 0 : 0,
      price: Number(price) || 0,
      is_active: true,
      duration_minutes: duration,
      kind,
      subject_id: showSubjectField ? subjectId || null : null,
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
    setSubjectId("");
    await onAdded();
  }

  const inputClass = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm";

  return (
    <form onSubmit={handleSubmit} className="mb-3 space-y-2 rounded-2xl bg-white p-3 shadow-inner">
      {allowKindChoice && !fixedKind && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Тип тарифа</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PlanKind)}
            className={inputClass}
          >
            <option value="trial">Пробное занятие</option>
            <option value="single">Разовое занятие</option>
            <option value="subscription">Абонемент</option>
          </select>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {isSubscriptionKind && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Название</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
          </div>
        )}
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
        {isSubscriptionKind && (
          <>
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
          </>
        )}
        {showSubjectField && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Направление</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className={inputClass}
            >
              <option value="">Все направления</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
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

// ---------- Направления занятий (справочник) ----------

function SubjectsManager({
  supabase,
  subjects,
  onChanged,
}: {
  supabase: SupabaseClient;
  subjects: LessonSubject[];
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [hideHidden, setHideHidden] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleSubjects = hideHidden ? subjects.filter((s) => s.is_active) : subjects;

  async function addSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    const { error: insertError } = await supabase
      .from("lesson_subjects")
      .insert({ name: name.trim(), is_active: true });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setName("");
    await onChanged();
  }

  async function toggleActive(subject: LessonSubject) {
    await supabase
      .from("lesson_subjects")
      .update({ is_active: !subject.is_active })
      .eq("id", subject.id);
    await onChanged();
  }

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500">
        Список направлений занятий (вокал, фортепиано и т.д.) — используется при записи в
        расписание и для тарифов с ценой по направлению.
      </p>

      <label className="mb-3 flex w-fit items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={hideHidden} onChange={(e) => setHideHidden(e.target.checked)} />
        Не показывать скрытые
      </label>

      {visibleSubjects.length === 0 ? (
        <p className="mb-3 text-xs text-slate-400">Направления не найдены</p>
      ) : (
        <div className="mb-3 space-y-1.5">
          {visibleSubjects.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5">
              <span className={`text-sm ${s.is_active ? "text-slate-800" : "text-slate-400 line-through"}`}>
                {s.name}
              </span>
              <button
                onClick={() => toggleActive(s)}
                className="rounded-lg border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-white"
              >
                {s.is_active ? "Скрыть" : "Показать"}
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={addSubject} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Новое направление…"
          className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {submitting ? "…" : "Добавить"}
        </button>
      </form>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ---------- Персональные условия: список + добавление ----------

function PersonalConditionsPanel({
  supabase,
  students,
  personalRates,
  initialStudentId,
  onChanged,
}: {
  supabase: SupabaseClient;
  students: StudentOption[];
  personalRates: PersonalRate[];
  initialStudentId: string | null;
  onChanged: () => Promise<void>;
}) {
  const [view, setView] = useState<"list" | "search" | "edit">(initialStudentId ? "edit" : "list");
  const [search, setSearch] = useState("");
  const [editingStudentId, setEditingStudentId] = useState<string | null>(initialStudentId);

  const activeRates = personalRates.filter((r) => r.is_active);
  const studentById = useMemo(() => {
    const map: Record<string, StudentOption> = {};
    students.forEach((s) => (map[s.id] = s));
    return map;
  }, [students]);

  const filteredStudents = students.filter((s) =>
    s.full_name.toLowerCase().includes(search.trim().toLowerCase())
  );

  async function cancelRate(rate: PersonalRate) {
    if (!confirm(`Отменить персональные условия для ${studentById[rate.student_id]?.full_name ?? "ученика"}?`)) {
      return;
    }
    await supabase.from("personal_lesson_rates").update({ is_active: false }).eq("id", rate.id);
    await onChanged();
  }

  if (view === "edit" && editingStudentId) {
    const student = studentById[editingStudentId];
    const rate = personalRates.find((r) => r.student_id === editingStudentId);
    return (
      <div>
        <button
          onClick={() => {
            setView("list");
            setEditingStudentId(null);
          }}
          className="mb-3 text-sm text-slate-500 hover:text-slate-700"
        >
          ← К списку
        </button>
        {student ? (
          <PersonalRateEditor
            key={student.id}
            student={student}
            rate={rate}
            supabase={supabase}
            onChanged={async () => {
              await onChanged();
              setView("list");
              setEditingStudentId(null);
            }}
          />
        ) : (
          <p className="text-sm text-slate-400">Ученик не найден</p>
        )}
      </div>
    );
  }

  if (view === "search") {
    return (
      <div>
        <button onClick={() => setView("list")} className="mb-3 text-sm text-slate-500 hover:text-slate-700">
          ← К списку
        </button>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск ученика…"
          className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <div className="max-h-[50vh] overflow-y-auto rounded-2xl bg-slate-50">
          {filteredStudents.length === 0 ? (
            <p className="p-3 text-xs text-slate-400">Ученики не найдены</p>
          ) : (
            filteredStudents.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setEditingStudentId(s.id);
                  setView("edit");
                }}
                className="flex w-full items-center justify-between border-b border-white px-3 py-2 text-left text-sm last:border-0 hover:bg-white"
              >
                <span className="text-slate-700">{s.full_name}</span>
                {personalRates.find((r) => r.student_id === s.id && r.is_active) && (
                  <span className="h-2 w-2 rounded-full bg-pink-400" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {activeRates.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400">Персональные условия пока никому не назначены</p>
      ) : (
        <div className="mb-4 space-y-2">
          {activeRates.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 p-3"
            >
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {studentById[r.student_id]?.full_name ?? "Ученик"}
                </p>
                <p className="text-xs text-slate-500">{describeRate(r)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingStudentId(r.student_id);
                    setView("edit");
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                >
                  Изменить
                </button>
                <button
                  onClick={() => cancelRate(r)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  Отменить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setView("search")}
        className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
      >
        + Добавить
      </button>
    </div>
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
  const [enabled, setEnabled] = useState(rate?.is_active ?? true);
  const [mode, setMode] = useState<PersonalRateMode>(rate?.mode ?? "fixed");
  const [price, setPrice] = useState(rate && rate.mode === "fixed" ? String(rate.price ?? "") : "");
  const [markup, setMarkup] = useState(
    rate && rate.mode === "rate_plus_markup" ? String(rate.markup_amount ?? "") : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);

    // Ставка самого преподавателя сюда не входит — она задаётся в разделе
    // «Преподаватели» и подставляется по факту занятия, в зависимости от того,
    // кто именно ведёт. Здесь фиксируем только то, что относится к ученику.
    const payload: {
      price: number | null;
      markup_amount: number | null;
      is_active: boolean;
      mode: PersonalRateMode;
    } =
      mode === "fixed"
        ? { price: Number(price) || 0, markup_amount: null, is_active: enabled, mode }
        : mode === "rate_plus_markup"
        ? { price: null, markup_amount: Number(markup) || 0, is_active: enabled, mode }
        : { price: null, markup_amount: null, is_active: enabled, mode };

    if (rate) {
      const { error: updateError } = await supabase
        .from("personal_lesson_rates")
        .update(payload)
        .eq("id", rate.id);
      setSaving(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from("personal_lesson_rates")
        .insert({ student_id: student.id, ...payload });
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
    <div className="rounded-2xl bg-white p-1">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">{student.full_name}</h3>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Условия активны
        </label>
      </div>

      <div className="mb-3 space-y-1.5 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "fixed"} onChange={() => setMode("fixed")} />
          Фиксированная индивидуальная цена
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "rate_only"} onChange={() => setMode("rate_only")} />
          Только оплата ставки преподавателя
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={mode === "rate_plus_markup"}
            onChange={() => setMode("rate_plus_markup")}
          />
          Ставка преподавателя + фиксированная надбавка
        </label>
      </div>

      {mode === "fixed" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Цена занятия для ученика, ₽</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      {mode === "rate_only" && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Ученик платит ровно ставку преподавателя, актуальную на момент занятия (раздел
          «Преподаватели») — студия ничего не добавляет сверху. Отдельно указывать ставку здесь
          не нужно.
        </p>
      )}

      {mode === "rate_plus_markup" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Надбавка студии, ₽</label>
          <input
            type="number"
            value={markup}
            onChange={(e) => setMarkup(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-400">
            К этой сумме прибавится ставка преподавателя (раздел «Преподаватели») на момент занятия
          </p>
        </div>
      )}

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
