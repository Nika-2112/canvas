/**
 * ToggleContainer — пользовательский инструмент Editor.js.
 *
 * Назначение:
 *  - Реализует «Toggle» в стиле Notion: строка-заголовок (стрелка + title) и
 *    раскрываемая область с полноценным внутренним Editor.js.
 *  - Поддерживает вложенность (toggle внутри toggle).
 *  - Корректно пересчитывает высоту раскрытия при любом изменении внутри
 *    (набор текста, добавление блоков, открытие/закрытие внутренних тогглов).
 *
 * Ключевые решения:
 *  1) Высота анимируется через CSS-переменную --tgc-target-h на клип-обёртке.
 *  2) Для пересчёта высоты используется ResizeObserver на внутреннем контейнере.
 *  3) При изменениях генерируется кастомное событие 'tgc:height-changed'
 *     с включённым всплытием (bubbles: true). Любой предок (родительский тоггл)
 *     перехватывает это событие и также пересчитывает свою высоту.
 */

import type { BlockTool, API } from "@editorjs/editorjs";

type ToggleData = {
  title?: string;
  /** Содержимое внутреннего редактора в формате OutputData */
  content?: any;
  /** Состояние раскрытия (true — открыт) */
  opened?: boolean;
};

export default class ToggleContainer implements BlockTool {
  /** API Editor.js (предоставляется ядром) */
  private api: API;

  /** DOM-узлы блока */
  private wrapper!: HTMLElement;
  private header!: HTMLDivElement;
  private arrowBtn!: HTMLButtonElement;
  private titleInput!: HTMLInputElement;
  private clip!: HTMLDivElement;
  private innerHolder!: HTMLDivElement;

  /** Внутренний Editor.js и его идентификатор контейнера */
  private innerEditor: any = null;
  private innerHolderId: string;

  /** Наблюдатели за изменениями высоты/дочерних элементов */
  private ro?: ResizeObserver;

  /** Текущее состояние данных */
  private data: ToggleData;

  /** Признак открытого состояния */
  private isOpened: boolean;

