"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ---------- Типы ----------

type Location = { id: string; name: string };
type BookingKind = "subscription" | "single" | "trial" | "rental" | "personal";

const KIND_LABELS: Record<BookingKind, string> = {
  subscription: "Из абонемента",
  single: "Разовое занятие",
  trial: "Пробное занятие",
  rental: "Аренда",
  personal: "Персональное",
};

type PaymentBooking = {
  id: string;
  starts_at: string;
  status: string;
  booking_kind: BookingKind;
  is_paid: boolean;
  payment_amount: number | null;
  trial_student_name: string | null;
  trial_student_contact: string | null;
  teacher: { full_name: string } | null;
  student: { full_name: string } | null;
  subject: { name: string } | null;
};

type PaymentSubscription = {
  id: string;
  starts_at: string;
  expires_at: string;
  lessons_total: number;
  lessons_remaining: number;
  is_paid: boolean;
  payment_amount: number | null;
  student: { full_name: string } | null;
  plan: { name: string; price: number } | null;
};

type Filter = "unpaid" | "paid" | "all";
type Section = "lessons" | "subscriptions";

// ---------- Вспомогательные функции ----------

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}.${d.getFullYear()}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${formatDate(iso)}, ${time}`;
}

function formatMoney(n: number): string {
  return `${n.toLocaleString("ru-RU")} ₽`;
}

// ---------- Основной компонент ----------

export default function PaymentsClient({ locations }: { locations: Location[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [section, setSection] = useState<Section>("lessons");
  const [filter, setFilter] = useState<Filter>("unpaid");

  const [bookings, setBookings] = useState<PaymentBooking[]>([]);
  const [subscriptions, setSubscriptions] = useState<PaymentSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const BOOKING_SELECT =
    "id, starts_at, status, booking_kind, is_paid, payment_amount, trial_student_name, trial_student_contact, teacher:teacher_id(full_name), student:student_id(full_name), subject:subject_id(name)";
  const SUBSCRIPTION_SELECT =
    "id, starts_at, expires_at, lessons_total, lessons_remaining, is_paid, payment_amount, student:student_id(full_name), plan:plan_id(name, price)";

  async function loadBookings() {
    if (!locationId) return;
    const { data } = await supabase
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("location_id", locationId)
      .in("booking_kind", ["single", "trial"])
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false })
      .limit(200);
    setBookings((data as unknown as PaymentBooking[]) ?? []);
  }

  async function loadSubscriptions() {
    if (!locationId) return;
    const { data } = await supabase
      .from("subscriptions")
      .select(SUBSCRIPTION_SELECT)
      .eq("location_id", locationId)
      .order("starts_at", { ascending: false })
      .limit(200);
    setSubscriptions((data as unknown as PaymentSubscription[]) ?? []);
  }

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadBookings(), loadSubscriptions()]);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  const filteredBookings = bookings.filter((b) => {
    if (filter === "unpaid") return !b.is_paid;
    if (filter === "paid") return b.is_paid;
    return true;
  });

  const filteredSubscriptions = subscriptions.filter((s) => {
    if (filter === "unpaid") return !s.is_paid;
    if (filter === "paid") return s.is_paid;
    return true;
  });

  async function markBookingPaid(booking: PaymentBooking) {
    const raw = amounts[booking.id];
    const amount = raw ? Number(raw) : null;
    const { error } = await supabase
      .from("bookings")
      .update({ is_paid: true, payment_amount: amount, paid_at: new Date().toISOString() })
      .eq("id", booking.id);
    if (error) {
      alert("Не удалось отметить оплату: " + error.message);
      return;
    }
    await loadBookings();
  }

  async function markBookingUnpaid(booking: PaymentBooking) {
    const { error } = await supabase.from("bookings").update({ is_paid: false }).eq("id", booking.id);
    if (error) {
      alert("Не удалось снять отметку оплаты: " + error.message);
      return;
    }
    await loadBookings();
  }

  async function markSubscriptionPaid(sub: PaymentSubscription) {
    const raw = amounts[sub.id];
    const amount = raw ? Number(raw) : sub.plan?.price ?? null;
    const { error } = await supabase
      .from("subscriptions")
      .update({ is_paid: true, payment_amount: amount, paid_at: new Date().toISOString() })
      .eq("id", sub.id);
    if (error) {
      alert("Не удалось отметить оплату: " + error.message);
      return;
    }
    await loadSubscriptions();
  }

  async function markSubscriptionUnpaid(sub: PaymentSubscription) {
    const { error } = await supabase.from("subscriptions").update({ is_paid: false }).eq("id", sub.id);
    if (error) {
      alert("Не удалось снять отметку оплаты: " + error.message);
      return;
    }
    await loadSubscriptions();
  }

  if (locations.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-6 text-slate-500 shadow-md">
        Офисы ещё не добавлены — сначала создайте хотя бы один офис.
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Оплата занятий</h1>
      <p className="mb-4 text-sm text-slate-500">
        Отметьте здесь оплату разовых и пробных занятий, а также абонементов, выданных до фактической
        оплаты. Персональные условия и аренда считаются оплаченными автоматически.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {locations.map((loc) => (
          <button
            key={loc.id}
            onClick={() => setLocationId(loc.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              locationId === loc.id ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {loc.name}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-md">
        <span className="mr-1 text-xs font-medium text-slate-500">Раздел:</span>
        <button
          onClick={() => setSection("lessons")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
            section === "lessons" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Разовые и пробные занятия
        </button>
        <button
          onClick={() => setSection("subscriptions")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
            section === "subscriptions"
              ? "bg-slate-800 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Абонементы
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-md">
        <span className="mr-1 text-xs font-medium text-slate-500">Показать:</span>
        {(["unpaid", "paid", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              filter === f ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f === "unpaid" ? "Не оплачено" : f === "paid" ? "Оплачено" : "Все"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Загрузка…</p>
      ) : section === "lessons" ? (
        filteredBookings.length === 0 ? (
          <p className="text-sm text-slate-400">Ничего не найдено</p>
        ) : (
          <div className="space-y-2">
            {filteredBookings.map((b) => (
              <div key={b.id} className="rounded-2xl bg-white p-4 shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {formatDateTime(b.starts_at)} · {KIND_LABELS[b.booking_kind]}
                      {b.status === "completed" && (
                        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                          Проведено
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {b.teacher?.full_name ?? "?"} → {b.student?.full_name || b.trial_student_name || "?"}
                      {b.subject?.name ? ` · ${b.subject.name}` : ""}
                    </p>
                    {b.trial_student_contact && (
                      <p className="text-xs text-slate-400">Контакты: {b.trial_student_contact}</p>
                    )}
                  </div>
                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
                      b.is_paid ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                    }`}
                  >
                    {b.is_paid
                      ? `Оплачено${b.payment_amount ? " · " + formatMoney(b.payment_amount) : ""}`
                      : "Не оплачено"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!b.is_paid ? (
                    <>
                      <input
                        type="number"
                        placeholder="Сумма, ₽ (необязательно)"
                        value={amounts[b.id] ?? ""}
                        onChange={(e) => setAmounts((prev) => ({ ...prev, [b.id]: e.target.value }))}
                        className="w-44 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <button
                        onClick={() => markBookingPaid(b)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                      >
                        Отметить оплаченным
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => markBookingUnpaid(b)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      Снять отметку (ошиблись)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : filteredSubscriptions.length === 0 ? (
        <p className="text-sm text-slate-400">Ничего не найдено</p>
      ) : (
        <div className="space-y-2">
          {filteredSubscriptions.map((s) => (
            <div key={s.id} className="rounded-2xl bg-white p-4 shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {s.student?.full_name ?? "?"} · {s.plan?.name ?? "Абонемент"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Выдан {formatDate(s.starts_at)}, действует до {formatDate(s.expires_at)} · осталось{" "}
                    {s.lessons_remaining} из {s.lessons_total}
                    {s.plan?.price ? ` · цена ${formatMoney(s.plan.price)}` : ""}
                  </p>
                </div>
                <span
                  className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
                    s.is_paid ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                  }`}
                >
                  {s.is_paid
                    ? `Оплачено${s.payment_amount ? " · " + formatMoney(s.payment_amount) : ""}`
                    : "Не оплачено"}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!s.is_paid ? (
                  <>
                    <input
                      type="number"
                      placeholder={s.plan?.price ? String(s.plan.price) : "Сумма, ₽"}
                      value={amounts[s.id] ?? ""}
                      onChange={(e) => setAmounts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      className="w-44 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <button
                      onClick={() => markSubscriptionPaid(s)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Отметить оплаченным
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => markSubscriptionUnpaid(s)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Снять отметку (ошиблись)
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
