// /Project/canvas/components/CalendarView.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { monthRange, addMonths } from "@/lib/date-range";

type CalendarEvent = {
  _id: string;
  title: string;
  parentId?: string | null;
  date: { start: string; end?: string | null; allDay?: boolean };
  status?: string;
  tags?: string[];
};

export default function CalendarView() {
  const [anchor, setAnchor] = useState(() => new Date());
  const { start, end } = useMemo(() => monthRange(anchor), [anchor]);
  const [items, setItems] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

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

  const days = useMemo(() => {
    const firstDay = new Date(start);
    const lastDay = new Date(end);
    const grid: Date[] = [];
    const cursor = new Date(firstDay);
    const shift = (cursor.getDay() + 6) % 7;
    cursor.setDate(cursor.getDate() - shift);
    while (cursor <= lastDay || grid.length % 7 !== 0) {
      grid.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
      if (grid.length > 42) break;
    }
    return grid;
  }, [start, end]);

  const mapByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const it of items) {
      const s = new Date(it.date.start);
      const key = new Date(s.getFullYear(), s.getMonth(), s.getDate()).toISOString().slice(0, 10);
      const arr = map.get(key) || [];
      arr.push(it);
      map.set(key, arr);
    }
    return map;
  }, [items]);

  return (
    <div className="w-full">
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

      <div className="grid grid-cols-7 text-sm font-medium text-muted-foreground mb-2">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
          <div key={d} className="px-2">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((d, i) => {
          const isOtherMonth = d.getMonth() !== anchor.getMonth();
          const key = d.toISOString().slice(0, 10);
          const events = mapByDay.get(key) || [];
          return (
            <div key={i} className={`border rounded-xl p-2 min-h-[110px] ${isOtherMonth ? "opacity-40" : ""}`}>
              <div className="text-xs mb-1 font-medium">{d.getDate()}</div>
              <div className="flex flex-col gap-1">
                {events.slice(0, 3).map((ev) => (
                  <a
                    key={ev._id}
                    href={`/documents/${ev._id}`}
                    className="text-xs px-2 py-1 rounded-lg border hover:bg-muted truncate"
                    title={ev.title}
                  >
                    {ev.title || "Без названия"}
                  </a>
                ))}
                {events.length > 3 && (
                  <div className="text-xs text-muted-foreground">ещё {events.length - 3}…</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {loading && <div className="mt-4 text-sm text-muted-foreground">Загрузка…</div>}
      {!loading && <div className="mt-3 text-xs text-gray-500">debug: получено событий: {items.length}</div>}
    </div>
  );
}