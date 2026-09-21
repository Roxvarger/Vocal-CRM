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
  is_rental: boolean;
  rental_client_name: string | null;
  lessons_charge: number;
  room_id: string | null;
  teacher_id: string | null;
  student_id: string | null;
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

function formatTimeFromParts(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const totalMinutes = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

function isSameLocalDay(iso: string, day: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

// Классы для кнопок-переключателей (вида и фильтров)
function tabClass(active: boolean): string {
  return `rounded-full px-3 py-1.5 text-sm font-medium transition ${
    active ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
  }`;
}

function pillClass(active: boolean): string {
  return `rounded-full px-2.5 py-1 text-xs font-medium transition ${
    active ? "bg-indigo-600 text-white" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
  }`;
}

// ---------- Основной компонент ----------

type ViewMode = "all" | "teacher" | "room";

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
  // Разбивку по преподавателям/кабинетам показываем администратору и менеджеру —
  // им нужно видеть занятость всей студии, а не только свои записи.
  const canManageView = currentUser.role === "admin" || currentUser.role === "manager";

  const [locationId, setLocationId] = useState<string>(locations[0]?.id ?? "");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [teachers, setTeachers] = useState<PersonOption[]>([]);
  const [students, setStudents] = useState<PersonOption[]>([]);
  const [teacherDefaultRooms, setTeacherDefaultRooms] = useState<Record<string, string>>({});
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalDate, setModalDate] = useState<Date | null>(null);

  // Режим просмотра: всё расписание / по преподавателям / по кабинетам
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [viewFilterId, setViewFilterId] = useState<string>("");

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

  // Подтягиваем список учеников (и преподавателей, если админ/менеджер) один раз
  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "student")
      .order("full_name")
      .then(({ data }) => setStudents(data ?? []));

    if (isAdmin || canManageView) {
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "teacher")
        .order("full_name")
        .then(({ data }) => setTeachers(data ?? []));
    }

    // Приоритетные кабинеты преподавателей — только подсказка при создании записи,
    // выбор кабинета всегда можно поменять вручную.
    supabase
      .from("teacher_profiles")
      .select("user_id, default_room_id")
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach((row: { user_id: string; default_room_id: string | null }) => {
          if (row.default_room_id) map[row.user_id] = row.default_room_id;
        });
        setTeacherDefaultRooms(map);
      });
  }, [supabase, isAdmin, canManageView]);

  // Когда переключаем режим просмотра — выбираем первый элемент списка по умолчанию
  useEffect(() => {
    if (viewMode === "teacher") {
      setViewFilterId((prev) => (teachers.some((t) => t.id === prev) ? prev : teachers[0]?.id ?? ""));
    } else if (viewMode === "room") {
      setViewFilterId((prev) => (rooms.some((r) => r.id === prev) ? prev : rooms[0]?.id ?? ""));
    } else {
      setViewFilterId("");
    }
  }, [viewMode, teachers, rooms]);

  // Подтягиваем записи на выбранную неделю в выбранном офисе
  useEffect(() => {
    if (!locationId) return;
    setLoadingBookings(true);
    setLoadError(null);

    const weekEnd = addDays(weekStart, 7);

    supabase
      .from("bookings")
      .select(
        "id, starts_at, ends_at, status, is_single_lesson, is_rental, rental_client_name, lessons_charge, room_id, teacher_id, student_id, room:room_id(name), teacher:teacher_id(full_name), student:student_id(full_name)"
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
        "id, starts_at, ends_at, status, is_single_lesson, is_rental, rental_client_name, lessons_charge, room_id, teacher_id, student_id, room:room_id(name), teacher:teacher_id(full_name), student:student_id(full_name)"
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

      {/* Переключатель режима просмотра: всё / по преподавателям / по кабинетам */}
      {canManageView && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-md">
          <span className="mr-1 text-xs font-medium text-slate-500">Показать:</span>
          <button className={tabClass(viewMode === "all")} onClick={() => setViewMode("all")}>
            Всё расписание
          </button>
          <button className={tabClass(viewMode === "teacher")} onClick={() => setViewMode("teacher")}>
            По преподавателям
          </button>
          <button className={tabClass(viewMode === "room")} onClick={() => setViewMode("room")}>
            По кабинетам
          </button>

          {viewMode === "teacher" && (
            <div className="ml-2 flex flex-wrap gap-1.5 border-l border-slate-200 pl-3">
              {teachers.length === 0 && (
                <span className="text-xs text-slate-400">Нет преподавателей</span>
              )}
              {teachers.map((t) => (
                <button
                  key={t.id}
                  className={pillClass(viewFilterId === t.id)}
                  onClick={() => setViewFilterId(t.id)}
                >
                  {t.full_name}
                </button>
              ))}
            </div>
          )}

          {viewMode === "room" && (
            <div className="ml-2 flex flex-wrap gap-1.5 border-l border-slate-200 pl-3">
              {rooms.length === 0 && <span className="text-xs text-slate-400">Нет кабинетов</span>}
              {rooms.map((r) => (
                <button
                  key={r.id}
                  className={pillClass(viewFilterId === r.id)}
                  onClick={() => setViewFilterId(r.id)}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loadError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {loadError}
        </p>
      )}

      {/* Неделя: 7 карточек-дней. Сетка сама переносит карточки на следующую строку,
          если экран узкий — так все 7 дней всегда видны без прокрутки вбок. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {weekDays.map((day, idx) => {
          const dayBookings = bookings.filter((b) => {
            if (!isSameLocalDay(b.starts_at, day)) return false;
            if (viewMode === "teacher" && viewFilterId) return b.teacher_id === viewFilterId;
            if (viewMode === "room" && viewFilterId) return b.room_id === viewFilterId;
            return true;
          });
          return (
            <div
              key={idx}
              className="rounded-2xl bg-white p-3 shadow-md"
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
                <p className="text-xs text-slate-400">
                  {viewMode === "room" && viewFilterId ? "Кабинет свободен весь день" : "Нет занятий"}
                </p>
              ) : (
                <div className="space-y-2">
                  {dayBookings.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-lg border border-slate-200 p-2 text-xs"
                    >
                      <div className="flex items-center gap-1 font-medium text-slate-700">
                        {formatTime(b.starts_at)}–{formatTime(b.ends_at)} ·{" "}
                        {b.room?.name ?? "?"}
                        {b.lessons_charge === 2 && (
                          <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">
                            ×2
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500">
                        {b.is_rental
                          ? `Аренда${b.rental_client_name ? " — " + b.rental_client_name : ""} (${
                              b.teacher?.full_name ?? "?"
                            })`
                          : `${b.teacher?.full_name ?? "?"} → ${b.student?.full_name ?? "?"}`}
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
          teacherDefaultRooms={teacherDefaultRooms}
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

type BookingType = "subscription" | "single" | "rental";

function BookingModal({
  date,
  locationId,
  currentUser,
  rooms,
  teachers,
  students,
  teacherDefaultRooms,
  onClose,
  onCreated,
}: {
  date: Date;
  locationId: string;
  currentUser: CurrentUser;
  rooms: Room[];
  teachers: PersonOption[];
  students: PersonOption[];
  teacherDefaultRooms: Record<string, string>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const isAdmin = currentUser.role === "admin";

  const initialTeacherId = isAdmin ? teachers[0]?.id ?? "" : currentUser.id;

  const [roomId, setRoomId] = useState(
    teacherDefaultRooms[initialTeacherId] ?? rooms[0]?.id ?? ""
  );
  const [teacherId, setTeacherId] = useState(initialTeacherId);
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [startTime, setStartTime] = useState("10:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [type, setType] = useState<BookingType>("subscription");
  const [isDouble, setIsDouble] = useState(false);
  const [price, setPrice] = useState("1500");
  const [rentalClientName, setRentalClientName] = useState("");
  const [studentSubs, setStudentSubs] = useState<StudentSubscription[]>([]);
  const [subscriptionId, setSubscriptionId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // При выборе преподавателя — подставляем его приоритетный кабинет как подсказку.
  // Кабинет остаётся полностью редактируемым: это просто удобный вариант по умолчанию,
  // потому что преподаватели закреплены за кабинетами не жёстко.
  useEffect(() => {
    const suggested = teacherDefaultRooms[teacherId];
    if (suggested && rooms.some((r) => r.id === suggested)) {
      setRoomId(suggested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

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

    if (!roomId || !teacherId) {
      setError("Заполните все поля");
      return;
    }
    if (type !== "rental" && !studentId) {
      setError("Выберите ученика");
      return;
    }
    if (type === "subscription" && !subscriptionId) {
      setError("У ученика нет активного абонемента в этом офисе — выберите «Разовое занятие»");
      return;
    }

    const dateStr = formatDateInput(date);
    const startsAt = new Date(`${dateStr}T${startTime}:00`);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

    setSubmitting(true);

    const { error: insertError } = await supabase.from("bookings").insert({
      location_id: locationId,
      room_id: roomId,
      teacher_id: teacherId,
      student_id: type === "rental" ? null : studentId,
      subscription_id: type === "subscription" ? subscriptionId : null,
      is_single_lesson: type === "single",
      single_lesson_price: type === "single" ? Number(price) : null,
      is_rental: type === "rental",
      rental_client_name: type === "rental" ? rentalClientName || null : null,
      lessons_charge: type === "rental" ? 1 : isDouble ? 2 : 1,
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
                Длительность
              </label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value={30}>30 минут</option>
                <option value={45}>45 минут</option>
                <option value={60}>60 минут</option>
                <option value={90}>90 минут</option>
                <option value={120}>120 минут</option>
              </select>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Занятие пройдёт с {startTime} до{" "}
            {formatTimeFromParts(startTime, durationMinutes)}
          </p>

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
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Тип занятия
            </label>
            <div className="flex flex-wrap gap-3 text-sm">
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
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={type === "rental"}
                  onChange={() => setType("rental")}
                />
                Аренда
              </label>
            </div>
          </div>

          {type === "rental" ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Имя клиента (необязательно)
              </label>
              <input
                type="text"
                value={rentalClientName}
                onChange={(e) => setRentalClientName(e.target.value)}
                placeholder="Личный ученик преподавателя"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              <p className="mt-1 text-xs text-slate-400">
                Аренда — это личные ученики преподавателя, студия не ведёт их учёт, но получает
                оплату за аренду кабинета.
              </p>
            </div>
          ) : (
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
          )}

          {type !== "rental" && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={isDouble}
                onChange={(e) => setIsDouble(e.target.checked)}
              />
              Сдвоенное занятие (списывается 2 занятия)
            </label>
          )}

          {type === "subscription" && (
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
          )}

          {type === "single" && (
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
