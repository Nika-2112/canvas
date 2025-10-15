"use client";

/**
 * Компонент инициализации клиентского редактора Editor.js.
 *
 * Назначение и ключевые решения:
 *  1) Инициализация Editor.js выполняется только на клиенте (динамические импорты модулей).
 *  2) Контейнер редактора не имеет фиксированной минимальной высоты:
 *     область редактирования подстраивается под фактическое содержимое.
 *  3) Состав инструментов включает собственный инструмент «ToggleContainer»
 *     (вложенный редактор, аналог «Toggle» в Notion),
 *     а также встроенный ниже вьювер-блок «child_page» для подстраниц (как в Notion).
 *  4) Все изменения содержимого передаются вызывающей стороне через колбэк onChange
 *     после получения структурированных данных (OutputData) методом editor.save().
 */



/**
 * Без изменений по API. Напоминание:
 * • Автосейв контента должен вызывать ТОЛЬКО PUT /api/pages/:id с { content }, без properties.
 *   Свойства теперь живут и сохраняются отдельно (см. PageProperties).
 */
import { useEffect, useRef } from "react";
import type { OutputData } from "@editorjs/editorjs";

type Props = { initialData: OutputData; onChange: (data: OutputData) => void };

/**
 * Вьювер-блок подстраницы (child_page) для Editor.js.
 *
 * Зачем:
 *  - Когда сервер создаёт подстраницу, он добавляет в конец контента родителя блок вида:
 *    { type: "child_page", data: { refId: "<id_подстраницы>" } }.
 *  - Этот класс отвечает за отображение такого блока «как в Notion» —
 *    иконка 📄 + актуальное название подстраницы, кликабельно.
 *
 * Важно:
 *  - Мы НЕ хотим, чтобы пользователь сам добавлял этот блок из тулбара.
 *    Поэтому здесь НЕТ статического геттера toolbox — Editor.js не будет показывать
 *    этот инструмент в плюс-меню. Блок появляется только программно.
 */
class ChildPageViewer {
  static get isReadOnlySupported() {
    return true;
  }

  private data: { refId?: string };

  constructor({ data }: { data: any }) {
    this.data = data || {};
  }

  render() {
    // Корневой элемент — <a>, ведущая на страницу-подстраницу.
    const link = document.createElement("a");
    link.href = this.data?.refId ? `/documents/${this.data.refId}` : "#";
    link.className =
      "block rounded-md border border-neutral-200 px-12 py-2 hover:bg-neutral-50 relative";

    // Иконка слева (визуально как Notion).
    const icon = document.createElement("span");
    icon.textContent = "📄";
    icon.style.position = "absolute";
    icon.style.left = "8px";
    icon.style.top = "50%";
    icon.style.transform = "translateY(-50%)";

    // Заголовок подстраницы (подтянем по API).
    const title = document.createElement("span");
    title.textContent = "Подстраница";
    title.className = "text-sm font-medium";

    // Подтягиваем актуальный заголовок по refId
    if (this.data?.refId) {
      fetch(`/api/pages/${this.data.refId}`)
        .then((r) => r.json())
        .then((p) => {
          if (p?.title) title.textContent = p.title;
        })
        .catch(() => {
          /* без шумных ошибок в UI */
        });
    }

    link.appendChild(icon);
    link.appendChild(title);
    return link;
  }

  save() {
    // Сохраняем исходные data блока без изменений.
    return this.data;
  }
}

export default function EditorClient({ initialData, onChange }: Props) {
  const editorRef = useRef<any>(null);

  useEffect(() => {
    let editor: any;

    (async () => {
      // Динамические импорты: исключают SSR и загружают плагины только в браузере.
      const EditorJS = (await import("@editorjs/editorjs")).default;
      const Paragraph = (await import("@editorjs/paragraph")).default;
      const Header = (await import("@editorjs/header")).default;
      const List = (await import("@editorjs/list")).default;
      const Quote = (await import("@/components/tools/QuoteNotion")).default;

      // ВАЖНО: собственный инструмент «ToggleContainer» (вложенный редактор)
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
         * Набор инструментов редактирования/просмотра.
         * Подключены базовые блоки, собственный toggle и вьювер подстраницы child_page.
         *
         * ВАЖНО: ChildPageViewer не имеет toolbox, поэтому НЕ появляется в плюс-меню
         * и не может быть добавлен пользователем вручную — только сервером.
         */
        tools: {
          paragraph: { class: Paragraph, inlineToolbar: true },

          header: {
            class: Header,
            inlineToolbar: ["bold", "italic"],
            config: { levels: [1, 2, 3], defaultLevel: 2 },
          },

          // Списки (маркированный и нумерованный). Чек-лист можно подключить отдельно.
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
              disableCaption: true, // блокируем появление поля автора
            },
          },

          // Собственный инструмент: вложенный редактор «Toggle» (аналог Notion).
          toggle: { class: ToggleCont, inlineToolbar: true },

          // Вьювер «подстраница» — отображает блок { type: "child_page", data: { refId } }.
          // Без toolbox => не виден в плюс-меню, но умеет отрисовываться и сохраняться.
          child_page: {
            class: ChildPageViewer as any,
            inlineToolbar: false,
          },
        },

        /**
         * Колбэк изменений. Срабатывает при каждой модификации контента.
         * Гарантирует передачу вызывающей стороне валидного OutputData.
         */
        onChange: async () => {
          if (!editor) return;
          try {
            const data = (await editor.save()) as OutputData;
            onChange(data);
          } catch {
            // защищаемся от редких ошибок сборки документа
          }
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
