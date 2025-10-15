"use client";

/**
 * Кнопка создаёт подстраницу текущей страницы.
 * Бэкенд сам добавляет в родителя блок-ссылку "child_page".
 */
import { useTransition } from "react";

export default function CreateSubpageButton({ parentId }: { parentId: string }) {
  const [pending, startTransition] = useTransition();

  async function create() {
    const res = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Новая страница", parentId }),
    });
    const data = await res.json();
    if (res.ok) {
      // Перейдём на созданную подстраницу
      window.location.href = `/documents/${data._id}`;
    } else {
      alert(data?.error || "Не удалось создать подстраницу");
    }
  }

  return (
    <button
      onClick={() => startTransition(create)}
      disabled={pending}
      className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
      title="Создать подстраницу"
    >
      {pending ? "Создание…" : "Создать подстраницу"}
    </button>
  );
}
