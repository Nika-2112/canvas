// /Project/canvas/components/TableView.tsx
"use client";
import { useEffect, useMemo, useState } from "react";

type Row = {
  _id: string;
  title?: string;
  parentId?: string | null;
  assignees?: any[];
  date?: { start?: string | null; end?: string | null };
  status?: string | null; // может быть русским лейблом; нормализуем ниже
};

function normalizeStatus(raw: any): string | null {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const map: Record<string, string> = {
    "не начато": "todo", "в работе": "doing", "готово": "done",
    "not started": "todo", "to do": "todo", "todo": "todo",
    "in progress": "doing", "doing": "doing",
    "done": "done", "completed": "done",
    "blocked": "blocked", "on hold": "blocked",
    "без статуса": "unspecified", "none": "unspecified", "unspecified": "unspecified",
  };
  if (map[s]) return map[s];
  const compact = s.replace(/\s+/g, "");
  return map[compact] || compact;
}
function humanStatus(id: string | null): string {
  if (!id) return "Без статуса";
  const map: Record<string, string> = {
    todo: "Не начато",
    doing: "В работе",
    done: "Готово",
    blocked: "Заблокировано",
    unspecified: "Без статуса",
  };
  return map[id] || id;
}
function statusPillClass(id: string | null): string {
  if (!id || id === "unspecified") return "bg-gray-100 text-gray-700";
  if (id === "todo") return "bg-yellow-100 text-yellow-800";
  if (id === "doing") return "bg-blue-100 text-blue-800";
  if (id === "done") return "bg-green-100 text-green-800";
  if (id === "blocked") return "bg-red-100 text-red-800";
  return "bg-purple-100 text-purple-800"; // прочие
}
function fmtDateISO(d?: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
}
function daysDiffInclusive(a?: string | null, b?: string | null): number | null {
  if (!a) return null;
  const A = new Date(a + "T00:00:00");
  const B = new Date((b || a) + "T00:00:00");
  const ms = B.getTime() - A.getTime();
  return Math.floor(ms / 86400000) + 1;
}

type SortKey = "title" | "status" | "start" | "end" | "assignees";
type SortDir = "asc" | "desc";

