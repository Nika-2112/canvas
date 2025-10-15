/**
 * ChildPageTool — Viewer-инструмент Editor.js для блока "child_page".
 * Показывает иконку 📄 и загрузит актуальный заголовок подстраницы.
 * Используется только в режиме просмотра/редактирования (без добавления пользователем вручную).
 */
export default class ChildPageTool {
  // Разрешить работу в read-only
  static get isReadOnlySupported() { return true; }

  // Если не хочешь показывать этот инструмент в тулбаре — не подключай его туда.
  static get toolbox() { return { title: 'Child page', icon: '📄' }; }

  private data: { refId?: string };

  constructor({ data }: { data: any }) {
    this.data = data || {};
  }

  render() {
    const link = document.createElement('a');
    link.href = this.data?.refId ? `/documents/${this.data.refId}` : '#';
    link.className = 'block rounded-md border border-neutral-200 px-12 py-2 hover:bg-neutral-50 relative';

    const icon = document.createElement('span');
    icon.textContent = '📄';
    icon.style.position = 'absolute';
    icon.style.left = '8px';

    const title = document.createElement('span');
    title.textContent = 'Подстраница';
    title.className = 'text-sm font-medium';

    // Тянем актуальный заголовок со стороны API
    if (this.data?.refId) {
      fetch(`/api/pages/${this.data.refId}`)
        .then(r => r.json())
        .then(p => { if (p?.title) title.textContent = p.title; })
        .catch(() => {});
    }

    link.appendChild(icon);
    link.appendChild(title);
    return link;
  }

  save() {
    // Сохраняем как есть (сервер управляет вставкой, пользователь не редактирует).
    return this.data;
  }
}
