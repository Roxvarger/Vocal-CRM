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
// Персональные условия теперь привязаны к конкретному ученику (а не выбираются
// из общего списка тарифов) — если ученик есть в этой таблице, все его занятия
// автоматически идут как "Персональное".
type PersonalRate = { id: string; student_id: string; price: number; teacher_amount: number };
type LessonSubject = { id: string; name: string };

type BookingKind = "subscription" | "single" | "trial" | "rental" | "personal";

const KIND_LABELS: Record<BookingKind, string> = {
  subscription: "Из абонемента",
  single: "Разовое занятие",
  trial: "Пробное занятие",
  rental: "Аренда",
  personal: "Персональное",
};

type Booking = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  booking_kind: BookingKind;
  rental_client_name: string | null;
  lessons_charge: number;
  room_id: string | null;
  teacher_id: string | null;
  student_id: string | null;
  subscription_id: string | null;
  personal_rate_id: string | null;
  subject_id: string | null;
  room: { name: string } | null;
  teacher: { full_name: string } | null;
  student: { full_name: string } | null;
  subject: { name: string } | null;
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

function minutesSinceMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
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

function bookingLabel(b: Booking): string {
  switch (b.booking_kind) {
    case "rental":
      return `АРЕНДА${b.rental_client_name ? " — " + b.rental_client_name : ""} (${
        b.teacher?.full_name ?? "?"
      })`;
    case "trial":
      return `${b.teacher?.full_name ?? "?"} → ${b.student?.full_name ?? "?"} (пробное)`;
    case "personal":
      return `${b.teacher?.full_name ?? "?"} → ${b.student?.full_name ?? "?"} (персональное)`;
    default:
      return `${b.teacher?.full_name ?? "?"} → ${b.student?.full_name ?? "?"}`;
  }
}

// Цвет карточки занятия — по кабинету (чтобы было видно, где какой кабинет,
// одним взглядом на расписание). Названия кабинетов заданы вами в базе, поэтому
// сравниваем по вхождению подстроки — так это переживёт лёгкие изменения
// регистра или окончаний в названии.
function roomColorClasses(roomName: string | null | undefined, isRental: boolean): string {
  const name = (roomName || "").toLowerCase();
  let base = "border-slate-200 bg-white text-slate-700";
  if (name.includes("желт")) {
    base = "border-amber-200 bg-amber-50 text-amber-800";
  } else if (name.includes("син")) {
    base = "border-sky-200 bg-sky-50 text-sky-800";
  } else if (name.includes("актер") || name.includes("актёр")) {
    base = "border-pink-200 bg-pink-50 text-pink-800";
  }
  // Аренду дополнительно подчёркиваем пунктирной рамкой — цвет кабинета сохраняется,
  // но видно, что это не обычное занятие студии.
  if (isRental) {
    base += " border-dashed border-2 border-purple-300";
  }
  return base;
}

// ---------- Раскладка "Шкала времени": показывает реальные промежутки между занятиями ----------
// Рабочие часы студии для этого режима — 09:00–22:00. Все занятия за пределами
// этого окна всё равно будут показаны (прижаты к краю), просто не по правильному месту.
const TIMELINE_START_MIN = 9 * 60;
const TIMELINE_END_MIN = 22 * 60;
// 1.7 px/мин — чтобы даже самое короткое (30-минутное) занятие было достаточно
// высоким и умещало все три строки текста (время, кабинет, имя), не обрезая их.
const PX_PER_MIN = 1.7;
const TIMELINE_HEIGHT = (TIMELINE_END_MIN - TIMELINE_START_MIN) * PX_PER_MIN;

type LaidOutBooking = {
  booking: Booking;
  top: number;
  height: number;
  laneIndex: number;
  laneCount: number;
};

