// app/page.tsx
"use client";

/**
 * Главная: «Обзор страниц» в виде дерева с тогглами (как в сайдбаре/Notion).
 *
 * Что здесь:
 *  - Загрузка активных страниц пользователя (/api/pages).
 *  - Построение дерева по parentId.
 *  - Тогглы ▸/▾ для раскрытия дочерних страниц.
 *  - Название ведёт на /documents/[id].
 *  - Справа у каждой страницы — меню «⋯» (PageActionsMenu) с теми же действиями,
 *    что и на странице редактора: создать подстраницу, архивировать/разархивировать,
 *    удалить (в корзину).
 *
 * Чего тут НЕТ (по просьбе заказчика):
 *  - Блока «создать страницу» (создаём через сайдбар).
 *  - Кнопок «Обновить» и «Выйти».
 *
 * Замечания:
 *  - Главное дерево стартует с корней, но допускает раскрытие детей на любой глубине.
 *  - /api/pages уже отдаёт только «живые» страницы (archived != true, deletedAt = null).
 */

import { useEffect, useMemo, useState } from "react";
import PageActionsMenu from "@/components/PageActionsMenu";

type PageDto = {
  _id: string;
  title?: string;
  parentId?: string | null;
  // могут приходить и др. поля, но они тут не нужны
};

type Node = {
  _id: string;
  title: string;
  children: Node[];
};

function buildTree(pages: PageDto[]): Node[] {
  const byId = new Map<string, Node>();
  const roots: Node[] = [];

  // Создаём узлы
  for (const p of pages) {
    byId.set(p._id, {
      _id: p._id,
      title: (p.title || "").trim() || "Новая страница",
      children: [],
    });
  }
  // Развешиваем детей по родителям
  for (const p of pages) {
    const node = byId.get(p._id)!;
    const pid = p.parentId || null;
    if (pid && byId.has(pid)) {
      byId.get(pid)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export default function HomePage() {
  const [pages, setPages] = useState<PageDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  // Состояние раскрытых узлов: id -> открыт?
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => {
    setOpen((m) => ({ ...m, [id]: !m[id] }));
  };

  // Загрузка активных страниц (и корней, и детей)
  const loadPages = async () => {
    setLoading(true);
    setError("");
    try {
      // Берём все активные (не только root=1), чтобы можно было раскрывать детей
      const res = await fetch("/api/pages");
      const data = await res.json();
      if (!res.ok) {
        setPages([]);
        setError(data?.error || "Ошибка загрузки страниц");
      } else {
        setPages(Array.isArray(data) ? data : []);
      }
    } catch {
      setPages([]);
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPages();
  }, []);

  const tree = useMemo(() => buildTree(pages), [pages]);

  // Рекурсивный элемент дерева
  function NodeView({ node, level }: { node: Node; level: number }) {
    const hasChildren = node.children.length > 0;
    const isOpen = open[node._id] ?? false;

    return (
      <li>
        <div
          className="flex items-center gap-2 py-1.5 rounded hover:bg-gray-50"
          style={{ paddingLeft: level * 16 }}
        >
          {/* Тоггл слева */}
          {hasChildren ? (
            <button
              className="text-gray-500 hover:text-gray-800 px-1"
              onClick={() => toggle(node._id)}
              aria-label={isOpen ? "Свернуть" : "Развернуть"}
              title={isOpen ? "Свернуть" : "Развернуть"}
            >
              {isOpen ? "▾" : "▸"}
            </button>
          ) : (
            <span className="inline-block w-4" />
          )}

          {/* Ссылка на документ */}
          <a
            className="flex-1 truncate px-1 text-[15px] hover:underline"
            href={`/documents/${node._id}`}
            title={node.title}
          >
            {node.title}
          </a>

          {/* Меню действий «⋯» как в редакторе */}
          <PageActionsMenu pageId={node._id} />
        </div>

        {/* Дети — рекурсивно */}
        {hasChildren && isOpen && (
          <ul className="space-y-1">
            {node.children.map((c) => (
              <NodeView key={c._id} node={c} level={level + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Заголовок страницы */}
      <div className="mb-3">
        <h1 className="text-5xl font-bold m-0">Страницы</h1><br></br>
        <p className="text-sm text-gray-500 mt-2">
          Создавайте страницы и подстраницы через левое меню. 
        </p><br></br><br></br>
      </div>

      {/* Служебные состояния */}
      {loading && <div className="text-gray-500">Загрузка…</div>}
      {error && <div className="text-red-600">{error}</div>}

      {/* Дерево */}
      {!loading && !error && tree.length === 0 && (
        <div className="text-gray-600">Пока нет страниц. Создайте первую через сайдбар.</div>
      )}

      {!loading && !error && tree.length > 0 && (
        <ul className="space-y-1">
          {tree.map((n) => (
            <NodeView key={n._id} node={n} level={0} />
          ))}
        </ul>
      )}
    </div>
  );
}