export default function TableView() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // фильтры
  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]); // normalized ids
  const [dateFrom, setDateFrom] = useState<string>("");   // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>("");       // YYYY-MM-DD

  // сортировка
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // загрузка
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const qs = new URLSearchParams();
      if (q) qs.set("q", q);
      statuses.forEach(s => qs.append("status", s));
      if (dateFrom) qs.set("from", new Date(dateFrom + "T00:00:00").toISOString());
      if (dateTo)   qs.set("to",   new Date(dateTo   + "T23:59:59").toISOString());
      const res = await fetch(`/api/table?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
      setLoading(false);
    };
    load();
  }, [q, statuses, dateFrom, dateTo]);

  // применяем сортировку на клиенте
  const sorted = useMemo(() => {
    const copy = rows.slice();
    copy.sort((a, b) => {
      const na = normalizeStatus(a.status);
      const nb = normalizeStatus(b.status);
      const ka =
        sortKey === "title" ? (a.title || "").toLowerCase() :
        sortKey === "status" ? (na || "") :
        sortKey === "assignees" ? (a.assignees?.length || 0) :
        sortKey === "start" ? (a.date?.start || "") :
        sortKey === "end" ? (a.date?.end || a.date?.start || "") : "";
      const kb =
        sortKey === "title" ? (b.title || "").toLowerCase() :
        sortKey === "status" ? (nb || "") :
        sortKey === "assignees" ? (b.assignees?.length || 0) :
        sortKey === "start" ? (b.date?.start || "") :
        sortKey === "end" ? (b.date?.end || b.date?.start || "") : "";
      if (ka < kb) return sortDir === "asc" ? -1 : 1;
      if (ka > kb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const allStatusOptions = [
    { id: "todo",   label: "Не начато" },
    { id: "doing",  label: "В работе" },
    { id: "done",   label: "Готово" },
    { id: "blocked",label: "Заблокировано" },
    { id: "unspecified", label: "Без статуса" },
  ];

  return (
    <div className="w-full">
      {/* Панель фильтров */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">Поиск по названию</label>
          <input
            value={q}
            onChange={e => setQ(e.currentTarget.value)}
            placeholder="Введите название…"
            className="border rounded-md px-3 py-2 text-sm w-[260px]"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">Статусы</label>
          <div className="flex flex-wrap gap-2">
            {allStatusOptions.map(opt => {
              const on = statuses.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => setStatuses(s => on ? s.filter(x => x !== opt.id) : [...s, opt.id])}
                  className={`px-3 py-1 rounded-2xl border text-sm ${on ? "bg-gray-900 text-white" : "bg-white"}`}
                >
                  {opt.label}
                </button>
              );
            })}
            {statuses.length > 0 && (
              <button className="text-sm underline ml-1" onClick={() => setStatuses([])}>сбросить</button>
            )}
          </div>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">С даты</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.currentTarget.value)} className="border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">По дату</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.currentTarget.value)} className="border rounded-md px-3 py-2 text-sm" />
          </div>
          {(dateFrom || dateTo) && (
            <button className="text-sm underline" onClick={() => { setDateFrom(""); setDateTo(""); }}>сбросить</button>
          )}
        </div>
      </div>

      {/* Таблица */}
      <div className="overflow-auto border rounded-xl">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <Th onClick={() => toggleSort("title")}     active={sortKey==="title"}     dir={sortDir}>Название</Th>
              <Th onClick={() => toggleSort("status")}    active={sortKey==="status"}    dir={sortDir}>Статус</Th>
              <Th onClick={() => toggleSort("start")}     active={sortKey==="start"}     dir={sortDir}>Начало</Th>
              <Th onClick={() => toggleSort("end")}       active={sortKey==="end"}       dir={sortDir}>Окончание</Th>
              <Th onClick={() => toggleSort("assignees")} active={sortKey==="assignees"} dir={sortDir}>Исполнители</Th>
              <th className="px-3 py-2 text-left w-10"> </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const stId = normalizeStatus(r.status);
              const duration = daysDiffInclusive(r?.date?.start || null, r?.date?.end || null);
              const isTodayBar =
                !!r?.date?.start &&
                new Date().toDateString() >= new Date((r.date?.start || "").replace(/-/g, "/")).toDateString() &&
                new Date().toDateString() <= new Date(((r.date?.end || r.date?.start) || "").replace(/-/g, "/")).toDateString();

              return (
                <tr key={r._id} className={`border-t ${isTodayBar ? "bg-blue-50/40" : ""}`}>
                  <td className="px-3 py-2">
                    <a className="font-medium hover:underline" href={`/documents/${r._id}`}>{r.title || "Без названия"}</a>
                    <div className="text-xs text-gray-500">
                      {duration ? `Длительность: ${duration} дн.` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded ${statusPillClass(stId)}`}>
                      {humanStatus(stId)}
                    </span>
                  </td>
                  <td className="px-3 py-2">{fmtDateISO(r?.date?.start)}</td>
                  <td className="px-3 py-2">{fmtDateISO(r?.date?.end || r?.date?.start)}</td>
                  <td className="px-3 py-2">{r.assignees?.length ? r.assignees.length : 0}</td>
                  <td className="px-3 py-2 text-right">
                    <a className="text-gray-500 hover:underline" href={`/documents/${r._id}`}>Открыть</a>
                  </td>
                </tr>
              );
            })}

            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">Ничего не найдено</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && <div className="mt-3 text-sm text-gray-500">Загрузка…</div>}
    </div>
  );
}

function Th({
  children, onClick, active, dir,
}: { children: any; onClick: () => void; active?: boolean; dir?: "asc"|"desc" }) {
  return (
    <th className="px-3 py-2 text-left">
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:underline">
        {children}
        {active ? <span className="text-xs">{dir === "asc" ? "▲" : "▼"}</span> : null}
      </button>
    </th>
  );
}