function layoutDayBookings(dayBookings: Booking[]): LaidOutBooking[] {
  const sorted = [...dayBookings].sort(
    (a, b) => minutesSinceMidnight(a.starts_at) - minutesSinceMidnight(b.starts_at)
  );

  // Жадно раскладываем занятия по "дорожкам": если время пересекается с уже
  // занятой дорожкой — открываем новую. Так параллельные занятия (разные
  // преподаватели/кабинеты в одно время) не накладываются друг на друга визуально.
  const laneEnds: number[] = [];
  const withLane = sorted.map((b) => {
    const start = minutesSinceMidnight(b.starts_at);
    let end = minutesSinceMidnight(b.ends_at);
    if (end <= start) end = start + 15; // страховка от занятий через полночь
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    return { booking: b, start, end, lane };
  });

  const laneCount = Math.max(1, laneEnds.length);

  return withLane.map(({ booking, start, end, lane }) => {
    const clampedStart = Math.min(Math.max(start, TIMELINE_START_MIN), TIMELINE_END_MIN);
    const clampedEnd = Math.min(Math.max(end, TIMELINE_START_MIN), TIMELINE_END_MIN);
    const top = (clampedStart - TIMELINE_START_MIN) * PX_PER_MIN;
    const height = Math.max((clampedEnd - clampedStart) * PX_PER_MIN, 16);
    return { booking, top, height, laneIndex: lane, laneCount };
  });
}

const TIMELINE_HOURS = Array.from(
  { length: TIMELINE_END_MIN / 60 - TIMELINE_START_MIN / 60 + 1 },
  (_, i) => TIMELINE_START_MIN / 60 + i
);

// ---------- Основной компонент ----------

type ViewMode = "all" | "teacher" | "room";
type LayoutMode = "list" | "timeline";

