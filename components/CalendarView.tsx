// /Project/canvas/components/CalendarView.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { monthRange, addMonths } from "@/lib/date-range";

// === Types ===
type CalendarEvent = {
  _id: string;
  title: string;
  parentId?: string | null;
  date: { start: string; end?: string | null; allDay?: boolean };
  status?: string; // у тебя это ЛЕЙБЛ ("Не начато" | "В работе" | "Готово") — нормализуем ниже
  tags?: string[];
  [k: string]: any;
};

// === Статус → нормализация и цвета ===
// приводим лейблы/варианты к компактным id
function normalizeStatus(raw: any): string | null {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase();

  // уберём лишние подчёркивания/мультипробелы
  s = s.replace(/_/g, " ").replace(/\s+/g, " ").trim();

  // типовые соответствия (рус/англ)
  const map: Record<string, string> = {
    // русские лейблы из твоего PageProperties
    "не начато": "todo",
    "в работе": "doing",
    "готово": "done",

    // английские возможные
    "not started": "todo",
    "to do": "todo",
    "todo": "todo",

    "in progress": "doing",
    "doing": "doing",
    "progress": "doing",

    "done": "done",
    "completed": "done",

    "blocked": "blocked",
    "on hold": "blocked",
    "hold": "blocked",

    "без статуса": "unspecified",
    "none": "unspecified",
    "unspecified": "unspecified",
  };

  // прямое попадание
  if (map[s]) return map[s];

  // слитно без пробелов — на всякий случай
  const compact = s.replace(/\s+/g, "");
  if (map[compact]) return map[compact];

  // вернём компакт как id (например, "review", "qa")
  return compact;
}

// фиксированные цвета для известных id
const STATUS_COLOR: Record<string, string> = {
  todo: "bg-yellow-200 border-yellow-400",
  doing: "bg-blue-200 border-blue-400",
  done: "bg-green-200 border-green-400",
  blocked: "bg-red-200 border-red-400",

  // можно расширять:
  review: "bg-purple-200 border-purple-400",
  qa: "bg-pink-200 border-pink-400",

  unspecified: "bg-muted/60 border-muted",
};

