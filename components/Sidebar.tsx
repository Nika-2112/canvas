"use client";

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

type Props = { variant?: "standalone" | "drawer" };

export default function Sidebar({ variant = "standalone" }: Props) {
  const { data: session } = useSession();

  // ------- пользователь вверху -------
  const displayName =
    (session?.user as any)?.username ||
    session?.user?.email ||
    (session?.user as any)?.name ||
    "Пользователь";
  const initial = (displayName || "U").trim().charAt(0).toUpperCase();
  const role = (session?.user as any)?.role as "admin" | "editor" | "guest" | undefined;
  const isAdmin = role === "admin";
  const roleLabel =
    role === "admin" ? "Админ" : role === "editor" ? "Редактор" : role === "guest" ? "Гость" : "";

  // ------- данные -------
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [pagesPersonal, setPagesPersonal] = useState<PageDto[]>([]); // без участников
  const [pagesShared, setPagesShared] = useState<PageDto[]>([]);     // с участниками
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // Ctrl/Cmd + K — поиск
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

  // ------- загрузка общих страниц (есть участники) -------
  const loadSharedPages = async () => {
    const r = await fetch("/api/pages?shared=1", { cache: "no-store" });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || "Ошибка загрузки общих страниц");
    setPagesShared(Array.isArray(d) ? (d as PageDto[]) : []);
  };

  // ------- загрузка личных страниц (без участников) -------
  const loadPersonalPages = async () => {
    const r = await fetch("/api/pages", { cache: "no-store" });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || "Ошибка загрузки личных страниц");
    setPagesPersonal(Array.isArray(d) ? (d as PageDto[]) : []);
  };

  // ------- общий загрузчик -------
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        await Promise.all([loadSharedPages(), loadPersonalPages(), loadProjects()]);
      } catch (e: any) {
        setErr(e?.message || "Ошибка");
      } finally {
        setLoading(false);
      }
    })();

    // авто-обновление «Общих» при создании подстраниц с наследованием участников
    const reloadShared = () => loadSharedPages().catch(() => {});
    window.addEventListener("shared-pages-changed", reloadShared);
    return () => window.removeEventListener("shared-pages-changed", reloadShared);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------- проекты -------
  const loadProjects = async () => {
    const r = await fetch("/api/projects");
    if (!r.ok) return;
    const d = await r.json();
    setProjects(Array.isArray(d) ? d : []);
  };

  const personalProjects = useMemo(
    () => projects.filter((p) => p.scope === "personal" && !p.archived),
    [projects]
  );

  // ------- создание корневой личной страницы -------
  const createRootPage = async () => {
    try {
      const r = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p?.error || "Не удалось создать страницу");
      setPagesPersonal((prev) => [p, ...prev]);
      window.location.href = `/documents/${p._id}`;
    } catch (e: any) {
      alert(e.message || "Ошибка");
    }
  };

  // ------- создание подстраницы (наследует участников у «общего» родителя) -------
  const createChildPage = async (parentId: string | null) => {
    try {
      const r = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId }),
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p?.error || "Не удалось создать подстраницу");

      // обновить обе секции: новая могла попасть в «Общее»
      window.dispatchEvent(new Event("shared-pages-changed"));
      await loadPersonalPages().catch(() => {});

      window.location.href = `/documents/${p._id}`;
    } catch (e: any) {
      alert(e.message || "Ошибка");
    }
  };

  // ------- быстрые заметки (личные) -------
  const createQuickNote = async () => {
    try {
      const r = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "",
          content: { blocks: [{ type: "paragraph", data: { text: "" } }] },
        }),
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p?.error || "Не удалось создать заметку");
      setPagesPersonal((prev) => [p, ...prev]);
      window.location.href = `/documents/${p._id}`;
    } catch (e: any) {
      alert(e.message || "Ошибка при создании заметки");
    }
  };

  const containerClass = clsx(
    "flex flex-col",
    variant === "standalone" &&
      "w-[280px] shrink-0 border-r border-gray-200 h-screen sticky top-0 p-3 bg-white",
    variant === "drawer" && "w-full h-full p-2 bg-transparent"
  );

  return (
    <aside className={containerClass}>
      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Вверх: пользователь / выход / заметка */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs">
            {initial}
          </div>
          <div className="text-sm min-w-0">
            <div className="truncate w-[160px]" title={displayName}>
              {displayName}
            </div>
            {roleLabel && <div className="text-[12px] text-gray-500">{roleLabel}</div>}
            <button className="exit hover:underline text-[12px]" onClick={() => signOut({ callbackUrl: "/login" })}>
              Выйти
            </button>
          </div>
        </div>

        <button onClick={createQuickNote} className="sd-qnote inline-flex items-center gap-1 px-2 py-1 text-sm">
          <img src="/+.svg" alt="+" width={15} height={15} className="object-contain" />
          <span className="sd-qnote-label">Заметка</span>
        </button>
      </div>

      {/* нав */}
      <nav className="space-y-1">
        {isAdmin && (
          <a href="/admin/users" className="block px-2 py-1 rounded hover:bg-gray-100">
            👥 Пользователи
          </a>
        )}
        <button className="w-full text-left px-2 py-1 rounded hover:bg-gray-100" onClick={() => setSearchOpen(true)}>
          🔎 Поиск (Ctrl/Cmd + K)
        </button>
        <a className="block px-2 py-1 rounded hover:bg-gray-100" href="/">🏠 Главная</a>
        <a className="block px-2 py-1 rounded hover:bg-gray-100" href="/inbox">📥 Входящие</a>
      </nav>

      <div className="my-3 border-t" />

      {/* ОБЩЕЕ — дерево страниц с участниками */}
      <div className="mb-3">
        <div className="flex items-center justify-between px-2 mb-1">
          <div className="text-xs uppercase tracking-wide li-heading">Общее</div>
        </div>
        <SidebarTree pages={pagesShared} onCreateChild={createChildPage} />
      </div>

      {/* СТРАНИЦЫ — дерево личных страниц без участников */}
      <div className="mb-3">
        <div className="flex items-center justify-between px-2 mb-1">
          <div className="text-xs uppercase tracking-wide li-heading">Страницы</div>
          <button className="text-xs text-gray-600 hover:underline" onClick={createRootPage}>
            + Страница
          </button>
        </div>
        <SidebarTree pages={pagesPersonal} onCreateChild={createChildPage} />
      </div>

      {/* Низ */}
      <div className="mt-auto pt-2 space-y-1">
        <a className="block px-2 py-1 rounded hover:bg-gray-100" href="/archive">
          📦 Архив
        </a>
        <a className="block px-2 py-1 rounded hover:bg-gray-100" href="/trash">
          🗑️ Корзина
        </a>
      </div>
    </aside>
  );
}
