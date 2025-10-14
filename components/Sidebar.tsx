"use client";

/**
 * Sidebar — левое навигационное меню в стиле Notion.
 *
 * Секции:
 *  1) Верхняя строка: мини-профиль + кнопка «Быстрая заметка».
 *     Быстрая заметка создаётся в личном проекте «Разное» (isDefault=true).
 *  2) Поиск, Home, Входящие.
 *  3) Общее (shared) — проекты с scope="shared".
 *  4) Личное (personal) — проекты с scope="personal".
 *  5) Архив — проекты archived=true (для «замороженных/выполненных»).
 *  6) Корзина — (пока заглушка).
 *  7) Справка — «Документация».
 */

import { useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";

type ProjectDto = {
  _id: string;
  title: string;
  scope: "personal" | "shared";
  archived: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function Sidebar() {
  const { data: session } = useSession();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [error, setError] = useState("");

  // Загрузка всех проектов пользователя
  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (res.ok) {
        setProjects(data);
        setError("");
      } else {
        setError(data?.error || "Ошибка загрузки проектов");
      }
    } catch {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const shared = useMemo(() => projects.filter(p => p.scope === "shared" && !p.archived), [projects]);
  const personal = useMemo(() => projects.filter(p => p.scope === "personal" && !p.archived), [projects]);
  const archived = useMemo(() => projects.filter(p => p.archived), [projects]);

  // Создание «Разного» (upsert) и «быстрой заметки»
  const ensureDefaultProject = async (): Promise<ProjectDto> => {
    // 1) есть ли уже
    const existing = projects.find(p => p.isDefault && p.scope === "personal" && !p.archived);
    if (existing) return existing;

    // 2) создать/upsert
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Разное", scope: "personal", isDefault: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Не удалось создать «Разное»");
    setProjects(prev => {
      const withoutDuplicates = prev.filter(p => !p.isDefault);
      return [...withoutDuplicates, data];
    });
    return data;
  };

  const createQuickNote = async () => {
    try {
      const def = await ensureDefaultProject();
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Быстрая заметка",
          content: { blocks: [{ type: "paragraph", data: { text: "" } }] },
          projectId: def._id,
        }),
      });
      const page = await res.json();
      if (!res.ok) throw new Error(page?.error || "Не удалось создать заметку");
      // переходим в документ
      window.location.href = `/documents/${page._id}`;
    } catch (e: any) {
      alert(e.message || "Ошибка при создании заметки");
    }
  };

  const createProject = async (scope: "personal" | "shared") => {
    const title = prompt(scope === "shared" ? "Название общего проекта" : "Название личного проекта");
    if (!title) return;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Ошибка создания проекта");
      setProjects(prev => [...prev, data]);
    } catch (e: any) {
      alert(e.message || "Ошибка при создании проекта");
    }
  };

  return (
    <aside className="w-[280px] shrink-0 border-r border-gray-200 h-screen sticky top-0 p-3 flex flex-col bg-white">
      {/* 1. Верхняя панель: профиль + Быстрая заметка */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs">
            {session?.user?.email?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="text-sm">
            <div className="font-medium truncate max-w-[150px]">{session?.user?.email}</div>
            <button
              className="text-xs text-gray-500 hover:underline"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Выйти
            </button>
          </div>
        </div>

        <button
          onClick={createQuickNote}
          className="px-2 py-1 text-sm border rounded-md hover:bg-gray-50"
          title="Быстрая заметка в «Разное»"
        >
          + Заметка
        </button>
      </div>

      {/* 2. Поиск, Home, Входящие */}
      <nav className="space-y-1">
        <button
          className="w-full text-left px-2 py-1 rounded hover:bg-gray-100"
          onClick={() => (window.location.href = "/search")}
        >
          🔎 Поиск
        </button>
        <a className="block px-2 py-1 rounded hover:bg-gray-100" href="/">🏠 Главная</a>
        <a className="block px-2 py-1 rounded hover:bg-gray-100" href="/inbox">📥 Входящие</a>
      </nav>

      <div className="my-3 border-t" />

      {/* 3. Общее (shared) */}
      <div className="mb-3">
        <div className="flex items-center justify-between px-2 mb-1">
          <div className="text-xs uppercase tracking-wide text-gray-500">Общее</div>
          <button className="text-xs text-gray-600 hover:underline" onClick={() => createProject("shared")}>
            + Проект
          </button>
        </div>
        <ul className="space-y-1">
          {loading && <li className="px-2 text-sm text-gray-500">Загрузка…</li>}
          {!loading && shared.length === 0 && (
            <li className="px-2 text-sm text-gray-400">Нет общих проектов</li>
          )}
          {shared.map(p => (
            <li key={p._id}>
              <a className="block px-2 py-1 rounded hover:bg-gray-100" href={`/projects/${p._id}`}>
                👥 {p.title}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* 4. Личное (personal) */}
      <div className="mb-3">
        <div className="flex items-center justify-between px-2 mb-1">
          <div className="text-xs uppercase tracking-wide text-gray-500">Личное</div>
          <button className="text-xs text-gray-600 hover:underline" onClick={() => createProject("personal")}>
            + Проект
          </button>
        </div>
        <ul className="space-y-1">
          {personal.map(p => (
            <li key={p._id}>
              <a className="block px-2 py-1 rounded hover:bg-gray-100" href={`/projects/${p._id}`}>
                📁 {p.title}{p.isDefault ? " (Разное)" : ""}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* 5. Архив */}
      <div className="mb-3">
        <div className="px-2 mb-1 text-xs uppercase tracking-wide text-gray-500">Архив</div>
        <ul className="space-y-1">
          {archived.map(p => (
            <li key={p._id}>
              <a className="block px-2 py-1 rounded hover:bg-gray-100" href={`/projects/${p._id}`}>
                🗂️ {p.title}
              </a>
            </li>
          ))}
          {archived.length === 0 && <li className="px-2 text-sm text-gray-400">Пусто</li>}
        </ul>
      </div>

      {/* 6. Корзина (заглушка) */}
      <a className="block px-2 py-1 rounded hover:bg-gray-100" href="/trash">🗑️ Корзина</a>

      {/* 7. Справка — внизу */}
      <div className="mt-auto pt-2">
        <button
          className="w-full text-left px-2 py-1 rounded hover:bg-gray-100"
          onClick={() => window.open("https://example.com/docs", "_blank")}
        >
          ❓ Документация
        </button>
      </div>
    </aside>
  );
}
