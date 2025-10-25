"use client";

import { useEffect, useMemo, useState } from "react";

type ArchItem = { _id: string; title: string; parentId: string | null };

type Node = { _id: string; title: string; children: Node[] };

function buildTree(items: ArchItem[]): Node[] {
  const byId = new Map<string, Node>();
  const roots: Node[] = [];
  for (const p of items) {
    byId.set(p._id, { _id: p._id, title: p.title || "Без названия", children: [] });
  }
  for (const p of items) {
    const n = byId.get(p._id)!;
    if (p.parentId && byId.has(p.parentId)) {
      byId.get(p.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  return roots;
}

export default function ArchivePage() {
  const [items, setItems] = useState<ArchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({}); // раскрытые тогглы

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/archive");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Ошибка загрузки архива");
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((i) => (i.title || "").toLowerCase().includes(t));
  }, [items, q]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  const toggle = (id: string) => setOpen((m) => ({ ...m, [id]: !m[id] }));

  async function unarchive(id: string) {
    const res = await fetch(`/api/pages/${id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false, cascade: true }),
    });
    if (res.ok) load();
    else alert((await res.json()).error || "Не удалось разархивировать");
  }

  function NodeView({ node, level }: { node: Node; level: number }) {
    const hasChildren = node.children.length > 0;
    const isOpen = open[node._id] ?? false;

    return (
      <li>
        <div
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 rounded"
          style={{ paddingLeft: level * 16 }}
        >
          {hasChildren ? (
            <button
              className="text-gray-500 hover:text-gray-800"
              onClick={() => toggle(node._id)}
              aria-label={isOpen ? "Свернуть" : "Развернуть"}
              title={isOpen ? "Свернуть" : "Развернуть"}
            >
              {isOpen ? "▾" : "▸"}
            </button>
          ) : (
            <span className="inline-block w-4" />
          )}

          <span className="flex-1 truncate">{node.title}</span>

          <button
            className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
            onClick={() => unarchive(node._id)}
            title="Вернуть из архива (ветка)"
          >
            ⮌
          </button>
          <a
            className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
            href={`/documents/${node._id}`}
            title="Открыть"
          >
            Открыть
          </a>
        </div>

        {hasChildren && isOpen && (
          <ul className="mt-1 space-y-1">
            {node.children.map((c) => (
              <NodeView key={c._id} node={c} level={level + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-3 flex items-center gap-2">
        <h1 className="text-2xl font-bold">Архив</h1>
        <div className="ml-auto w-1/2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск в архиве…"
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
        </div>
      </div>

      {loading && <div>Загрузка…</div>}
      {error && <div className="text-red-600">{error}</div>}
      {!loading && !error && tree.length === 0 && <div>Архив пуст</div>}

      {tree.length > 0 && (
        <ul className="space-y-1">
          {tree.map((n) => (
            <NodeView key={n._id} node={n} level={0} />
          ))}
        </ul>
      )}
    </div>
  );
}