type ModalMode =
  | { kind: "create"; date: Date; initialStart?: string }
  | { kind: "edit"; booking: Booking };

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
  const [personalRates, setPersonalRates] = useState<PersonalRate[]>([]);
  const [subjects, setSubjects] = useState<LessonSubject[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalMode | null>(null);
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);

  // Режим просмотра: всё расписание / по преподавателям / по кабинетам
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [viewFilterId, setViewFilterId] = useState<string>("");
  // Режим раскладки: список подряд / шкала времени с промежутками
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("list");

  const BOOKING_SELECT =
    "id, starts_at, ends_at, status, booking_kind, rental_client_name, lessons_charge, room_id, teacher_id, student_id, subscription_id, personal_rate_id, subject_id, room:room_id(name), teacher:teacher_id(full_name), student:student_id(full_name), subject:subject_id(name)";

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

    supabase
      .from("personal_lesson_rates")
      .select("id, student_id, price, teacher_amount")
      .eq("is_active", true)
      .then(({ data }) => setPersonalRates(data ?? []));

    supabase
      .from("lesson_subjects")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setSubjects(data ?? []));
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
      .select(BOOKING_SELECT)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, weekStart, supabase]);

  async function refreshBookings() {
    if (!locationId) return;
    const weekEnd = addDays(weekStart, 7);
    const { data } = await supabase
      .from("bookings")
      .select(BOOKING_SELECT)
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
      {/* Шапка с офисом, неделей и фильтрами "прилипает" к верху экрана при прокрутке —
          так расписание можно листать вниз, не теряя переключатели из виду. */}
      <div className="sticky top-0 z-20 -mx-4 bg-slate-50 px-4 pb-1 pt-2 sm:-mx-0 sm:px-0 sm:pt-0">
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

      {/* Переключатель раскладки: список подряд / шкала времени с промежутками */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-md">
        <span className="mr-1 text-xs font-medium text-slate-500">Вид:</span>
        <button className={tabClass(layoutMode === "list")} onClick={() => setLayoutMode("list")}>
          Список
        </button>
        <button
          className={tabClass(layoutMode === "timeline")}
          onClick={() => setLayoutMode("timeline")}
        >
          Шкала времени
        </button>
        {layoutMode === "timeline" && (
          <span className="text-xs text-slate-400">
            Занятия расположены по реальному времени — пустое место = свободное окно (09:00–22:00).
            Кликните по пустому месту, чтобы добавить запись на это время.
          </span>
        )}
      </div>
      </div>

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
            <div key={idx} className="rounded-2xl bg-white p-3 shadow-md">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  {WEEKDAY_LABELS[idx]} {formatShortDate(day)}
                </span>
                {canCreate && (
                  <button
                    onClick={() => setModal({ kind: "create", date: day })}
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
              ) : layoutMode === "list" ? (
                <div className="space-y-2">
                  {dayBookings.map((b) => (
                    <div
                      key={b.id}
                      onClick={() => setDetailBooking(b)}
                      className={`cursor-pointer rounded-lg border p-2 text-xs transition hover:brightness-95 ${roomColorClasses(
                        b.room?.name,
                        b.booking_kind === "rental"
                      )}`}
                    >
                      <div className="flex items-center gap-1 font-medium">
                        {formatTime(b.starts_at)}–{formatTime(b.ends_at)} · {b.room?.name ?? "?"}
                        {b.lessons_charge === 2 && (
                          <span className="rounded bg-white/70 px-1 text-[10px] font-semibold">
                            ×2
                          </span>
                        )}
                      </div>
                      <div className="opacity-80">{bookingLabel(b)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="relative pl-9"
                  style={{ height: TIMELINE_HEIGHT }}
                  onClick={(e) => {
                    if (!canCreate) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const rawMinutes = TIMELINE_START_MIN + y / PX_PER_MIN;
                    const rounded = Math.max(
                      TIMELINE_START_MIN,
                      Math.min(TIMELINE_END_MIN - 30, Math.round(rawMinutes / 5) * 5)
                    );
                    const hh = String(Math.floor(rounded / 60)).padStart(2, "0");
                    const mm = String(rounded % 60).padStart(2, "0");
                    setModal({ kind: "create", date: day, initialStart: `${hh}:${mm}` });
                  }}
                >
                  {TIMELINE_HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="pointer-events-none absolute left-9 right-0 border-t border-slate-100"
                      style={{ top: (hour * 60 - TIMELINE_START_MIN) * PX_PER_MIN }}
                    >
                      <span className="absolute -left-9 -top-2 w-8 pr-1 text-right text-[10px] text-slate-300">
                        {hour}:00
                      </span>
                    </div>
                  ))}
                  {layoutDayBookings(dayBookings).map(({ booking: b, top, height, laneIndex, laneCount }) => (
                    <button
                      key={b.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailBooking(b);
                      }}
                      title={`${formatTime(b.starts_at)}–${formatTime(b.ends_at)} · ${
                        b.room?.name ?? "?"
                      } · ${bookingLabel(b)}`}
                      className={`absolute overflow-hidden rounded-md border p-1 text-left text-[10px] leading-tight ${roomColorClasses(
                        b.room?.name,
                        b.booking_kind === "rental"
                      )} cursor-pointer hover:brightness-95`}
                      style={{
                        top,
                        height,
                        left: `${(laneIndex / laneCount) * 100}%`,
                        width: `calc(${100 / laneCount}% - 3px)`,
                      }}
                    >
                      <div className="font-semibold">
                        {formatTime(b.starts_at)}–{formatTime(b.ends_at)}
                        {b.lessons_charge === 2 && " ×2"}
                      </div>
                      <div className="truncate">{b.room?.name ?? "?"}</div>
                      <div className="truncate">{bookingLabel(b)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {detailBooking && (
        <BookingDetailModal
          booking={detailBooking}
          canEdit={canCreate}
          onClose={() => setDetailBooking(null)}
          onEdit={() => {
            setModal({ kind: "edit", booking: detailBooking });
            setDetailBooking(null);
          }}
          onCancel={() => {
            handleCancel(detailBooking.id);
            setDetailBooking(null);
          }}
        />
      )}

      {modal && (
        <BookingModal
          mode={modal}
          locationId={locationId}
          currentUser={currentUser}
          rooms={rooms}
          teachers={isAdmin ? teachers : [{ id: currentUser.id, full_name: currentUser.fullName }]}
          students={students}
          teacherDefaultRooms={teacherDefaultRooms}
          personalRates={personalRates}
          subjects={subjects}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refreshBookings();
          }}
        />
      )}
    </div>
  );
}

// ---------- Карточка просмотра записи (вместо мгновенной отмены по клику) ----------

function BookingDetailModal({
  booking,
  canEdit,
  onClose,
  onEdit,
  onCancel,
}: {
  booking: Booking;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-slate-800">
          {KIND_LABELS[booking.booking_kind]}
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          {formatShortDate(new Date(booking.starts_at))}, {formatTime(booking.starts_at)}–
          {formatTime(booking.ends_at)}
        </p>
        <div className="space-y-1.5 text-sm text-slate-700">
          <p>
            <span className="text-slate-400">Кабинет: </span>
            {booking.room?.name ?? "?"}
          </p>
          <p>
            <span className="text-slate-400">Преподаватель: </span>
            {booking.teacher?.full_name ?? "?"}
          </p>
          {booking.booking_kind === "rental" ? (
            <p>
              <span className="text-slate-400">Клиент: </span>
              {booking.rental_client_name || "не указан"}
            </p>
          ) : (
            <p>
              <span className="text-slate-400">Обучающийся: </span>
              {booking.student?.full_name ?? "?"}
            </p>
          )}
          {booking.subject?.name && (
            <p>
              <span className="text-slate-400">Направление: </span>
              {booking.subject.name}
            </p>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Закрыть
          </button>
          {canEdit && (
            <>
              <button
                onClick={onEdit}
                className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Изменить
              </button>
              <button
                onClick={onCancel}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Отменить
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Модальное окно создания / изменения записи ----------

function BookingModal({
  mode,
  locationId,
  currentUser,
  rooms,
  teachers,
  students,
  teacherDefaultRooms,
  personalRates,
  subjects,
  onClose,
  onSaved,
}: {
  mode: ModalMode;
  locationId: string;
  currentUser: CurrentUser;
  rooms: Room[];
  teachers: PersonOption[];
  students: PersonOption[];
  teacherDefaultRooms: Record<string, string>;
  personalRates: PersonalRate[];
  subjects: LessonSubject[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const isAdmin = currentUser.role === "admin";
  const isEdit = mode.kind === "edit";
  const day = isEdit ? new Date(mode.booking.starts_at) : mode.date;

  const initialTeacherId = isEdit
    ? mode.booking.teacher_id ?? ""
    : isAdmin
    ? teachers[0]?.id ?? ""
    : currentUser.id;

  const [teacherId, setTeacherId] = useState(initialTeacherId);
  const [roomId, setRoomId] = useState(
    isEdit ? mode.booking.room_id ?? "" : teacherDefaultRooms[initialTeacherId] ?? rooms[0]?.id ?? ""
  );
  const [studentId, setStudentId] = useState(
    isEdit ? mode.booking.student_id ?? "" : students[0]?.id ?? ""
  );
  const [subjectId, setSubjectId] = useState(isEdit ? mode.booking.subject_id ?? "" : "");

  // По умолчанию для новой записи подставляем направление "Вокал" (как только справочник загрузится)
  useEffect(() => {
    if (isEdit) return;
    if (subjectId) return;
    const vocal = subjects.find((s) => s.name.toLowerCase() === "вокал");
    if (vocal) setSubjectId(vocal.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects]);
  const [startTime, setStartTime] = useState(
    isEdit ? formatTime(mode.booking.starts_at) : mode.initialStart ?? "10:00"
  );
  const initialEditDuration = isEdit
    ? Math.round(
        (new Date(mode.booking.ends_at).getTime() - new Date(mode.booking.starts_at).getTime()) / 60000
      )
    : 30;
  const [lessonCount, setLessonCount] = useState(1);
  const [lessonDuration, setLessonDuration] = useState<30 | 50>(30);
  const [editDuration, setEditDuration] = useState(initialEditDuration);
  const [kind, setKind] = useState<BookingKind>(isEdit ? mode.booking.booking_kind : "single");
  const [rentalClientName, setRentalClientName] = useState(
    isEdit ? mode.booking.rental_client_name ?? "" : ""
  );
  const [studentSubs, setStudentSubs] = useState<StudentSubscription[]>([]);
  const [subscriptionId, setSubscriptionId] = useState<string>(
    isEdit ? mode.booking.subscription_id ?? "" : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // При выборе преподавателя (только при создании новой записи) — подставляем его
  // приоритетный кабинет как подсказку. Кабинет остаётся полностью редактируемым.
  useEffect(() => {
    if (isEdit) return;
    const suggested = teacherDefaultRooms[teacherId];
    if (suggested && rooms.some((r) => r.id === suggested)) {
      setRoomId(suggested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

  // Активные абонементы выбранного обучающегося — чтобы понять, доступен ли пункт "Из абонемента"
  useEffect(() => {
    if (!studentId || kind === "rental") {
      setStudentSubs([]);
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
        setSubscriptionId((prev) => (subs.some((s) => s.id === prev) ? prev : subs[0]?.id ?? ""));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, locationId, supabase, kind]);

  // Если абонемент закончился/пропал, а был выбран тип "Из абонемента" — переключаем на "Разовое"
  useEffect(() => {
    if (kind === "subscription" && studentSubs.length === 0) {
      setKind("single");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentSubs]);

  const subscriptionAvailable = studentSubs.length > 0;

  // Персональные условия закреплены за конкретным учеником администратором отдельно
  // (не выбираются вручную здесь). Если у выбранного ученика такие условия есть —
  // тип занятия автоматически становится "Персональное", и другие варианты скрываются.
  const studentPersonalRate = personalRates.find((r) => r.student_id === studentId);

  useEffect(() => {
    setKind((prev) => {
      if (prev === "rental") return prev;
      if (studentPersonalRate) return "personal";
      if (prev === "personal") return "single";
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentPersonalRate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!roomId || !teacherId) {
      setError("Заполните все поля");
      return;
    }
    if (kind !== "rental" && !studentId) {
      setError("Выберите обучающегося");
      return;
    }
    if (!subjectId) {
      setError("Выберите направление занятия");
      return;
    }
    if (kind === "subscription" && (!subscriptionId || studentSubs.length === 0)) {
      setError("У обучающегося нет активного абонемента — выберите другой тип занятия");
      return;
    }
    if (kind === "personal" && !studentPersonalRate) {
      setError("У этого обучающегося больше нет персональных условий — обновите страницу");
      return;
    }

    const baseFields = {
      location_id: locationId,
      room_id: roomId,
      teacher_id: teacherId,
      student_id: kind === "rental" ? null : studentId,
      subscription_id: kind === "subscription" ? subscriptionId : null,
      subject_id: subjectId || null,
      booking_kind: kind,
      is_single_lesson: kind !== "subscription" && kind !== "rental",
      is_rental: kind === "rental",
      rental_client_name: kind === "rental" ? rentalClientName || null : null,
      personal_rate_id: kind === "personal" ? studentPersonalRate?.id ?? null : null,
      single_lesson_price: null as number | null,
      lessons_charge: 1,
      created_by: currentUser.id,
    };

    setSubmitting(true);

    if (isEdit) {
      const dateStr = formatDateInput(day);
      const startsAt = new Date(`${dateStr}T${startTime}:00`);
      const endsAt = new Date(startsAt.getTime() + editDuration * 60 * 1000);

      const { error: updateError } = await supabase
        .from("bookings")
        .update({ ...baseFields, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
        .eq("id", mode.booking.id);

      setSubmitting(false);
      if (updateError) {
        setError(
          updateError.code === "23P01"
            ? "Это время уже занято — преподаватель, кабинет или обучающийся заняты в этот промежуток."
            : updateError.message
        );
        return;
      }
      onSaved();
      return;
    }

    const dateStr = formatDateInput(day);
    const rows = Array.from({ length: lessonCount }, (_, i) => {
      const startsAt = new Date(`${dateStr}T${startTime}:00`);
      startsAt.setMinutes(startsAt.getMinutes() + i * lessonDuration);
      const endsAt = new Date(startsAt.getTime() + lessonDuration * 60 * 1000);
      return { ...baseFields, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() };
    });

    const { error: insertError } = await supabase.from("bookings").insert(rows);

    setSubmitting(false);
    if (insertError) {
      setError(
        insertError.code === "23P01"
          ? "Это время уже занято — преподаватель, кабинет или обучающийся заняты в этот промежуток."
          : insertError.code === "23514"
          ? "Проверьте данные формы — что-то не сходится."
          : insertError.message
      );
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">
          {isEdit ? "Изменить запись" : "Новая запись"} — {formatShortDate(day)}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className={`grid gap-3 ${isEdit ? "grid-cols-2" : "grid-cols-3"}`}>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Начало</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                required
              />
            </div>
            {!isEdit && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Кол-во занятий</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={lessonCount}
                  onChange={(e) => setLessonCount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Длительность</label>
              {isEdit ? (
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={editDuration}
                  onChange={(e) => setEditDuration(Number(e.target.value) || 5)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              ) : (
                <select
                  value={lessonDuration}
                  onChange={(e) => setLessonDuration(Number(e.target.value) as 30 | 50)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value={30}>30 минут</option>
                  <option value={50}>50 минут</option>
                </select>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-400">
            {!isEdit && lessonCount > 1
              ? `Будет создано ${lessonCount} занятия подряд по ${lessonDuration} мин, с ${startTime} до ${formatTimeFromParts(
                  startTime,
                  lessonCount * lessonDuration
                )}`
              : `Занятие пройдёт с ${startTime} до ${formatTimeFromParts(
                  startTime,
                  isEdit ? editDuration : lessonDuration
                )}`}
          </p>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Преподаватель</label>
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

          {kind === "rental" ? (
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
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Обучающийся</label>
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

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Направление</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              required
            >
              <option value="" disabled>
                {subjects.length === 0 ? "Нет направлений в справочнике" : "Выберите направление"}
              </option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {kind !== "rental" && studentPersonalRate ? (
            <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
              Тип занятия: <strong>Персональное</strong> — у этого обучающегося персональные условия,
              назначенные администратором. Чтобы поставить другой тип, сначала снимите с него
              персональные условия в справочнике.
            </p>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Тип занятия</label>
              <div className="flex flex-col gap-1.5 text-sm">
                <label
                  className={`flex items-center gap-2 ${!subscriptionAvailable ? "text-slate-300" : ""}`}
                >
                  <input
                    type="radio"
                    checked={kind === "subscription"}
                    disabled={!subscriptionAvailable}
                    onChange={() => setKind("subscription")}
                  />
                  Из абонемента {!subscriptionAvailable && "(нет активного абонемента)"}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={kind === "single"} onChange={() => setKind("single")} />
                  Разовое занятие
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={kind === "trial"} onChange={() => setKind("trial")} />
                  Пробное занятие
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={kind === "rental"} onChange={() => setKind("rental")} />
                  Аренда
                </label>
              </div>
            </div>
          )}

          {kind === "subscription" &&
            (subscriptionAvailable ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Абонемент</label>
                <select
                  value={subscriptionId}
                  onChange={(e) => setSubscriptionId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {studentSubs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.plan?.name ?? "Абонемент"} — осталось {s.lessons_remaining} из{" "}
                      {s.lessons_total}, до {new Date(s.expires_at).toLocaleDateString("ru-RU")}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                У этого обучающегося нет активного абонемента — выберите другой тип занятия.
              </p>
            ))}


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
              {submitting ? "Сохраняем…" : isEdit ? "Сохранить" : "Записать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
