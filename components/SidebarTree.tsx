// components/SidebarTree.tsx
"use client";

import React from "react";

/** Плоская запись страницы из БД */
export type PageDto = {
  _id: string;
  title?: string;
  parentId?: string | null;
};

/** Узел дерева для рендера */
export type PageNode = {
  _id: string;
  title: string;
  children: PageNode[];
};

/** Построение дерева из плоского списка */
function buildTree(pages: PageDto[]): PageNode[] {
  const byId = new Map<string, PageNode>();
  const roots: PageNode[] = [];

  // Сначала создаём все узлы
  for (const p of pages) {
    byId.set(p._id, {
      _id: p._id,
      title: (p.title && p.title.trim()) || "Новая страница",
      children: [],
    });
  }

  // Затем развешиваем по parentId
  for (const p of pages) {
    const node = byId.get(p._id)!;
    const parentId = p.parentId || null;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

type Props = {
  /** Плоский список страниц (мы сами построим дерево) */
  pages: PageDto[];
  /** Опциональная фабрика подстраниц */
  onCreateChild?: (parentId: string | null) => void | Promise<void>;
};

/** Рекурсивный рендер одного узла */
function NodeView({
  node,
  level,
  onCreateChild,
}: {
  node: PageNode;
  level: number;
  onCreateChild?: (parentId: string | null) => void | Promise<void>;
}) {
  return (
    <li>
      {/* Отступ 15px на уровень — как просили */}
      <div
        className="flex items-center gap-2 py-1 rounded hover:bg-gray-100"
        style={{ paddingLeft: level * 15 }}
      >
        <a className="flex-1 block px-2" href={`/documents/${node._id}`}>
          {node.title}
        </a>

        {onCreateChild && (
          <button
            className="text-xs px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100"
            onClick={() => onCreateChild(node._id)}
            title="Добавить подстраницу"
          >
            + 
          </button>
        )}
      </div>

      {node.children.length > 0 && (
        <ul className="space-y-1">
          {node.children.map((child) => (
            <NodeView
              key={child._id}
              node={child}
              level={level + 1}
              onCreateChild={onCreateChild}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Дерево страниц в стиле Notion */
export default function SidebarTree({ pages, onCreateChild }: Props) {
  const tree = React.useMemo(() => buildTree(pages), [pages]);

  if (!tree.length) {
    return <div className="px-2 text-sm text-gray-500">Пока пусто</div>;
  }

  return (
    <ul className="space-y-1">
      {tree.map((n) => (
        <NodeView
          key={n._id}
          node={n}
          level={0}
          onCreateChild={onCreateChild}
        />
      ))}
    </ul>
  );
}
