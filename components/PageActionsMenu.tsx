// components/PageActionsMenu.tsx
"use client";
/**
 * Меню действий страницы (⋯):
 *  - Создать подстраницу
 *  - Добавить участников
 *  - Архивировать / Разархивировать
 *  - Удалить (каскадом в корзину)
 */
import { useEffect, useRef, useState, useTransition } from "react";
import AddMembersModal from "@/components/AddMembersModal";
import { useSession } from "next-auth/react";


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
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role as "admin" | "editor" | "guest" | undefined;
  const isAdmin = userRole === "admin";

  // ⬇️ состояние для модалки «Добавить участников»
  const [inviteOpen, setInviteOpen] = useState(false);

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
        <div className="sv absolute right-0 mt-1 w-56 rounded-md  bg-white shadow-lg z-50">
          <button
            className="w-full text-left px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => start(handleCreateSubpage)}
            disabled={pending}
          >
            {pending ? "Создание…" : "Создать подстраницу"}
          </button>

          {/* 👥 пункт меню: открыть модалку приглашения */}
        {isAdmin && (
          <button
            className="block w-full text-left px-3 py-2 hover:bg-gray-50"
            onClick={() => {
              setInviteOpen(true);
              setOpen(false); // закрыть меню, чтобы не мешало
            }}
          >
            Добавить участников
          </button>
        )}

          <button
            className="w-full text-left px-3 py-2 hover:bg-gray-50"
            onClick={() => start(handleArchiveToggle)}
          >
            {archived ? "Разархивировать" : "Архивировать"}
          </button>

          

          <button
            className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-700"
            onClick={handleDeleteCascade}
          >
            Удалить
          </button>
        </div>
      )}

      {/* ⬇️ САМА МОДАЛКА */}
      {inviteOpen && (
        <AddMembersModal
          pageId={pageId}
          onClose={() => setInviteOpen(false)}
          onChanged={() => {
            setInviteOpen(false);
            // уведомим сайдбар обновить раздел «Общее»
            try {
              window.dispatchEvent(new CustomEvent("shared-pages-changed"));
            } catch {}
          }}
        />
      )}
    </div>
  );
}
