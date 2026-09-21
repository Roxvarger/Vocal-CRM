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
type Room = { id: string; name: string };
type PersonOption = { id: string; full_name: string };

type Booking = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  is_single_lesson: boolean;
  room: { name: string } | null;
  teacher: { full_name: string } | null;
  student: { full_name: string } | null;
};

type StudentSubscription = {
  id: string;
  lessons_total: number;
  lessons_used: number;
  lessons_remaining: number;
  expires_at: string;
  plan: { name: string } | null;
};

// ---------- Вспомогательные функции с датами ----------

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = воскресенье
  const diff = day === 0 ? -6 : 1 - day; // сдвиг до понедельника этой недели
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatShortDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}.${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSameLocalDay(iso: string, day: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

// ---------- Основной компонент ----------

export default function ScheduleClient({
  currentUser,
  locations,
}: {
  currentUser: CurrentUser;
  locations: Location[];
}) {
  const supabase = createClient();
  const canCreate = currentUser.role === "admin" || currentUser.role === "teacher";
  const isAdmin = currentUser.role === "admin";

  const [locationId, setLocationId] = useState<string>(locations[0]?.id ?? "");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [teachers, setTeachers] = useState<PersonOption[]>([]);
  const [students, setStudents] = useState<PersonOption[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalDate, setModalDate] = useState<Date | null>(null);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Список офисов может быть пуст на самом первом запуске
  useEffect(() => {
    if (!locationId && locations[0]) {
      setLocationId(locations[0].id);
    }
  }, [locations, locationId]);

  // Подтягиваем кабинеты выбранного офиса
  useEffect(() => {
    if (!locationId) return;
    supabase
      .from("rooms")
      .select("id, name")
      .eq("location_id", locationId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setRooms(data ?? []));
  }, [locationId, supabase]);

  // Подтягиваем список учеников (и преподавателей, если админ) один раз
  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "student")
      .order("full_name")
      .then(({ data }) => setStudents(data ?? []));

    if (isAdmin) {
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "teacher")
        .order("full_name")
        .then(({ data }) => setTeachers(data ?? []));
    }
  }, [supabase, isAdmin]);

  // Подтягиваем записи на выбранную неделю в выбранном офисе
  useEffect(() => {
    if (!locationId) return;
    setLoadingBookings(true);
    setLoadError(null);

    const weekEnd = addDays(weekStart, 7);

    supabase
      .from("bookings")
      .select(
        "id, starts_at, ends_at, status, is_single_lesson, room:room_id(name), teacher:teacher_id(full_name), student:student_id(full_name)"
      )
      .eq("location_id", locationId)
      .eq("status", "scheduled")
      .gte("starts_at", weekStart.toISOString())
      .lt("starts_at", weekEnd.toISOString())
      .order("starts_at")
      .then(({ data, error }) => {
        setLoadingBookings(false);
        if (error) {
          setLoadError("Не удалось загрузить расписание. Попробуйте обновить страницу.");
          return;
        }
        // Supabase возвращает связанные записи как объект (не массив) при связи "многие-к-одному"
        setBookings((data as unknown as Booking[]) ?? []);
      });
  }, [locationId, weekStart, supabase]);

  async function refreshBookings() {
    if (!locationId) return;
    const weekEnd = addDays(weekStart, 7);
    const { data } = await supabase
      .from("bookings")
      .select(
        "id, starts_at, ends_at, status, is_single_lesson, room:room_id(name), teacher:teacher_id(full_name), student:student_id(full_name)"
      )
      .eq("location_id", locationId)
      .eq("status", "scheduled")
      .gte("starts_at", weekStart.toISOString())
      .lt("starts_at", weekEnd.toISOString())
      .order("starts_at");
    setBookings((data as unknown as Booking[]) ?? []);
  }

  async function handleCancel(bookingId: string) {
    if (!confirm("Отменить эту запись?")) return;
    const { error } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_by: currentUser.id,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (error) {
      alert("Не удалось отменить запись: " + error.message);
      return;
    }
    refreshBookings();
  }

  if (locations.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-6 text-slate-500 shadow-md">
        Офисы ещё не добавлены в систему — сначала нужно создать хотя бы один офис.
      </div>
    );
  }

  return (
    <div>
      {/* Переключатель офиса */}
      <div className="mb-4 flex flex-wrap gap-2">
        {locations.map((loc) => (
          <button
            key={loc.id}
            onClick={() => setLocationId(loc.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              locationId === loc.id
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {loc.name}
          </button>
        ))}
      </div>

      {/* Навигация по неделям */}
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-white p-4 shadow-md">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          ← Предыдущая
        </button>
        <span className="font-medium text-slate-700">
          {formatShortDate(weekDays[0])} – {formatShortDate(weekDays[6])}
        </span>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Следующая →
        </button>
      </div>

      {loadError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {loadError}
        </p>
      )}

      {/* Неделя: 7 карточек-дней */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {weekDays.map((day, idx) => {
          const dayBookings = bookings.filter((b) => isSameLocalDay(b.starts_at, day));
          return (
            <div
              key={idx}
              className="min-w-[220px] flex-1 rounded-2xl bg-white p-3 shadow-md"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  {WEEKDAY_LABELS[idx]} {formatShortDate(day)}
                </span>
                {canCreate && (
                  <button
                    onClick={() => setModalDate(day)}
                    className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                    title="Добавить запись"
                  >
                    + Добавить
                  </button>
                )}
              </div>

              {loadingBookings ? (
                <p className="text-xs text-slate-400">Загрузка…</p>
              ) : dayBookings.length === 0 ? (
                <p className="text-xs text-slate-400">Нет занятий</p>
              ) : (
                <div className="space-y-2">
                  {dayBookings.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-lg border border-slate-200 p-2 text-xs"
                    >
                      <div className="font-medium text-slate-700">
                        {formatTime(b.starts_at)}–{formatTime(b.ends_at)} ·{" "}
                        {b.room?.name ?? "?"}
                      </div>
                      <div className="text-slate-500">
                        {b.teacher?.full_name ?? "?"} → {b.student?.full_name ?? "?"}
                      </div>
                      {canCreate && (
                        <button
                          onClick={() => handleCancel(b.id)}
                          className="mt-1 text-red-500 hover:underline"
                        >
                          Отменить
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {modalDate && (
        <BookingModal
          date={modalDate}
          locationId={locationId}
          currentUser={currentUser}
          rooms={rooms}
          teachers={isAdmin ? teachers : [{ id: currentUser.id, full_name: currentUser.fullName }]}
          students={students}
          onClose={() => setModalDate(null)}
          onCreated={() => {
            setModalDate(null);
            refreshBookings();
          }}
        />
      )}
    </div>
  );
}

// ---------- Модальное окно создания записи ----------

function BookingModal({
  date,
  locationId,
  currentUser,
  rooms,
  teachers,
  students,
  onClose,
  onCreated,
}: {
  date: Date;
  locationId: string;
  currentUser: CurrentUser;
  rooms: Room[];
  teachers: PersonOption[];
  students: PersonOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const isAdmin = currentUser.role === "admin";

  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState(
    isAdmin ? teachers[0]?.id ?? "" : currentUser.id
  );
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [type, setType] = useState<"subscription" | "single">("subscription");
  const [price, setPrice] = useState("1500");
  const [studentSubs, setStudentSubs] = useState<StudentSubscription[]>([]);
  const [subscriptionId, setSubscriptionId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // При смене ученика или типа "по абонементу" — подгружаем его активные абонементы в этом офисе
  useEffect(() => {
    if (type !== "subscription" || !studentId) {
      setStudentSubs([]);
      setSubscriptionId("");
      return;
    }
    supabase
      .from("subscriptions")
      .select("id, lessons_total, lessons_used, lessons_remaining, expires_at, plan:plan_id(name)")
      .eq("student_id", studentId)
      .eq("location_id", locationId)
      .eq("status", "active")
      .gt("lessons_remaining", 0)
      .then(({ data }) => {
        const subs = (data as unknown as StudentSubscription[]) ?? [];
        setStudentSubs(subs);
        setSubscriptionId(subs[0]?.id ?? "");
      });
  }, [studentId, type, locationId, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!roomId || !teacherId || !studentId) {
      setError("Заполните все поля");
      return;
    }
    if (type === "subscription" && !subscriptionId) {
      setError("У ученика нет активного абонемента в этом офисе — выберите «Разовое занятие»");
      return;
    }

    const dateStr = formatDateInput(date);
    const startsAt = new Date(`${dateStr}T${startTime}:00`);
    const endsAt = new Date(`${dateStr}T${endTime}:00`);

    if (endsAt <= startsAt) {
      setError("Время окончания должно быть позже времени начала");
      return;
    }

    setSubmitting(true);

    const { error: insertError } = await supabase.from("bookings").insert({
      location_id: locationId,
      room_id: roomId,
      teacher_id: teacherId,
      student_id: studentId,
      subscription_id: type === "subscription" ? subscriptionId : null,
      is_single_lesson: type === "single",
      single_lesson_price: type === "single" ? Number(price) : null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      created_by: currentUser.id,
    });

    setSubmitting(false);

    if (insertError) {
      if (insertError.code === "23P01") {
        setError(
          "Это время уже занято — преподаватель, кабинет или ученик заняты в этот промежуток."
        );
      } else if (insertError.code === "23514") {
        setError("Проверьте данные формы — что-то не сходится.");
      } else {
        setError(insertError.message);
      }
      return;
    }

    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">
          Новая запись — {formatShortDate(date)}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Начало
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Окончание
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Кабинет</label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              required
            >
              {rooms.length === 0 && <option value="">Нет кабинетов в этом офисе</option>}
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Преподаватель
            </label>
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
              required
            >
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Ученик</label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              required
            >
              {students.length === 0 && <option value="">Нет учеников в системе</option>}
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Тип занятия
            </label>
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={type === "subscription"}
                  onChange={() => setType("subscription")}
                />
                Из абонемента
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={type === "single"}
                  onChange={() => setType("single")}
                />
                Разовое
              </label>
            </div>
          </div>

          {type === "subscription" ? (
            studentSubs.length > 0 ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Абонемент
                </label>
                <select
                  value={subscriptionId}
                  onChange={(e) => setSubscriptionId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {studentSubs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.plan?.name ?? "Абонемент"} — осталось {s.lessons_remaining} из{" "}
                      {s.lessons_total}, до{" "}
                      {new Date(s.expires_at).toLocaleDateString("ru-RU")}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                У этого ученика нет активного абонемента в выбранном офисе. Выберите
                «Разовое занятие» или сначала оформите абонемент.
              </p>
            )
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Стоимость занятия (₽)
              </label>
              <input
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                required
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
          )}

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
              {submitting ? "Сохраняем…" : "Записать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
