"use client";
/**
 * Меню действий страницы (⋯):
 *  - Создать подстраницу
 *  - Архивировать / Разархивировать
 *  - Удалить (каскадом в корзину)
 */
import { useEffect, useRef, useState, useTransition } from "react";

export default function PageActionsMenu({
  pageId,
  isArchived = false,
}: {
  pageId: string;
  isArchived?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const [archived, setArchived] = useState<boolean>(isArchived);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  async function handleCreateSubpage() {
    const res = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: pageId }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data?.error || "Не удалось создать подстраницу");
    window.location.href = `/documents/${data._id}`;
  }

  async function handleArchiveToggle() {
    const want = !archived;
    const res = await fetch(`/api/pages/${pageId}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: want, cascade: true }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return alert(e?.error || "Не удалось изменить архивный статус");
    }
    setArchived(want);
    // UX: если заархивировали — уводим на главную; если разархивировали — остаёмся
    if (want) window.location.href = "/archive";
  }

  async function handleDeleteCascade() {
    if (!confirm("Удалить эту страницу и ВСЕ её подстраницы в корзину?")) return;
    const res = await fetch(`/api/pages/${pageId}`, { method: "DELETE" });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return alert(e?.error || "Не удалось удалить");
    }
    window.location.href = "/trash";
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 rounded hover:bg-gray-100 text-gray-600"
        title="Действия"
        aria-label="Действия"
      >
        ⋯
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-56 rounded-md border bg-white shadow-lg z-50">
          <button
            className="w-full text-left px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => start(handleCreateSubpage)}
            disabled={pending}
          >
            {pending ? "Создание…" : "Создать подстраницу"}
          </button>

          <button
            className="w-full text-left px-3 py-2 hover:bg-gray-50"
            onClick={() => start(handleArchiveToggle)}
          >
            {archived ? "Разархивировать" : "Архивировать"}
          </button>

          <div className="my-1 border-t" />

          <button
            className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-700"
            onClick={handleDeleteCascade}
          >
            Удалить
          </button>
        </div>
      )}
    </div>
  );
}
