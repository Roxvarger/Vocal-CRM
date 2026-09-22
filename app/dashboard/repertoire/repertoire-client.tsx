"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ---------- Типы ----------

type CurrentUser = { id: string; fullName: string };
type StudentOption = { id: string; full_name: string };
type Subject = { id: string; name: string };

type Status = "not_started" | "in_progress" | "ready";

const STATUS_LABELS: Record<Status, string> = {
  not_started: "Не начато",
  in_progress: "Разучивается",
  ready: "Готово",
};

const STATUS_STYLES: Record<Status, string> = {
  not_started: "bg-slate-100 text-slate-500",
  in_progress: "bg-amber-50 text-amber-700",
  ready: "bg-emerald-50 text-emerald-700",
};

type RepertoireItem = {
  id: string;
  student_id: string;
  subject_id: string | null;
  title: string;
  notes: string | null;
  status: Status;
  event_name: string | null;
  created_at: string;
  subject: { name: string } | null;
};

// ---------- Основной компонент ----------

export default function RepertoireClient({
  currentUser,
  students,
  subjects,
  initialStudentId,
}: {
  currentUser: CurrentUser;
  students: StudentOption[];
  subjects: Subject[];
  initialStudentId: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState<string | null>(initialStudentId);
  const [items, setItems] = useState<RepertoireItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const student = students.find((s) => s.id === studentId) ?? null;

  const filteredStudents = students.filter((s) =>
    s.full_name.toLowerCase().includes(search.trim().toLowerCase())
  );

  async function loadItems(id: string) {
    setLoading(true);
    const { data } = await supabase
      .from("student_repertoire")
      .select("id, student_id, subject_id, title, notes, status, event_name, created_at, subject:subject_id(name)")
      .eq("student_id", id)
      .order("created_at", { ascending: false });
    setItems((data as unknown as RepertoireItem[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (studentId) {
      loadItems(studentId);
    } else {
      setItems([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function updateStatus(item: RepertoireItem, status: Status) {
    await supabase.from("student_repertoire").update({ status }).eq("id", item.id);
    if (studentId) await loadItems(studentId);
  }

  async function deleteItem(item: RepertoireItem) {
    await supabase.from("student_repertoire").delete().eq("id", item.id);
    if (studentId) await loadItems(studentId);
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-800">Репертуар</h1>

      <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
        <div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск ученика…"
            className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <div className="max-h-[70vh] overflow-y-auto rounded-2xl bg-white shadow-md">
            {filteredStudents.length === 0 ? (
              <p className="p-3 text-xs text-slate-400">Ученики не найдены</p>
            ) : (
              filteredStudents.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStudentId(s.id)}
                  className={`block w-full border-b border-slate-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50 ${
                    s.id === studentId ? "bg-slate-100 font-medium text-slate-800" : "text-slate-600"
                  }`}
                >
                  {s.full_name}
                </button>
              ))
            )}
          </div>
        </div>

        <div>
          {!student ? (
            <p className="text-sm text-slate-400">Выберите ученика слева, чтобы увидеть его репертуар</p>
          ) : (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-800">{student.full_name}</h2>
                <button
                  onClick={() => setAddOpen((v) => !v)}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
                >
                  {addOpen ? "Отмена" : "+ Добавить произведение"}
                </button>
              </div>

              {addOpen && (
                <AddRepertoireForm
                  studentId={student.id}
                  subjects={subjects}
                  currentUser={currentUser}
                  supabase={supabase}
                  onAdded={async () => {
                    setAddOpen(false);
                    await loadItems(student.id);
                  }}
                />
              )}

              {loading ? (
                <p className="text-sm text-slate-400">Загрузка…</p>
              ) : items.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Пока ничего не добавлено — это необязательно, можно заполнять постепенно
                </p>
              ) : (
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item.id} className="rounded-lg bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{item.title}</p>
                          <p className="text-xs text-slate-400">
                            {item.subject?.name ?? "Без направления"}
                            {item.event_name && ` · ${item.event_name}`}
                          </p>
                          {item.notes && <p className="mt-1 text-xs text-slate-500">{item.notes}</p>}
                        </div>
                        <button
                          onClick={() => deleteItem(item)}
                          className="text-xs text-slate-300 hover:text-red-500"
                          title="Удалить"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => updateStatus(item, s)}
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              item.status === s ? STATUS_STYLES[s] : "bg-slate-50 text-slate-300 hover:text-slate-500"
                            }`}
                          >
                            {STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Форма добавления ----------

function AddRepertoireForm({
  studentId,
  subjects,
  currentUser,
  supabase,
  onAdded,
}: {
  studentId: string;
  subjects: Subject[];
  currentUser: CurrentUser;
  supabase: ReturnType<typeof createClient>;
  onAdded: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [eventName, setEventName] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Status>("not_started");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Укажите название произведения");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: insertError } = await supabase.from("student_repertoire").insert({
      student_id: studentId,
      subject_id: subjectId || null,
      title: title.trim(),
      event_name: eventName.trim() || null,
      notes: notes.trim() || null,
      status,
      created_by: currentUser.id,
    });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setTitle("");
    setSubjectId("");
    setEventName("");
    setNotes("");
    setStatus("not_started");
    await onAdded();
  }

  return (
    <form onSubmit={handleSubmit} className="mb-3 space-y-2 rounded-lg bg-slate-50 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Название произведения</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Направление (необязательно)</label>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Не указано</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Готовность</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Мероприятие/конкурс (необязательно)
        </label>
        <input
          type="text"
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          placeholder="Например: отчётный концерт, конкурс «Весенняя капель»"
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Заметки (необязательно)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
      >
        {submitting ? "Добавляем…" : "Добавить"}
      </button>
    </form>
  );
}
