"use client";

/**
 * Простой мультиселект тегов (предустановленный список).
 * При клике — сразу PATCH в API и локальное обновление.
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
  onChange: () => void;
}) {
  const [tags, setTags] = useState<string[]>(value);
  useEffect(() => setTags(value), [value]);

  function toggle(tag: string) {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    setTags(next);
    fetch(`/api/pages/${pageId}/tags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: next }),
    }).then(() => onChange());
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
