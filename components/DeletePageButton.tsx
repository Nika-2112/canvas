"use client";

/**
 * Кнопка удаления страницы.
 * Назначение:
 *  - Выполняет запрос DELETE /api/pages/:id;
 *  - Запрашивает подтверждение пользователя;
 *  - По успеху либо вызывает onDeleted(), либо выполняет redirect на "/".
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  pageId: string;              // Идентификатор страницы
  redirectAfter?: boolean;     // Если true — после удаления перейти на главную
  onDeleted?: () => void;      // Колбэк после успешного удаления (например, перезагрузить список)
  className?: string;          // Кастомизация внешнего вида
  children?: React.ReactNode;  // Содержимое кнопки (текст/иконка)
};

export default function DeletePageButton({
  pageId,
  redirectAfter = false,
  onDeleted,
  className,
  children,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    if (busy) return;
    if (!window.confirm("Удалить эту страницу? Действие необратимо.")) return;

    try {
      setBusy(true);
      const res = await fetch(`/api/pages/${pageId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Не удалось удалить страницу");
        setBusy(false);
        return;
      }

      if (onDeleted) {
        onDeleted();
      } else if (redirectAfter) {
        router.push("/");
      } else {
        router.refresh();
      }
    } catch {
      alert("Ошибка соединения при удалении");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy}
      className={
        className ??
        "px-3 py-2 border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
      }
      title="Удалить страницу"
    >
      {children ?? (busy ? "Удаление…" : "Удалить")}
    </button>
  );
}
