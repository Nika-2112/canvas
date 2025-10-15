"use client";
/**
 * Меню действий страницы (⋯):
 *  - Создать подстраницу
 *  - Удалить (ВСЕГДА каскадом: страница + все её подстраницы)
 */

import { useEffect, useRef, useState, useTransition } from "react";

export default function PageActionsMenu({ pageId }: { pageId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // закрытие по клику вне
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  async function handleCreateSubpage() {
    const res = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Новая страница", parentId: pageId }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data?.error || "Не удалось создать подстраницу");
      return;
    }
    await new Promise((r) => setTimeout(r, 80)); // мягкая пауза для dev
    window.location.href = `/documents/${data._id}`;
  }

  async function handleDeleteCascade() {
    if (!confirm("Удалить эту страницу и ВСЕ её подстраницы? Это действие необратимо.")) return;
    const res = await fetch(`/api/pages/${pageId}`, { method: "DELETE" }); // всегда каскад на сервере
    if (res.ok) {
      window.location.href = "/";
    } else {
      const e = await res.json().catch(() => ({}));
      alert(e?.error || "Не удалось удалить");
    }
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
