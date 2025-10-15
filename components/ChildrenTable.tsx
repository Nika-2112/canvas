"use client";

/**
 * Табличное представление прямых подстраниц:
 *  Название | Теги | Создано | [+ Строка]
 *
 * Обоснование (для диплома):
 *  - Табличный вид наглядно показывает подстраницы как «записи» (аналог Notion DB).
 *  - Теги редактируются инлайн, без перехода на отдельные формы.
 */
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import TagsPicker from "@/components/TagsPicker"; 

type Child = { _id: string; title?: string; tags?: string[]; createdAt?: string };

export default function ChildrenTable({ parentId }: { parentId: string }) {
  const [rows, setRows] = useState<Child[]>([]);
  const [pending, startTransition] = useTransition();

  async function load() {
    const r = await fetch(`/api/pages/${parentId}/children`);
    setRows(await r.json());
  }

  useEffect(() => { load(); }, [parentId]);

  async function addRow() {
    const r = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Новая страница", parentId }),
    });
    if (r.ok) load();
  }

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Подстраницы</h3>
        <button
          onClick={() => startTransition(addRow)}
          disabled={pending}
          className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
        >
          + Строка
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-neutral-500">
              <th className="py-2 pr-3">Название</th>
              <th className="py-2 pr-3">Теги</th>
              <th className="py-2 pr-3">Создано</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p._id} className="border-b last:border-b-0">
                <td className="py-2 pr-3">
                  <Link href={`/documents/${p._id}`} className="hover:underline">
                    {p.title || "Без названия"}
                  </Link>
                </td>
                <td className="py-2 pr-3">
                  <TagsPicker pageId={p._id} value={p.tags || []} onChange={load} />
                </td>
                <td className="py-2 pr-3 text-neutral-500">
                  {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
