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
 *  - Архив, Корзина, Документация
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

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [error, setError] = useState("");

  const [pages, setPages] = useState<PageDto[]>([]);

  // 🔎 состояние для полотна поиска
  const [searchOpen, setSearchOpen] = useState(false);

  // Глобальный шорткат Ctrl/Cmd + K — открыть поиск
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

  // --- Страницы (дерево Notion-подобное) ---
  const loadPages = async () => {
    try {
      const res = await fetch("/api/pages");
      const data = await res.json();
      if (res.ok) setPages(data);
      else console.error(data?.error || "Ошибка загрузки страниц");
    } catch {
      console.error("Ошибка соединения при загрузке страниц");
    }
  };

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

  // --- Проекты (Общее/Личное/Архив) ---
  const loadProjects = async () => {
    try {
      setLoadingProjects(true);
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
      setLoadingProjects(false);
    }
  };

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
  const archived = useMemo(() => projects.filter((p) => p.archived), [projects]);

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

  // Быстрая заметка → создаётся страница и открывается
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

  // ✅ ВОТ ЭТА ФУНКЦИЯ ОТСУТСТВОВАЛА — ВЕРНУЛ
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

      // Если API создаёт корневую страницу проекта — открываем её
      if (project?.rootPageId) {
        window.location.href = `/documents/${project.rootPageId}`;
      } else {
        window.location.href = `/projects/${project._id}`;
      }
    } catch (e: any) {
      alert(e.message || "Ошибка при создании проекта");
    }
  };

  // Классы контейнера по варианту
  const containerClass = clsx(
    "flex flex-col",
    variant === "standalone" &&
      "w-[280px] shrink-0 border-r border-gray-200 h-screen sticky top-0 p-3 bg-white",
    variant === "drawer" && "w-full h-full p-2 bg-transparent"
  );

  return (
    <aside className={containerClass} aria-label="Боковая панель">
      {/* Полотно поиска — монтируем здесь один раз */}
      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Верхняя строка: пользователь + «быстрая заметка» */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs flex-shrink-0">
            {session?.user?.email?.[0]?.toUpperCase() || "U"}
          </div>

        <div className="text-sm flex-shrink-0">
            <div className="truncate w-[160px] sd-user-email" title={session?.user?.email || ""}>
              {session?.user?.email}
            </div>

            <button className="exit hover:underline" onClick={() => signOut({ callbackUrl: "/login" })}>
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

      {/* Поиск / Главная / Входящие */}
      <nav className="space-y-1">
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
          <button className="text-xs text-gray-600 hover:underline" onClick={() => createProject("shared")}>
            + Проект
          </button>
        </div>
        <ul className="space-y-1">
          {loadingProjects && <li className="px-2">Загрузка…</li>}
          {!loadingProjects && shared.length === 0 && <li className="px-2">Нет общих проектов</li>}
          {shared.map((p) => (
            <li key={p._id}>
              <a className="block px-2 py-1 rounded hover:bg-gray-100" href={`/projects/${p._id}`}>
                👥 {p.title}
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

      {/* Архив */}
      <div className="mb-3">
        <div className="px-2 mb-1 text-xs uppercase tracking-wide li-heading">Архив</div>
        <ul className="space-y-1">
          {archived.map((p) => (
            <li key={p._id}>
              <a className="block px-2 py-1 rounded hover:bg-gray-100" href={`/projects/${p._id}`}>
                🗂️ {p.title}
              </a>
            </li>
          ))}
          {archived.length === 0 && <li className="px-2">Пусто</li>}
        </ul>
      </div>

      {/* Корзина */}
      <a className="block px-2 py-1 rounded hover:bg-gray-100" href="/trash">
        🗑️ Корзина
      </a>

      {/* Документация — внизу */}
      <div className="mt-auto pt-2">
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