// fallback палитра (для любых нестандартных статусов)
const FALLBACK_PALETTE = [
  "bg-indigo-200 border-indigo-400",
  "bg-emerald-200 border-emerald-400",
  "bg-sky-200 border-sky-400",
  "bg-amber-200 border-amber-400",
  "bg-fuchsia-200 border-fuchsia-400",
  "bg-cyan-200 border-cyan-400",
];
function hashStr(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function colorByStatus(rawStatus: any): string {
  const id = normalizeStatus(rawStatus);
  if (!id) return STATUS_COLOR["unspecified"];
  if (STATUS_COLOR[id]) return STATUS_COLOR[id];
  const idx = hashStr(id) % FALLBACK_PALETTE.length;
  return FALLBACK_PALETTE[idx];
}

// === Date helpers (LOCAL timezone, no UTC drift) ===
function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function weekdayIndexMon0(d: Date) {
  // Monday=0 .. Sunday=6
  return (d.getDay() + 6) % 7;
}

export default function CalendarView() {
  const [anchor, setAnchor] = useState(() => new Date());
  const { start, end } = useMemo(() => monthRange(anchor), [anchor]);
  const [items, setItems] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  // === Load events ===
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const qs = new URLSearchParams({
        from: start.toISOString(),
        to: end.toISOString(),
        rootOnly: "0",
      });
      const res = await fetch(`/api/calendar?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
      setLoading(false);
    };
    load();
  }, [start, end]);

  // === Build a 6-week (max) grid starting Monday ===
  const days = useMemo(() => {
    const firstDay = startOfDayLocal(start);
    const lastDay = startOfDayLocal(end);
    const grid: Date[] = [];
    const cursor = new Date(firstDay);
    const shift = weekdayIndexMon0(cursor); // 0..6
    cursor.setDate(cursor.getDate() - shift);
    while (cursor <= lastDay || grid.length % 7 !== 0) {
      grid.push(startOfDayLocal(cursor));
      cursor.setDate(cursor.getDate() + 1);
      if (grid.length > 42) break;
    }
    return grid;
  }, [start, end]);

  // Split into weeks
  const weeks = useMemo(() => {
    const arr: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) arr.push(days.slice(i, i + 7));
    return arr; // up to 6 weeks
  }, [days]);

  // Today (LOCAL)
  const todayKey = useMemo(() => ymdLocal(new Date()), []);

  // Continuous bars per week
  type WeekBar = {
    startCol: number; // 1..7
    spanCols: number; // 1..7
    event: CalendarEvent;
  };

  const barsPerWeek: WeekBar[][] = useMemo(() => {
    const res: WeekBar[][] = weeks.map(() => []);
    if (!items.length) return res;

    // видимые границы месяца
    const viewStart = startOfDayLocal(new Date(start.getFullYear(), start.getMonth(), 1));
    const viewEnd = startOfDayLocal(new Date(end.getFullYear(), end.getMonth(), end.getDate()));

    for (const ev of items) {
      const rawS = new Date(ev?.date?.start);
      const rawE = ev?.date?.end ? new Date(ev.date.end) : new Date(ev?.date?.start);
      if (isNaN(rawS.getTime())) continue;
      if (isNaN(rawE.getTime())) rawE.setTime(rawS.getTime());

      const S0 = startOfDayLocal(rawS);
      const E0 = startOfDayLocal(rawE);
      if (E0 < S0) E0.setTime(S0.getTime()); // safety

      // обрежем по текущему виду (месяц)
      const S = S0 < viewStart ? viewStart : S0;
      const E = E0 > viewEnd ? viewEnd : E0;
      if (E < viewStart || S > viewEnd) continue; // не видно вовсе

      // для каждой недели — один непрерывный бар
      weeks.forEach((weekDays, wIdx) => {
        const weekStart = weekDays[0];
        const weekEnd = weekDays[6];
        if (E < weekStart || S > weekEnd) return; // нет пересечения

        const partStart = S < weekStart ? weekStart : S;
        const partEnd = E > weekEnd ? weekEnd : E;

        const startDow = weekdayIndexMon0(partStart); // 0..6
        const endDow = weekdayIndexMon0(partEnd);
        const spanCols = endDow - startDow + 1; // 1..7

        res[wIdx].push({ startCol: startDow + 1, spanCols, event: ev });
      });
    }

    return res;
  }, [items, weeks, start, end]);

  // === Render ===
  return (
    <div className="w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-xl font-semibold">
          {anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1 rounded-xl border" onClick={() => setAnchor(addMonths(anchor, -1))}>«</button>
          <button className="px-3 py-1 rounded-xl border" onClick={() => setAnchor(new Date())}>Сегодня</button>
          <button className="px-3 py-1 rounded-xl border" onClick={() => setAnchor(addMonths(anchor, 1))}>»</button>
        </div>
      </div>

      {/* Week header */}
      <div className="grid grid-cols-7 text-sm font-medium text-muted-foreground mb-2">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
          <div key={d} className="px-2">{d}</div>
        ))}
      </div>

      {/* Month grid: render week rows */}
      <div className="flex flex-col gap-2">
        {weeks.map((weekDays, wIdx) => (
          <div key={wIdx} className="relative">
            {/* 7 ячеек недели */}
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((d, i) => {
                const isOtherMonth = d.getMonth() !== anchor.getMonth();
                const isToday = ymdLocal(d) === todayKey;
                return (
                  <div
                    key={i}
                    className={`relative border rounded-xl  p-2 min-h-[120px] ${isOtherMonth ? "opacity-40" : ""} ${isToday ? "bg-[#e2c5c1] border-[#e2c5c1]  ring-0" : ""}`}
                  >
                    <div className="text-xs mb-1 font-medium">{d.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {/* Bars layer for this week */}
            <div className="pointer-events-none absolute left-0 right-0 top-6">
              <div className="grid grid-cols-7 gap-2">
                {(barsPerWeek[wIdx] || []).map((bar, idx) => {
                  const color = colorByStatus(bar.event.status);
                  const label = bar.event.title || "Без названия";
                  const statusId = normalizeStatus(bar.event.status);
                  return (
                    <div key={idx} className="relative col-span-7 h-6">
                      <a
                        href={`/documents/${bar.event._id}`}
                        title={buildTooltip(bar.event)}
                        className={`pointer-events-auto absolute h-6 border rounded-md px-2 text-xs flex items-center truncate ${color}`}
                        style={{
                          // gap-2 ~ 0.5rem — учтём в расчетах
                          left: `calc(((100% + 0.5rem) / 7) * ${bar.startCol - 1})`,
                          width: `calc(((100% + 0.5rem) / 7) * ${bar.spanCols} - 0.5rem)`,
                        }}
                      >
                        <span className="font-medium truncate">{label}</span>
                        {statusId && statusId !== "unspecified" ? (
                          <span className="opacity-80 ml-2">— {humanStatus(statusId)}</span>
                        ) : null}
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {loading && <div className="mt-4 text-sm text-muted-foreground">Загрузка…</div>}
    </div>
  );
}

// === Tooltip & status helpers ===
function buildTooltip(ev: any) {
  const s = startOfDayLocal(new Date(ev?.date?.start));
  const e = ev?.date?.end ? startOfDayLocal(new Date(ev.date.end)) : s;
  const range = s.getTime() === e.getTime()
    ? s.toLocaleDateString()
    : `${s.toLocaleDateString()} — ${e.toLocaleDateString()}`;
  const st = normalizeStatus(ev?.status);
  const status = st && st !== "unspecified" ? `\nСтатус: ${humanStatus(st)}` : "";
  const tags = Array.isArray(ev?.tags) && ev.tags.length ? `\nТеги: ${ev.tags.join(", ")}` : "";
  return `${ev.title || "Без названия"}\n${range}${status}${tags}`;
}

function humanStatus(id: string) {
  const map: Record<string, string> = {
    todo: "Не начато",
    doing: "В работе",
    done: "Готово",
    blocked: "Заблокировано",
    unspecified: "Без статуса",
  };
  return map[id] || id;
}
