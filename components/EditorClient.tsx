"use client";

/**
 * Компонент инициализации клиентского редактора Editor.js.
 *
 * Назначение и ключевые решения:
 *  1) Инициализация Editor.js выполняется только на клиенте (динамические импорты модулей).
 *  2) Контейнер редактора не имеет фиксированной минимальной высоты:
 *     область редактирования подстраивается под фактическое содержимое.
 *  3) Состав инструментов включает собственный инструмент «ToggleContainer»,
 *     обеспечивающий вложенный редактор (аналог «Toggle» в Notion).
 *  4) Все изменения содержимого передаются вызывающей стороне через колбэк onChange
 *     после получения структурированных данных (OutputData) методом editor.save().
 */

import { useEffect, useRef } from "react";
import type { OutputData } from "@editorjs/editorjs";

type Props = {
  /** Данные для первичной инициализации Editor.js (формат OutputData). */
  initialData: OutputData;
  /** Колбэк, вызываемый при изменении содержимого редактора. */
  onChange: (data: OutputData) => void;
};

export default function EditorClient({ initialData, onChange }: Props) {
  const editorRef = useRef<any>(null);

  useEffect(() => {
    let editor: any;

    (async () => {
      // Динамические импорты: исключают SSR и загружают плагины только в браузере.
      const EditorJS   = (await import("@editorjs/editorjs")).default;
      const Paragraph  = (await import("@editorjs/paragraph")).default;
      const Header     = (await import("@editorjs/header")).default;
      const List       = (await import("@editorjs/list")).default;
      const Quote = (await import("@/components/tools/QuoteNotion")).default;

      // ВАЖНО: подключение собственного инструмента «ToggleContainer»
      // (вложенный редактор с авто-высотой и заголовком рядом со стрелкой).
      const ToggleCont = (await import("@/components/tools/ToggleContainer")).default;

      editor = new EditorJS({
        /**
         * Идентификатор DOM-контейнера, в который Editor.js смонтирует интерфейс.
         * На странице используется один экземпляр редактора, идентификатор фиксированный.
         */
        holder: "editorjs",

        /** Исходные структурированные данные документа. */
        data: initialData,

        /** Подсказка для пустых параграфов. */
        placeholder: "Начните писать…",

        /** Включение всплывающей панели для инлайн-форматирования. */
        inlineToolbar: true,

        /**
         * Набор инструментов редактирования.
         * Подключены базовые блоки и собственный инструмент «toggle».
         */
        tools: {
          paragraph: { class: Paragraph, inlineToolbar: true },

          header: {
            class: Header,
            inlineToolbar: ["bold", "italic"],
            config: { levels: [1, 2, 3], defaultLevel: 2 },
          },

          // Списки (маркированный и нумерованный). Чек-лист вынесен отдельно при необходимости.
          list: {
            class: List,
            inlineToolbar: true,
            config: { defaultStyle: "unordered" },
          },

          quote: {
            class: Quote,
            inlineToolbar: true,
            config: {
              quotePlaceholder: "Введите цитату...",
              captionPlaceholder: "", // убираем автора
              disableCaption: true,   // блокируем появление поля автора
            },
          },

          // Собственный инструмент: вложенный редактор «Toggle» (аналог Notion).
          toggle: { class: ToggleCont, inlineToolbar: true },
        },

        /**
         * Колбэк изменений. Срабатывает при каждой модификации контента.
         * Гарантирует передачу вызывающей стороне валидного OutputData.
         */
        onChange: async () => {
          if (!editor) return;
          const data = await editor.save();
          onChange(data);
        },
      });

      editorRef.current = editor;
    })();

    /**
     * Корректное уничтожение экземпляра редактора при размонтировании компонента.
     * Предотвращает утечки ресурсов и дублирование экземпляров при повторном монтировании.
     */
    return () => {
      if (editorRef.current && typeof editorRef.current.destroy === "function") {
        editorRef.current.destroy();
      }
      editorRef.current = null;
    };
    // Пустой массив зависимостей гарантирует инициализацию Editor.js ровно один раз.
  }, []);

  return (
    <div
      id="editorjs"
      /**
       * Контейнер редактора без фиксированной минимальной высоты.
       * Базовые отступы подобраны для компактного отображения,
       * «лишний воздух» дополнительно убирается стилями в app/globals.css.
       */
      className="
        prose prose-neutral max-w-none
        p-0
        border border-gray-200 rounded-md
        bg-white
      "
    />
  );
}
