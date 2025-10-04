/**
 * ToggleLite — лёгкий toggle-блок для Editor.js
 * Цели:
 *  - Заголовок рядом со стрелкой (как в Notion).
 *  - Открытие/закрытие контента.
 *  - Кнопка "Вставить блок ниже" в настройках (renderSettings) — гарантирует вставку после тоггла.
 *
 * Данные блока:
 * {
 *   title: string;
 *   message: string;
 *   opened: boolean;
 * }
 */

type ToggleLiteData = {
  title?: string;
  message?: string;
  opened?: boolean;
};

export default class ToggleLite {
  static get toolbox() {
    return {
      title: "Toggle",
      icon: `<svg width="20" height="20" viewBox="0 0 24 24"><path d="M10 15l5-5-5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    };
  }

  private data: ToggleLiteData;
  private wrapper!: HTMLDivElement;
  private titleInput!: HTMLInputElement;
  private arrowBtn!: HTMLButtonElement;
  private contentArea!: HTMLTextAreaElement;

  private api: any; // EditorJS API
  private blockIndex = 0;

  constructor({ data, api }: { data: ToggleLiteData; api: any }) {
    this.api = api;
    this.data = {
      title: data?.title || "",
      message: data?.message || "",
      opened: typeof data?.opened === "boolean" ? data.opened : false,
    };
  }

  /** Рендер основного контента блока */
  render() {
    this.wrapper = document.createElement("div");
    this.wrapper.className = "tl-wrapper";

    // шапка: стрелка + инпут заголовка
    const header = document.createElement("div");
    header.className = "tl-header";

    this.arrowBtn = document.createElement("button");
    this.arrowBtn.type = "button";
    this.arrowBtn.className = "tl-arrow";
    this.arrowBtn.setAttribute("aria-label", "Toggle");
    this.arrowBtn.innerHTML = this.data.opened ? "▾" : "▸";
    this.arrowBtn.addEventListener("click", () => this.toggle());

    this.titleInput = document.createElement("input");
    this.titleInput.className = "tl-title";
    this.titleInput.placeholder = "Заголовок";
    this.titleInput.value = this.data.title || "";
    this.titleInput.addEventListener("input", () => {
      this.data.title = this.titleInput.value;
    });

    header.appendChild(this.arrowBtn);
    header.appendChild(this.titleInput);

    // содержимое
    const contentWrap = document.createElement("div");
    contentWrap.className = "tl-content";

    this.contentArea = document.createElement("textarea");
    this.contentArea.className = "tl-textarea";
    this.contentArea.placeholder = "Текст внутри блока";
    this.contentArea.value = this.data.message || "";
    this.contentArea.addEventListener("input", () => {
      this.data.message = this.contentArea.value;
    });

    contentWrap.appendChild(this.contentArea);

    this.wrapper.appendChild(header);
    this.wrapper.appendChild(contentWrap);

    this.applyOpenedState();

    // Рассчитываем индекс блока (нужен для вставки «после»)
    setTimeout(() => {
      const { blocks } = this.api;
      const nodes = blocks.getBlocksCount();
      // найдём себя по DOM (приблизительно)
      for (let i = 0; i < nodes; i++) {
        const holder = blocks.getBlockByIndex(i)?.holder;
        if (holder && holder.contains(this.wrapper)) {
          this.blockIndex = i;
          break;
        }
      }
    });

    return this.wrapper;
  }

  /** Кнопки в «шестерёнке» (renderSettings) */
  renderSettings() {
    const wrapper = document.createElement("div");
    wrapper.className = "tl-settings";

    // Кнопка "Вставить блок ниже"
    const insertBelowBtn = document.createElement("div");
    insertBelowBtn.className = "tl-settings__btn";
    insertBelowBtn.innerText = "Вставить блок ниже";
    insertBelowBtn.addEventListener("click", () => {
      const idx = this.getCurrentIndex();
      this.api.blocks.insert("paragraph", {}, undefined, idx + 1, true);
      this.api.toolbar.close(); // закрыть тулбар
    });

    // Кнопка «Открыть/закрыть»
    const toggleBtn = document.createElement("div");
    toggleBtn.className = "tl-settings__btn";
    toggleBtn.innerText = this.data.opened ? "Свернуть" : "Развернуть";
    toggleBtn.addEventListener("click", () => {
      this.data.opened = !this.data.opened;
      this.applyOpenedState();
      toggleBtn.innerText = this.data.opened ? "Свернуть" : "Развернуть";
    });

    wrapper.appendChild(insertBelowBtn);
    wrapper.appendChild(toggleBtn);

    return wrapper;
  }

  /** Сохранение данных */
  save() {
    return {
      title: this.titleInput?.value || "",
      message: this.contentArea?.value || "",
      opened: this.data.opened ?? false,
    };
  }

  /** Получить реальный индекс блока (если блоки менялись) */
  private getCurrentIndex() {
    const { blocks } = this.api;
    const cnt = blocks.getBlocksCount();
    for (let i = 0; i < cnt; i++) {
      const holder = blocks.getBlockByIndex(i)?.holder;
      if (holder && holder.contains(this.wrapper)) {
        return i;
      }
    }
    return this.blockIndex;
  }

  /** Переключить состояние открыто/закрыто */
  private toggle() {
    this.data.opened = !this.data.opened;
    this.applyOpenedState();
  }

  /** Применить классы и символ стрелки */
  private applyOpenedState() {
    if (!this.wrapper) return;
    if (this.data.opened) {
      this.wrapper.classList.add("tl-opened");
      this.arrowBtn.innerHTML = "▾";
    } else {
      this.wrapper.classList.remove("tl-opened");
      this.arrowBtn.innerHTML = "▸";
    }
  }
}
