// /Project/canvas/components/ListView.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import PageActionsMenu from "@/components/PageActionsMenu";

// ---- types ----
type PageDoc = {
  _id: string;
  title?: string;
  parentId?: string | null;
  properties?: Array<{
    id: string;
    name: string;
    type: "text" | "status" | "date";
    value: any;
  }>;
};

type Node = {
  _id: string;
  title: string;
  parentId: string | null;
  children: Node[];
  status?: string | null;
  date?: { start?: string | null; end?: string | null } | null;
};

// ---- helpers: parse properties ----
function extractStatus(doc: PageDoc): string | null {
  const p = (doc.properties || []).find((x) => x.type === "status");
  if (!p) return null;
  const v = p.value;
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") return v.id ?? v.label ?? v.value ?? null;
  return null;
}
function extractDate(doc: PageDoc): { start?: string | null; end?: string | null } | null {
  const p = (doc.properties || []).find((x) => x.type === "date");
  if (!p) return null;
  const v = p.value || {};
  const start = typeof v.start === "string" ? v.start : null;
  const end = typeof v.end === "string" ? v.end : null;
  if (!start && !end) return null;
  return { start, end };
}

// ---- helpers: status view ----
function normalizeStatusId(s?: string | null): "todo" | "doing" | "done" | "blocked" | undefined {
  if (!s) return undefined;
  const raw = s.trim().toLowerCase();
  if (raw === "todo" || raw === "doing" || raw === "done" || raw === "blocked") return raw;
  const map: Record<string, "todo" | "doing" | "done" | "blocked"> = {
    "не начато": "todo",
    "в работе": "doing",
    "готово": "done",
    "заблокировано": "blocked",
  };
  return map[raw];
}
function humanStatusLabel(s?: string | null): string | undefined {
  if (!s) return undefined;
  const id = normalizeStatusId(s);
  if (id === "todo") return "Не начато";
  if (id === "doing") return "В работе";
  if (id === "done") return "Готово";
  if (id === "blocked") return "Заблокировано";
  return s;
}
function statusPillClass(s?: string | null) {
  const id = normalizeStatusId(s);
  if (id === "done") return "bg-green-100 text-green-700";
  if (id === "doing") return "bg-blue-100 text-blue-700";
  if (id === "blocked") return "bg-red-100 text-red-700";
  if (id === "todo") return "bg-yellow-100 text-yellow-700";
  return "bg-gray-100 text-gray-700";
}
function fmtRange(d?: { start?: string | null; end?: string | null }) {
  if (!d || !d.start) return "";
  const fmt = (x: string) =>
    new Date(x + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
  return d.end ? `${fmt(d.start)} — ${fmt(d.end)}` : fmt(d.start);
}

// ---- helpers: build tree ----
function buildTree(pages: PageDoc[]): Node[] {
  const byId = new Map<string, Node>();
  const roots: Node[] = [];

  for (const p of pages) {
    byId.set(p._id, {
      _id: p._id,
      title: (p.title || "").trim() || "Новая страница",
      parentId: (p.parentId as any) || null,
      children: [],
      status: extractStatus(p),
      date: extractDate(p),
    });
  }
  for (const p of pages) {
    const node = byId.get(p._id)!;
    const pid = (p.parentId as any) || null;
    if (pid && byId.has(pid)) byId.get(pid)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

// ---- robust JSON normalization ----
function asArray(x: any): PageDoc[] {
  if (Array.isArray(x)) return x as PageDoc[];
  if (x && typeof x === "object") {
    for (const k of ["items", "data", "results", "pages", "docs"]) {
      if (Array.isArray((x as any)[k])) return (x as any)[k] as PageDoc[];
    }
  }
  return [];
}

export default function ListView() {
  const [rows, setRows] = useState<PageDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  // UI
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const toggle = (id: string) => setOpen((m) => ({ ...m, [id]: !m[id] }));

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");

      // попытка 1: видимые (включая общие)
      const tryFetch = async (url: string) => {
        try {
          const r = await fetch(url, { cache: "no-store" });
          const data = await r.json().catch(() => null);
          return { ok: r.ok, list: asArray(data) };
        } catch {
          return { ok: false, list: [] as PageDoc[] };
        }
      };

      let list: PageDoc[] = [];
      let ok = false;

      // 1) /api/pages/visible
      let r1 = await tryFetch("/api/pages/visible");
      if (r1.ok && r1.list.length) {
        list = r1.list;
        ok = true;
      } else {
        // 2) /api/pages
        const r2 = await tryFetch("/api/pages");
        if (r2.ok && r2.list.length) {
          list = r2.list;
          ok = true;
        } else {
          // 3) /api/pages?all=1 (вдруг пагинация/фильтр)
          const r3 = await tryFetch("/api/pages?all=1");
          if (r3.ok && r3.list.length) {
            list = r3.list;
            ok = true;
          }
        }
      }

      if (!alive) return;

      if (!ok) {
        // если ни один не вернул нормальный массив — покажем пусто, но без краша
        setRows([]);
        setError("Ошибка загрузки страниц");
      } else {
        setRows(list);
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // фильтры
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const st = statusFilter.trim().toLowerCase();
    return rows.filter((p) => {
      const t = (p.title || "Новая страница").toLowerCase();
      const s = (extractStatus(p) || "").toLowerCase();
      const passTitle = term ? t.includes(term) : true;
      const passStatus = st ? s.includes(st) || normalizeStatusId(s) === normalizeStatusId(st) : true;
      return passTitle && passStatus;
    });
  }, [rows, q, statusFilter]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  function Row({ node, level }: { node: Node; level: number }) {
    const hasChildren = node.children.length > 0;
    const isOpen = open[node._id] ?? false;
    const label = humanStatusLabel(node.status);

    return (
      <li>
        <div
          className="grid grid-cols-[28px_minmax(0,1fr)_220px_240px_28px] items-start gap-2 py-1.5 px-1 rounded hover:bg-gray-50"
          style={{ paddingLeft: level * 14 }}
        >
          {/* toggle */}
          <div className="h-6 flex items-center">
            {hasChildren ? (
              <button
                className="text-gray-500 hover:text-gray-800 px-1"
                onClick={() => toggle(node._id)}
                aria-label={isOpen ? "Свернуть" : "Развернуть"}
                title={isOpen ? "Свернуть" : "Развернуть"}
              >
                {isOpen ? "▾" : "▸"}
              </button>
            ) : (
              <span className="inline-block w-4" />
            )}
          </div>

          {/* title */}
          <a className="truncate text-[15px] hover:underline" href={`/documents/${node._id}`} title={node.title}>
            {node.title}
          </a>

          {/* status */}
          <div className="h-6">
            {label ? (
              <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded ${statusPillClass(node.status)}`}>
                {label}
              </span>
            ) : (
              <span className="text-xs text-gray-400">—</span>
            )}
          </div>

          {/* date */}
          <div className="text-xs text-gray-700">
            {node.date ? fmtRange(node.date) || <span className="text-gray-400">—</span> : <span className="text-gray-400">—</span>}
          </div>

          {/* actions */}
          <div className="h-6 flex items-center justify-end">
            <PageActionsMenu pageId={node._id} />
          </div>
        </div>

        {hasChildren && isOpen && (
          <ul className="space-y-1">
            {node.children.map((c) => (
              <Row key={c._id} node={c} level={level + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="max-w-5xl">
      {/* filters */}
      <div className="mb-3 flex flex-wrap gap-2 items-end">
        <div>
          <div className="text-xs text-gray-500 mb-1">Название</div>
          <input
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            placeholder="Поиск по названию…"
            className="border rounded-lg px-3 py-1.5 text-sm w-64"
          />
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">Статус</div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.currentTarget.value)}
            className="border rounded-lg px-3 py-1.5 text-sm w-48"
          >
            <option value="">Все</option>
            <option value="todo">Не начато</option>
            <option value="doing">В работе</option>
            <option value="done">Готово</option>
            <option value="blocked">Заблокировано</option>
          </select>
        </div>
      </div>

      {/* states */}
      {loading && <div className="text-gray-500">Загрузка…</div>}
      {error && <div className="text-red-600">{error}</div>}

      {/* list */}
      {!loading && !error && (
        <>
          {tree.length === 0 ? (
            <div className="text-gray-600">Ничего не найдено. Измени фильтры или создай страницу.</div>
          ) : (
            <ul className="space-y-1">
              {/* header */}
              <li className="grid grid-cols-[28px_minmax(0,1fr)_220px_240px_28px] gap-2 px-1 py-2 text-xs text-gray-500">
                <div />
                <div>Название</div>
                <div>Статус</div>
                <div>Дата</div>
                <div />
              </li>

              {tree.map((n) => (
                <Row key={n._id} node={n} level={0} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
