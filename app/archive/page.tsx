"use client";

/**
 * Экран «Архив».
 * - список архивных страниц
 * - действия: Восстановить (переместить в актуальные), Открыть
 */

import { useEffect, useState } from "react";

type Item = {
  _id: string;
  title: string;
  updatedAt?: string;
};

export default function ArchivePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/archive");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Ошибка загрузки архива");
      setItems(data);
    } catch (e: any) {
      setError(e.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const restore = async (id: string) => {
    const res = await fetch(`/api/pages/${id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    if (res.ok) load();
    else alert((await res.json()).error || "Не удалось восстановить");
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Архив</h1>
      {loading && <div>Загрузка…</div>}
      {error && <div className="text-red-600">{error}</div>}
      {!loading && !error && items.length === 0 && <div>Архив пуст</div>}

      <ul className="divide-y">
        {items.map((i) => (
          <li key={i._id} className="flex items-center justify-between py-2">
            <a href={`/documents/${i._id}`} className="font-medium hover:underline truncate">
              {i.title || "Без названия"}
            </a>
            <div className="flex items-center gap-2">
              <button
                className="px-2 py-1 text-sm border rounded hover:bg-gray-50"
                onClick={() => restore(i._id)}
              >
                Восстановить
              </button>
              <a
                className="px-2 py-1 text-sm border rounded hover:bg-gray-50"
                href={`/documents/${i._id}`}
              >
                Открыть
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
