// app/page.tsx
"use client";

/**
 * Главная: список страниц + вкладка календаря
 */

import { useEffect, useMemo, useState } from "react";
import PageActionsMenu from "@/components/PageActionsMenu";
import { useSearchParams, useRouter } from "next/navigation";
import CalendarView from "@/components/CalendarView"; // <-- default импорт

type PageDto = {
  _id: string;
  title?: string;
  parentId?: string | null;
};

type Node = {
  _id: string;
  title: string;
  children: Node[];
};

function buildTree(pages: PageDto[]): Node[] {
  const byId = new Map<string, Node>();
  const roots: Node[] = [];

  for (const p of pages) {
    byId.set(p._id, {
      _id: p._id,
      title: (p.title || "").trim() || "Новая страница",
      children: [],
    });
  }
  for (const p of pages) {
    const node = byId.get(p._id)!;
    const pid = p.parentId || null;
    if (pid && byId.has(pid)) {
      byId.get(pid)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export default function HomePage() {
  const [pages, setPages] = useState<PageDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((m) => ({ ...m, [id]: !m[id] }));

  const loadPages = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/pages");
      const data = await res.json();
      if (!res.ok) {
        setPages([]);
        setError(data?.error || "Ошибка загрузки страниц");
      } else {
        setPages(Array.isArray(data) ? data : []);
      }
    } catch {
      setPages([]);
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPages();
  }, []);

  const tree = useMemo(() => buildTree(pages), [pages]);

  const params = useSearchParams();
  const router = useRouter();
  const view = (params.get("view") || "list").toLowerCase();

  const setView = (v: "list" | "calendar") => {
    const qs = new URLSearchParams(params as any);
    qs.set("view", v);
    router.replace(`/?${qs.toString()}`);
  };

  function NodeView({ node, level }: { node: Node; level: number }) {
    const hasChildren = node.children.length > 0;
    const isOpen = open[node._id] ?? false;

    return (
      <li>
        <div
          className="flex items-center gap-2 py-1.5 rounded hover:bg-gray-50"
          style={{ paddingLeft: level * 16 }}
        >
          {hasChildren ? (
            <button
              className="text-gray-500 hover:text-gray-800 px-1"
              onClick={() => toggle(node._id)}
            >
              {isOpen ? "▾" : "▸"}
            </button>
          ) : (
            <span className="inline-block w-4" />
          )}

          <a
            className="flex-1 truncate px-1 text-[15px] hover:underline"
            href={`/documents/${node._id}`}
            title={node.title}
          >
            {node.title}
          </a>

          <PageActionsMenu pageId={node._id} />
        </div>

        {hasChildren && isOpen && (
          <ul className="space-y-1">
            {node.children.map((c) => (
              <NodeView key={c._id} node={c} level={level + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-4 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-5xl font-bold m-0">Страницы</h1>
          <p className="text-sm text-gray-500 mt-2">
            Создавайте страницы и подстраницы через левое меню.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            className={`px-3 py-1 rounded-xl border ${
              view === "list" ? "bg-muted" : ""
            }`}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            className={`px-3 py-1 rounded-xl border ${
              view === "calendar" ? "bg-muted" : ""
            }`}
            onClick={() => setView("calendar")}
          >
            Calendar
          </button>
        </div>
      </div>

      {view === "calendar" ? (
        <CalendarView />
      ) : (
        <>
          {loading && <div className="text-gray-500">Загрузка…</div>}
          {error && <div className="text-red-600">{error}</div>}

          {!loading && !error && tree.length === 0 && (
            <div className="text-gray-600">
              Пока нет страниц. Создайте первую через боковую панель.
            </div>
          )}

          {!loading && !error && tree.length > 0 && (
            <ul className="space-y-1">
              {tree.map((n) => (
                <NodeView key={n._id} node={n} level={0} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
