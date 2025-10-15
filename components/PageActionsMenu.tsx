"use client";
/**
 * PageActionsMenu — простое контекстное меню "⋯" для страницы:
 *  - Создать подстраницу (parentId = текущая страница)
 *  - Удалить страницу (через твой DeletePageButton)
 *
 * Поведение:
 *  - Клик по ⋯ открывает меню.
 *  - Клик вне меню закрывает его.
 *  - Создание подстраницы делает POST /api/pages, затем редирект на новую страницу.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import DeletePageButton from "@/components/DeletePageButton";

export default function PageActionsMenu({ pageId }: { pageId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Закрываем меню по клику вне
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

        // микропаузa 80мс — помогает в dev, когда редирект происходит "в тот же тик"
        await new Promise((r) => setTimeout(r, 80));

        window.location.href = `/documents/${data._id}`;
        }



  return (
    <div className="relative" ref={ref}>
      <button
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

          <DeletePageButton
            pageId={pageId}
            redirectAfter={true}
            className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-700"
          >
            Удалить страницу
          </DeletePageButton>
        </div>
      )}
    </div>
  );
}
