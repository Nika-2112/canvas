// components/Sidebar.tsx
"use client";

/**
 * Sidebar — левое меню в стиле Notion.
 * Варианты:
 *  - variant="standalone": как колонка в лейауте (фикс. ширина, sticky)
 *  - variant="drawer": внутри выезжающей панели SidebarDrawer (занимает всю панель)
 *
 * Показывает:
 *  - верхняя строчка: пользователь + «быстрая заметка»
 *  - поиск, главная, входящие
 *  - Общее / Личное (из /api/projects)
 *  - Страницы — дерево страниц (/api/pages) с вложенностями (SidebarTree)
 *  - Кнопки «Архив» и «Корзина»
 */

import { useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import clsx from "clsx";
import SidebarTree, { PageDto } from "@/components/SidebarTree";
import SearchOverlay from "@/components/SearchOverlay";

type ProjectDto = {
  _id: string;
  title: string;
  scope: "personal" | "shared";
  archived: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  variant?: "standalone" | "drawer";
};

export default function Sidebar({ variant = "standalone" }: Props) {
  const { data: session } = useSession();

  // --- данные пользователя для аватарки и подписи ---
  const displayName =
    (session?.user as any)?.username ||
    session?.user?.email ||
    (session?.user as any)?.name ||
    "Пользователь";

  const initial = (displayName || "U").trim().charAt(0).toUpperCase();

  const role = (session?.user as any)?.role as "admin" | "editor" | "guest" | undefined;
  const isAdmin = role === "admin";
  const roleLabel = role === "admin" ? "Админ" : role === "editor" ? "Редактор" : role === "guest" ? "Гость" : "";

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [error, setError] = useState("");

  const [pages, setPages] = useState<PageDto[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sharedPages, setSharedPages] = useState<Array<{ _id: string; title: string }>>([]);


  // Ctrl/Cmd + K — открыть поиск
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
    useEffect(() => {
      function reload() { loadSharedPages(); }
      window.addEventListener("shared-pages-changed", reload);
      return () => window.removeEventListener("shared-pages-changed", reload);
    }, []);
    // Загрузка "общих" страниц (те, у кого есть участники)
  const loadSharedPages = async () => {
    try {
      const res = await fetch("/api/pages?shared=1"); // см. пункт 4 — дополним API /api/pages
      if (!res.ok) {
        if (res.status === 401) return;
        return;
      }
      const data = await res.json();
      setSharedPages(Array.isArray(data) ? data : []);
    } catch {}
  };
  useEffect(() => { loadSharedPages(); }, []);


  // --- Страницы (дерево) ---
const loadPages = async () => {
  try {
    const res = await fetch("/api/pages/visible", { cache: "no-store" });
    if (!res.ok) {
      if (res.status === 401) return;
      const data = await res.json().catch(() => null);
      console.error(data?.error || "Ошибка загрузки страниц");
      return;
    }
    const data = await res.json();
    // ожидаем { personal: PageDto[], shared: PageDto[] }
    const all = [...(data?.personal || []), ...(data?.shared || [])];
    setPages(all);
  } catch {
    console.error("Ошибка соединения при загрузке страниц");
  }
};
  // грузим дерево страниц при монтировании
  useEffect(() => {
    loadPages();
  }, []);

  // Создать корневую страницу
  const createRootPage = async () => {
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const page = await res.json();
      if (!res.ok) throw new Error(page?.error || "Не удалось создать страницу");
      setPages((prev) => [page, ...prev]);
      window.location.href = `/documents/${page._id}`;
    } catch (e: any) {
      alert(e.message || "Ошибка");
    }
  };

  // Создать подстраницу
  const createChildPage = async (parentId: string | null) => {
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId }),
      });
      const page = await res.json();
      if (!res.ok) throw new Error(page?.error || "Не удалось создать подстраницу");
      setPages((prev) => [page, ...prev]);
      window.location.href = `/documents/${page._id}`;
    } catch (e: any) {
      alert(e.message || "Ошибка");
    }
  };

  // --- Проекты ---
  const loadProjects = async () => {
    try {
      setLoadingProjects(true);
      const res = await fetch("/api/projects");
      if (!res.ok) {
        if (res.status === 401) {
          setLoadingProjects(false);
          return;
        }
        const data = await res.json().catch(() => null);
        setError(data?.error || "Ошибка загрузки проектов");
        setLoadingProjects(false);
        return;
      }
      const data = await res.json();
      setProjects(data);
      setError("");
    } catch {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoadingProjects(false);
    }
  };
  // грузим проекты при монтировании
  useEffect(() => {
    loadProjects();
  }, []);

  const shared = useMemo(
    () => projects.filter((p) => p.scope === "shared" && !p.archived),
    [projects]
  );
  const personal = useMemo(
    () => projects.filter((p) => p.scope === "personal" && !p.archived),
    [projects]
  );
  const archivedProjects = useMemo(() => projects.filter((p) => p.archived), [projects]);

  // Создание/апсерт «Разное» для быстрой заметки
  const ensureDefaultProject = async (): Promise<ProjectDto> => {
    const existing = projects.find((p) => p.isDefault && p.scope === "personal" && !p.archived);
    if (existing) return existing;

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Разное", scope: "personal", isDefault: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Не удалось создать «Разное»");
    setProjects((prev) => {
      const withoutDuplicates = prev.filter((p) => !p.isDefault);
      return [...withoutDuplicates, data];
    });
    return data;
  };

  // Быстрая заметка
  const createQuickNote = async () => {
    try {
      await ensureDefaultProject().catch(() => null);
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "",
          content: { blocks: [{ type: "paragraph", data: { text: "" } }] },
        }),
      });
      const page = await res.json();
      if (!res.ok) throw new Error(page?.error || "Не удалось создать заметку");
      setPages((prev) => [page, ...prev]);
      window.location.href = `/documents/${page._id}`;
    } catch (e: any) {
      alert(e.message || "Ошибка при создании заметки");
    }
  };

  // Создать проект
  const createProject = async (scope: "personal" | "shared") => {
    try {
      const title =
        prompt(scope === "shared" ? "Название общего проекта" : "Название личного проекта") ||
        "Новый проект";

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, scope }),
      });
      const project = await res.json();
      if (!res.ok) throw new Error(project?.error || "Не удалось создать проект");
      setProjects((prev) => [project, ...prev]);

      if (project?.rootPageId) {
        window.location.href = `/documents/${project.rootPageId}`;
      } else {
        window.location.href = `/projects/${project._id}`;
      }
    } catch (e: any) {
      alert(e.message || "Ошибка при создании проекта");
    }
  };

  const containerClass = clsx(
    "flex flex-col",
    variant === "standalone" &&
      "w-[280px] shrink-0 border-r border-gray-200 h-screen sticky top-0 p-3 bg-white",
    variant === "drawer" && "w-full h-full p-2 bg-transparent"
  );

  return (
    <aside className={containerClass} aria-label="Боковая панель">
      {/* Полотно поиска */}
      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Верхняя строка */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* Аватар с первой буквой */}
          <div
            className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs flex-shrink-0"
            title={displayName}
          >
            {initial}
          </div>

          {/* Имя + роль + выход */}
          <div className="text-sm min-w-0">
            <div className="truncate w-[160px] sd-user-email" title={displayName}>
              {displayName}
            </div>

            {/* Роль вместо email (под именем) */}
            {roleLabel && <div className="text-[12px] text-gray-500">{roleLabel}</div>}

            <button
              className="exit hover:underline text-[12px]"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Выйти
            </button>
          </div>
        </div>

        {/* + Заметка */}
        <button
          onClick={createQuickNote}
          className="sd-qnote flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 text-sm"
          title="Быстрая заметка"
        >
          <img src="/+.svg" alt="Добавить" width={15} height={15} className="object-contain" />
          <span className="sd-qnote-label">Заметка</span>
        </button>
      </div>

      {/* Навигация */}
      <nav className="space-y-1">
        {/* 👥 Админский пункт — только для admin */}
        {isAdmin && (
          <a
            href="/admin/users"
            className="block px-2 py-1 rounded hover:bg-gray-100"
            title="Управление пользователями"
          >
            👥 Пользователи
          </a>
        )}

        <button
          className="w-full text-left px-2 py-1 rounded hover:bg-gray-100"
          onClick={() => setSearchOpen(true)}
          title="Поиск (Ctrl/Cmd + K)"
        >
          🔎 Поиск
        </button>
        <a className="block px-2 py-1 rounded hover:bg-gray-100" href="/">🏠 Главная</a>
        <a className="block px-2 py-1 rounded hover:bg-gray-100" href="/inbox">📥 Входящие</a>
      </nav>

      <div className="my-3 border-t" />

      {/* Общее */}
      <div className="mb-3">
        <div className="flex items-center justify-between px-2 mb-1">
          <div className="text-xs uppercase tracking-wide li-heading">Общее</div>
          {/* кнопки создания здесь больше нет */}
        </div>
        <ul className="space-y-1">
          {sharedPages.length === 0 && <li className="px-2">Нет общих страниц</li>}
          {sharedPages.map((p) => (
            <li key={p._id}>
              <a className="block px-2 py-1 rounded hover:bg-gray-100" href={`/documents/${p._id}`}>
                👥 {p.title || "Без названия"}
              </a>
            </li>
          ))}
        </ul>
      </div>



      {/* Страницы (дерево) */}
      <div className="mb-3">
        <div className="flex items-center justify-between px-2 mb-1">
          <div className="text-xs uppercase tracking-wide li-heading">Страницы</div>
          <button className="text-xs text-gray-600 hover:underline" onClick={createRootPage}>
            + Проект
          </button>
        </div>
        <SidebarTree pages={pages} onCreateChild={createChildPage} />
      </div>

      {/* Личное */}
      <div className="mb-3">
        <div className="flex items-center justify-between px-2 mb-1">
          <div className="li-heading text-xs uppercase tracking-wide">Личное</div>
          <button className="text-xs hover:underline" onClick={() => createProject("personal")}>
            + Проект
          </button>
        </div>
        <ul className="space-y-1">
          {personal.map((p) => (
            <li key={p._id}>
              <a className="block px-2 py-1 rounded hover:bg-gray-100" href={`/projects/${p._id}`}>
                📁 {p.title}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Раздел быстрых ссылок снизу */}
      <div className="mt-auto pt-2 space-y-1">
        <a className="block px-2 py-1 rounded hover:bg-gray-100" href="/archive" title="Архив страниц">
          📦 Архив
        </a>
        <a className="block px-2 py-1 rounded hover:bg-gray-100" href="/trash" title="Корзина">
          🗑️ Корзина
        </a>

        <button
          className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 li-heading"
          onClick={() => window.open("https://example.com/docs", "_blank")}
        >
          ❓ Документация
        </button>
      </div>
    </aside>
  );
}