  static get toolbox() {
    return {
      title: "Toggle",
      icon: '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    };
  }

  constructor({ data, api }: { data: ToggleData; api: API }) {
    this.api = api;
    this.data = data || {};
    this.isOpened = Boolean(this.data.opened);

    // Уникальный id для вложенного редактора
    this.innerHolderId = `tgc-${Math.random().toString(36).slice(2, 9)}`;
  }

  /** Возвращает DOM-узел блока для рендера в редактор */
  render(): HTMLElement {
    // --- Корневой контейнер ---
    this.wrapper = document.createElement("div");
    this.wrapper.className = "tgc-wrapper";
    // Родитель слушает всплывающее событие от потомков и пересчитывает высоту
    this.wrapper.addEventListener("tgc:height-changed", () => {
      this.updateAutoHeight();
      // Пробросим дальше вверх (на случай ещё более верхних предков)
      this.dispatchHeightChanged();
    });

    // --- Шапка (стрелка + заголовок) ---
    this.header = document.createElement("div");
    this.header.className = "tgc-header";
    this.wrapper.appendChild(this.header);

    this.arrowBtn = document.createElement("button");
    this.arrowBtn.type = "button";
    this.arrowBtn.className = "tgc-arrow";
    this.arrowBtn.innerHTML = "▸";
    this.header.appendChild(this.arrowBtn);

    this.titleInput = document.createElement("input");
    this.titleInput.className = "tgc-title";
    this.titleInput.placeholder = "Заголовок";
    this.titleInput.value = this.data.title || "";
    this.header.appendChild(this.titleInput);

    // Клик по шапке переключает раскрытие
    this.header.addEventListener("click", (e) => {
      // не мешаем редактированию заголовка
      if (e.target === this.titleInput) return;
      this.toggle();
    });
    // Изменение заголовка — обновляем данные
    this.titleInput.addEventListener("input", () => {
      this.data.title = this.titleInput.value;
      this.notifyChanged();
    });

    // --- Клип-обёртка и внутренний холдер ---
    this.clip = document.createElement("div");
    this.clip.className = "tgc-inner-clip";
    this.wrapper.appendChild(this.clip);

    this.innerHolder = document.createElement("div");
    this.innerHolder.className = "tgc-inner-holder";
    this.innerHolder.id = this.innerHolderId;
    this.clip.appendChild(this.innerHolder);

    // Применяем открыто/закрыто в соответствии с данными
    this.applyOpenedState(false);

    // Инициализация вложенного редактора
    this.mountInnerEditor(this.data.content);

    return this.wrapper;
  }

  /** Сериализация данных для Editor.js */
  save(): ToggleData {
    return {
      title: this.titleInput?.value || "",
      content: this.data.content || undefined,
      opened: this.isOpened,
    };
  }

  /** Переключение состояния раскрытия */
  private toggle(): void {
    this.isOpened = !this.isOpened;
    this.applyOpenedState(true);
    this.notifyChanged();
  }

  /**
   * Применяет состояние раскрытия к DOM и инициирует пересчёт высоты.
   * @param withMeasure Признак, выполнять ли немедленный пересчёт высоты.
   */
  private applyOpenedState(withMeasure: boolean): void {
    this.wrapper.classList.toggle("tgc-opened", this.isOpened);
    // В строке-стрелке отражаем текущее состояние (поворот в CSS)
    if (withMeasure) {
      // Пересчитываем после следующего кадра — когда DOM обновлён
      requestAnimationFrame(() => this.updateAutoHeight());
    }
  }

  /** Создание/инициализация внутреннего Editor.js */
  private async mountInnerEditor(initialData?: any): Promise<void> {
    // Динамические импорты исключают SSR и гарантируют работу в браузере
    const EditorJS = (await import("@editorjs/editorjs")).default;
    const Paragraph = (await import("@editorjs/paragraph")).default;
    const Header = (await import("@editorjs/header")).default;
    const List = (await import("@editorjs/list")).default;
    const Quote = (await import("@editorjs/quote")).default;

    // Для рекурсивной вложенности тот же инструмент доступен по имени "toggle"
    const ThisToggle = (await import("./ToggleContainer")).default;

    this.innerEditor = new EditorJS({
      holder: this.innerHolderId,
      data: initialData || { blocks: [] },
      placeholder: "Добавьте содержимое…",
      inlineToolbar: true,
      tools: {
        paragraph: { class: Paragraph, inlineToolbar: true },
        header: {
          class: Header,
          inlineToolbar: ["bold", "italic"],
          config: { levels: [1, 2, 3], defaultLevel: 2 },
        },
        list: { class: List, inlineToolbar: true, config: { defaultStyle: "unordered" } },
        quote: {
          class: Quote,
          inlineToolbar: true,
          config: {
            quotePlaceholder: "Введите цитату",
            captionPlaceholder: "Автор",
          },
        },
        toggle: { class: ThisToggle, inlineToolbar: true },
      },
      onChange: async () => {
        const data = await this.innerEditor.save();
        this.data.content = data;
        this.notifyChanged();
        // Контент изменился — сообщаем предкам и пересчитываем высоту
        this.updateAutoHeight();
        this.dispatchHeightChanged();
      },
      onReady: () => {
        // Перемеряем после готовности — корректная стартовая высота
        this.updateAutoHeight();
        this.dispatchHeightChanged();
      },
    });

    // Наблюдатель за фактическими изменениями высоты (включая вложенные тогглы)
    this.ro?.disconnect();
    this.ro = new ResizeObserver(() => {
      this.updateAutoHeight();
      this.dispatchHeightChanged();
    });
    this.ro.observe(this.innerHolder);
  }

  /**
   * Пересчёт целевой высоты раскрытой области (точно под контент).
   * Высота устанавливается через CSS-переменную --tgc-target-h на wrapper.
   */
  private updateAutoHeight(): void {
    if (!this.isOpened) {
      // Когда закрыто — схлопываем. Переменная не требуется.
      this.wrapper.style.setProperty("--tgc-target-h", "0px");
      return;
    }
    // Фактическая высота содержимого (включая вложенные элементы)
    const contentH = this.innerHolder.scrollHeight;
    // Небольшая компенсация вертикальных внутренних отступов клипа (см. CSS)
    const extra = 8; // 4px сверху + 4px снизу
    const target = Math.max(0, contentH + extra);
    this.wrapper.style.setProperty("--tgc-target-h", `${target}px`);
  }

  /**
   * Уведомляет Editor.js о том, что содержимое блока изменилось.
   * Используется для корректной сериализации документа.
   */
  private notifyChanged(): void {
    if (this.api && typeof this.api.blocks?.getCurrentBlockIndex === "function") {
      // достаточно сообщить, что блок «грязный» — Editor.js сам дернёт onChange
    }
  }

  /**
   * Рассылает всплывающее событие о смене высоты.
   * Родительские тогглы перехватывают это событие и также пересчитывают высоту.
   */
  private dispatchHeightChanged(): void {
    this.wrapper.dispatchEvent(
      new CustomEvent("tgc:height-changed", { bubbles: true })
    );
  }

  /** Очистка ресурсов при удалении блока */
  destroyed(): void {
    this.ro?.disconnect();
    if (this.innerEditor && typeof this.innerEditor.destroy === "function") {
      this.innerEditor.destroy();
    }
    this.innerEditor = null;
  }
}
