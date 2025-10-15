"use client";

/**
 * Экран «Корзина» в стиле Notion:
 *  - центрированная панель поверх белого фона (как окно),
 *  - строка поиска (клиентская фильтрация),
 *  - список удалённых страниц с иконками действий справа:
 *      ↩ — восстановить
 *      🗑 — удалить навсегда
 *  - подпись под названием: хлебные крошки (путь родителя), если доступны
 *  - показ, сколько дней осталось до автосна (daysLeft)
 *
 * Данные берём из /api/trash. Это НЕ страница API.
 */

import { useEffect, useMemo, useState } from "react";

type TrashItem = {
  _id: string;
  title: string;
  deletedAt: string;
  daysLeft: number;
  parentId?: string | null; // может отсутствовать в payload -> находим отдельно
};

type PageLite = {
  _id: string;
  title?: string;
  parentId?: string | null;
};

export default function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [retention, setRetention] = useState<number>(7);
  const [q, setQ] = useState("");

  // простейший кэш для хлебных крошек
  const [titleCache, setTitleCache] = useState<Record<string, string>>({}); // id -> title
  const [parentCache, setParentCache] = useState<Record<string, string | null>>({}); // id -> parentId

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/trash");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Ошибка загрузки корзины");

      const list: TrashItem[] = (data.items ?? []).map((i: any) => ({
        _id: String(i._id),
        title: i.title || "Без названия",
        deletedAt: i.deletedAt,
        daysLeft: Number(i.daysLeft ?? 7),
        parentId: i.parentId ?? null, // может не прийти — дособираем
      }));

      setItems(list);
      setRetention(Number(data.retentionDays ?? 7));

      // подгрузим заголовки для крошек лениво (для первых 30)
      const first = list.slice(0, 30);
      first.forEach((it) => ensureBreadcrumbs(it._id)); // без await — фоном
    } catch (e: any) {
      setError(e.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // получить лёгкие данные по странице (название/родитель) — даже если страница в корзине, GET /api/pages/:id вернёт
  async function fetchPageLite(id: string): Promise<PageLite | null> {
    try {
      const r = await fetch(`/api/pages/${id}`);
      const p = await r.json();
      if (!r.ok) return null;
      return {
        _id: String(p._id),
        title: p.title || "Без названия",
        parentId: p.parentId ? String(p.parentId) : null,
      };
    } catch {
      return null;
    }
  }

  // построить крошки «Родитель / Родитель2 ...»
  async function ensureBreadcrumbs(id: string) {
    if (titleCache[id]) return; // уже есть
    // пройдёмся вверх по родителям
    const chain: string[] = [];
    let cur: string | null = id;

    // ограничим длину пути 10 шагами, чтобы не зациклиться
    for (let i = 0; i < 10 && cur; i++) {
      const pl = await fetchPageLite(cur);
      if (!pl) break;
      // кэшируем текущий
      setTitleCache((prev) => ({ ...prev, [pl._id]: pl.title || "Без названия" }));
      setParentCache((prev) => ({ ...prev, [pl._id]: pl.parentId ?? null }));

      cur = pl.parentId ?? null;
      if (cur) chain.push(pl._id);
    }
  }

  // текст крошек для айтема
  function breadcrumbsText(itemId: string): string {
    // идём вверх от parentId текущего, собирая названия
    const ids: string[] = [];
    let pid = parentCache[itemId] ?? null;

    // если для конкретного item parentId ещё не в кэше, попробуем взять из items (сервер мог прислать)
    if (pid == null) {
      const it = items.find((x) => x._id === itemId);
      pid = (it?.parentId as any) ?? null;
    }

    let depth = 0;
    while (pid && depth < 10) {
      ids.push(pid);
      pid = parentCache[pid] ?? null;
      depth++;
    }

    // превращаем в названия
    const names = ids
      .map((id) => titleCache[id])
      .filter(Boolean)
      .reverse(); // от корня к элементу
    return names.join(" / ");
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((i) => (i.title || "").toLowerCase().includes(term));
  }, [items, q]);

  const restore = async (id: string) => {
    const res = await fetch(`/api/pages/${id}/restore`, { method: "POST" });
    if (res.ok) load();
    else alert((await res.json()).error || "Не удалось восстановить");
  };

  const removeForever = async (id: string) => {
    if (!confirm("Удалить навсегда? Действие необратимо.")) return;
    const res = await fetch(`/api/pages/${id}?force=1`, { method: "DELETE" });
    if (res.ok) load();
    else alert((await res.json()).error || "Не удалось удалить навсегда");
  };

  return (
    <div className="min-h-screen bg-white p-6">
      {/* центрированная панель — как «окно» */}
      <div className="mx-auto w-full max-w-3xl rounded-2xl border bg-white shadow-xl">
        {/* хедер */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <div className="text-lg font-semibold">Корзина</div>
          <div className="ml-auto text-xs text-gray-500">
            Храним {retention} дней
          </div>
        </div>

        {/* поиск */}
        <div className="px-4 py-3 border-b">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages in Trash…"
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
        </div>

        {/* список */}
        <div className="max-h-[65vh] overflow-y-auto">
          {loading && <div className="px-4 py-3 text-gray-500">Загрузка…</div>}
          {error && <div className="px-4 py-3 text-red-600">{error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="px-4 py-3 text-gray-500">Корзина пуста</div>
          )}

          <ul className="divide-y">
            {filtered.map((i) => (
              <li key={i._id} className="flex items-center gap-3 px-4 py-2">
                {/* иконка страницы */}
                <div aria-hidden className="text-xl leading-none">📄</div>

                {/* основная часть */}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{i.title || "Без названия"}</div>
                  <div className="mt-0.5 text-xs text-gray-500 truncate">
                    {breadcrumbsText(i._id) || "—"} • Удалено:{" "}
                    {new Date(i.deletedAt).toLocaleString()} • Осталось дней: {i.daysLeft}
                  </div>
                </div>

                {/* действия справа — как на скрине: стрелка ↩ (восстановить) и корзина 🗑 */}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    className="rounded p-2 hover:bg-gray-50"
                    title="Восстановить"
                    aria-label="Восстановить"
                    onClick={() => restore(i._id)}
                  >
                    ↩
                  </button>
                  <button
                    className="rounded p-2 hover:bg-red-50 text-red-700"
                    title="Удалить навсегда"
                    aria-label="Удалить навсегда"
                    onClick={() => removeForever(i._id)}
                  >
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* футер */}
        <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-gray-500">
          <div>Всего: {filtered.length}</div>
          <div>Esc — закрыть (Alt+← — назад)</div>
        </div>
      </div>
    </div>
  );
}
