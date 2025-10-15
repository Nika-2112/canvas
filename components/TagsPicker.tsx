// /canvas/components/TagsPicker.tsx
"use client";

/**
 * Мультиселект тегов.
 *
 * Изменения (для диплома):
 * • РАНЬШЕ: PATCH шёл в /api/pages/:id/tags и писал top-level поле tags (которого нет в схеме Page).
 * • ТЕПЕРЬ: PATCH идёт в /api/pages/tags?id=:pageId и обновляет свойство type="tags" в массиве properties (см. backend).
 */

import { useEffect, useState } from "react";

const PRESET_TAGS = ["Локация", "Логистика", "Маркетинг", "Бюджет", "Партнёры", "Сценарий"];

export default function TagsPicker({
  pageId,
  value,
  onChange,
}: {
  pageId: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [tags, setTags] = useState<string[]>(value);
  useEffect(() => setTags(value), [value]);

  async function toggle(tag: string) {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    setTags(next); // оптимистичный апдейт

    // новый маршрут: /api/pages/tags?id=<pageId>
    await fetch(`/api/pages/tags?id=${encodeURIComponent(pageId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: next }),
    }).catch(() => {
      // при ошибке можно вернуть старое значение, если нужно
    });

    onChange(next);
  }

  return (
    <div className="flex flex-wrap gap-1">
      {PRESET_TAGS.map((tag) => (
        <button
          key={tag}
          onClick={() => toggle(tag)}
          className={`rounded-full border px-2 py-0.5 text-xs ${
            tags.includes(tag) ? "bg-black text-white" : "bg-white text-black"
          }`}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
