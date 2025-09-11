"use client";

/**
 * EditorClient — инициализация Editor.js на клиенте.
 *
 * Важные моменты:
 *  - Плагины Editor.js импортируются динамически внутри useEffect (исключает SSR-ошибки).
 *  - Редактор создаётся один раз на монтирование компонента (useEffect с пустым массивом зависимостей).
 *  - Все изменения отдаём наружу через onChange.
 */

import { useEffect, useRef } from "react";
import type { OutputData } from "@editorjs/editorjs";

type Props = {
  initialData: OutputData;                 // данные для первой инициализации
  onChange: (data: OutputData) => void;    // колбэк изменений (родитель решает, что делать)
};

export default function EditorClient({ initialData, onChange }: Props) {
  const editorRef = useRef<any>(null);

  useEffect(() => {
    let editor: any;

    (async () => {
      // Динамические импорты: только в браузере, исключаем SSR
      const EditorJS = (await import("@editorjs/editorjs")).default;
      const Header = (await import("@editorjs/header")).default;
      const List = (await import("@editorjs/list")).default;
      const Checklist = (await import("@editorjs/checklist")).default;
      const Quote = (await import("@editorjs/quote")).default;
      const Paragraph = (await import("@editorjs/paragraph")).default;

      editor = new EditorJS({
        holder: "editorjs",
        data: initialData,
        placeholder: "Начните писать...",
        inlineToolbar: true,
        tools: {
          header: {
            class: Header,
            inlineToolbar: ["bold", "italic"],
            config: { levels: [1, 2, 3], defaultLevel: 2 },
          },
          list: { class: List, inlineToolbar: true },
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
          if (!editor) return;
          const content = await editor.save();
          onChange(content);
        },
      });

      editorRef.current = editor;
    })();

    return () => {
      if (editorRef.current && typeof editorRef.current.destroy === "function") {
        editorRef.current.destroy();
      }
      editorRef.current = null;
    };
    // ВАЖНО: пустой массив — редактор инициализируется только один раз.
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
