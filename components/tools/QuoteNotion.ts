/**
 * QuoteNotion — надстройка над @editorjs/quote:
 *  - заменяет настройки выравнивания на "Quote size: Default / Large";
 *  - сохраняет выбранный размер в data.size;
 *  - применяет CSS-класс для крупного варианта.
 *
 * Внешний вид меню настроек приведён к стилю Editor.js
 * (иконка + подпись, аккуратные кнопки).
 */

import Quote from "@editorjs/quote";

type QuoteData = {
  text?: string;
  caption?: string;
  alignment?: string; // унаследованное поле, игнорируем
  size?: "default" | "large";
};

export default class QuoteNotion extends Quote {
  /** Человекочитаемое имя и иконка в тулбоксе */
  static get toolbox() {
    return {
      title: "Quote",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none"
        viewBox="0 0 24 24" aria-hidden="true">
        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M10 10.8H9c-.2 0-.4-.04-.6-.14a1 1 0 0 1-.42-.4 1 1 0 0 1-.06-.53c.04-.18.13-.34.28-.47.14-.13.32-.21.5-.24.19-.04.39-.02.57.05.19.07.35.18.46.33.12.15.18.32.18.5v2.3c0 .46-.21.92-.58 1.27-.37.35-.87.53-1.4.53M16 10.8h-1c-.2 0-.4-.04-.6-.14a1 1 0 0 1-.42-.4 1 1 0 0 1-.06-.53c.04-.18.13-.34.28-.47.14-.13.32-.21.5-.24.19-.04.39-.02.57.05.19.07.35.18.46.33.12.15.18.32.18.5v2.3c0 .46-.21.92-.58 1.27-.37.35-.87.53-1.4.53"/>
      </svg>`,
    };
  }

  /** Текущие данные плагина */
  get data(): QuoteData {
    // @ts-ignore родитель хранит данные здесь
    return super.data as QuoteData;
  }
  set data(val: QuoteData) {
    // @ts-ignore
    super.data = val as any;
  }

  /** Рендерим контент блока и сразу применяем размер */
  render(): HTMLElement {
    const el = super.render();
    this._element = el;
    this._applySizeClass();
    return el;
  }

  /** Сохраняем обычные поля + нашу настройку size */
  save(blockContent: HTMLElement) {
    const saved = super.save(blockContent) as QuoteData;
    return {
      ...saved,
      size: this.data?.size || "default",
    };
  }

  /**
   * Панель «Click to tune»: две аккуратные кнопки, как в Editor.js,
   * с иконками и подписью.
   */
  renderSettings(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.classList.add("cdx-settings", "qn-settings"); // qn-* — неймспейс проекта

    // Заголовок секции (маленький)
    const title = document.createElement("div");
    title.classList.add("qn-settings__title");
    title.textContent = "Quote size";
    wrap.appendChild(title);

    type Opt = { name: "default" | "large"; label: string; icon: string };
    const opts: Opt[] = [
      {
        name: "default",
        label: "Default",
        icon:
          // мелкая кавычка
          `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M9 11h1v2H9a2 2 0 1 1 0-4h1v2H9zm6 0h1v2h-1a2 2 0 1 1 0-4h1v2h-1z"
              fill="currentColor"/>
          </svg>`,
      },
      {
        name: "large",
        label: "Large",
        icon:
          // крупнее и толще
          `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M8.5 10H11v3H8.5A2.5 2.5 0 1 1 8.5 10Zm7 0H18v3h-2.5A2.5 2.5 0 1 1 15.5 10Z"
              fill="currentColor"/>
          </svg>`,
      },
    ];

    const group = document.createElement("div");
    group.classList.add("qn-settings__group");

    opts.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.classList.add("cdx-settings-button", "qn-size-option");

      // активное состояние
      const current = this.data?.size || "default";
      if (current === opt.name) btn.classList.add("cdx-settings-button--active");

      // содержимое кнопки (иконка + текст)
      btn.innerHTML = `
        <span class="qn-size-option__icon">${opt.icon}</span>
        <span class="qn-size-option__label">${opt.label}</span>
      `;

      btn.addEventListener("click", () => {
        this.data = { ...this.data, size: opt.name };
        this._applySizeClass();

        // переключаем активность визуально
        group
          .querySelectorAll(".qn-size-option")
          .forEach((el) => el.classList.remove("cdx-settings-button--active"));
        btn.classList.add("cdx-settings-button--active");
      });

      group.appendChild(btn);
    });

    wrap.appendChild(group);
    return wrap;
  }

  /** Применяем CSS-класс для варианта Large */
  private _applySizeClass(): void {
    if (!this._element) return;
    if ((this.data?.size || "default") === "large") {
      this._element.classList.add("cdx-quote--large");
    } else {
      this._element.classList.remove("cdx-quote--large");
    }
  }

  // внутренний указатель на элемент блока
  private _element?: HTMLElement;
}
