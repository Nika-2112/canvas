"use client";

/**
 * EditorClient — инициализация Editor.js на клиенте.
 *
 * Задача: убрать дублирующийся контейнер (двойной Editor.js).
 * Причина: в дев-режиме React 18 эффекты могут монтироваться дважды (StrictMode),
 *          поэтому второй экземпляр накладывается поверх первого.
 *
 * Лечение:
 *  1) Глобальный «одиночка» через window.__editorjsInstance: перед созданием — destroy() предыдущего.
 *  2) Жёсткая очистка контейнера #editorjs: удаляем все .codex-editor внутри.
 *  3) В cleanup — снова destroy() и очистка контейнера.
 *
 * Ничего больше не трогаем: ваш API автосохранения и остальной код остаётся прежним.
 */

import { useEffect, useRef } from "react";
import type { OutputData } from "@editorjs/editorjs";

type Props = {
  initialData: OutputData;                 // данные для первой инициализации
  onChange: (data: OutputData) => void;    // колбэк изменений (родитель решает, что делать)
};

// объявим тип для глобального синглтона
declare global {
  interface Window {
    __editorjsInstance?: any;
  }
}

export default function EditorClient({ initialData, onChange }: Props) {
  const editorRef = useRef<any>(null);

  useEffect(() => {
    let canceled = false;

    (async () => {
      // Динамические импорты: только в браузере, исключаем SSR
      const EditorJS  = (await import("@editorjs/editorjs")).default;
      const Header    = (await import("@editorjs/header")).default;
      const List      = (await import("@editorjs/list")).default;
      const Checklist = (await import("@editorjs/checklist")).default;
      const Quote     = (await import("@editorjs/quote")).default;
      const Paragraph = (await import("@editorjs/paragraph")).default;

      // 0) Подготовим holder
      const holderEl = document.getElementById("editorjs");
      if (!holderEl) return;

      // 1) Если в window уже есть экземпляр Editor.js — уничтожаем
      if (window.__editorjsInstance && typeof window.__editorjsInstance.destroy === "function") {
        try { window.__editorjsInstance.destroy(); } catch {}
        window.__editorjsInstance = undefined;
      }

      // 2) На всякий случай удалим все следы предыдущей разметки Editor.js
      //    (если их оставил предыдущий экземпляр).
      try {
        const leftovers = holderEl.querySelectorAll(".codex-editor");
        leftovers.forEach((el) => el.remove());
        // и пустим сам контейнер
        holderEl.innerHTML = "";
      } catch {}

      // 3) Создаём новый экземпляр
      const editor = new EditorJS({
        holder: "editorjs",                 // оставляем как у вас
        data: initialData,
        placeholder: "Начните писать...",
        inlineToolbar: true,
        tools: {
          header: {
            class: Header,
            inlineToolbar: ["bold", "italic"],
            config: { levels: [1, 2, 3], defaultLevel: 2 },
          },
          list:      { class: List, inlineToolbar: true },
          checklist: { class: Checklist, inlineToolbar: true },
          quote: {
            class: Quote,
            inlineToolbar: true,
            config: {
              quotePlaceholder: "Введите цитату",
              captionPlaceholder: "Автор",
            },
          },
          paragraph: { class: Paragraph, inlineToolbar: true },
        },
        onChange: async () => {
          if (canceled) return;
          try {
            const content = await editor.save();
            onChange(content);
          } catch {
            /* ignore */
          }
        },
      });

      // 4) Сохраняем ссылки на инстанс — и в ref, и глобально (для защиты от дублей)
      editorRef.current = editor;
      window.__editorjsInstance = editor;
    })();

    // 5) Очистка при размонтировании
    return () => {
      canceled = true;

      // локальная ссылка
      if (editorRef.current && typeof editorRef.current.destroy === "function") {
        try { editorRef.current.destroy(); } catch {}
      }
      editorRef.current = null;

      // глобальная ссылка
      if (window.__editorjsInstance && typeof window.__editorjsInstance.destroy === "function") {
        try { window.__editorjsInstance.destroy(); } catch {}
      }
      window.__editorjsInstance = undefined;

      // подчистим контейнер
      const holderEl = document.getElementById("editorjs");
      if (holderEl) {
        try {
          const leftovers = holderEl.querySelectorAll(".codex-editor");
          leftovers.forEach((el) => el.remove());
          holderEl.innerHTML = "";
        } catch {}
      }
    };
    // Важно: [] — редактор создаётся один раз на монтирование
  }, []);

  return (
    <div
      id="editorjs"
      className="
        prose prose-neutral max-w-none
        min-h-[300px] p-4
        border border-gray-200 rounded-md
        bg-white
      "
    />
  );
}
