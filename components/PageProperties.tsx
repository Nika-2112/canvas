// /canvas/components/PageProperties.tsx
"use client";

/**
 * Панель «Свойства страницы» — Notion-подобная реализация.
 *
 * Изменения (для диплома):
 * • РАНЬШЕ: компонент не сохранял сам — родитель делал единый PUT /api/pages/:id и часто шёл конфликт с автосейвом контента.
 * • ТЕПЕРЬ: компонент сохраняет СВОИ свойства сам, дебаунсом PUT → /api/pages/:id/properties (см. backend).
 *   Это устраняет гонки «контент vs свойства» и 400/409.
 * • Внешние колбэки onLoaded/onChange/onDirty оставлены для обратной совместимости.
 *
 * Поведение:
 * • Любое локальное изменение (добавление/редактирование/перемещение/удаление) → оптимистичное обновление + дебаунс-сохранение.
 * • Типы: text | status | date. Формат value:
 *    - text   : string
 *    - status : string ("Не начато" | "В работе" | "Готово")
 *    - date   : { start: string; end?: string | null } // ISO 'YYYY-MM-DD'
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

export type PropType = "text" | "status" | "date";
export type PropItem = { id: string; name: string; type: PropType; value: any };

type Props = {
  pageId: string;
  onLoaded?: (items: PropItem[]) => void;
  onChange?: (items: PropItem[]) => void;
  onDirty?: () => void;
};

function uid() {
  return "p_" + Math.random().toString(36).slice(2, 9);
}

/** Дебаунсер для авто-сохранения */
function useDebouncedSaver(delay = 600) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = (fn: () => void) => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(fn, delay);
  };
  const cancel = () => {
    if (t.current) clearTimeout(t.current);
    t.current = null;
  };
  useEffect(() => cancel, []);
  return { run, cancel };
}

const STATUS_OPTIONS = [
  { id: "todo", label: "Не начато", className: "bg-gray-100 text-gray-700" },
  { id: "doing", label: "В работе", className: "bg-blue-100 text-blue-700" },
  { id: "done", label: "Готово", className: "bg-green-100 text-green-700" },
];

function fmt(d: string | undefined | null) {
  if (!d) return "";
  try {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}
function fmtDateValue(val: any): string {
  if (!val || !val.start) return "Пусто";
  return val.end ? `${fmt(val.start)} — ${fmt(val.end)}` : fmt(val.start);
}

function StatusPill({ value }: { value: string }) {
  const opt = STATUS_OPTIONS.find((o) => o.label === value) || STATUS_OPTIONS[0];
  return <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded ${opt.className}`}>{opt.label}</span>;
}

const PageProperties = React.memo(function PageProperties({ pageId, onLoaded, onChange, onDirty }: Props) {
  const [items, setItems] = useState<PropItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"idle" | "dirty" | "saving" | "error">("idle");

  // UI-мелочи
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingValueId, setEditingValueId] = useState<string | null>(null);
  const [menuAt, setMenuAt] = useState<{ id: string; x: number; y: number } | null>(null);
  const [paletteAt, setPaletteAt] = useState<{ x: number; y: number } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // колбэки наружу — через ref, чтобы не дергать мемоизацию
  const cbLoadedRef = useRef(onLoaded);
  const cbChangeRef = useRef(onChange);
  const cbDirtyRef = useRef(onDirty);
  useEffect(() => { cbLoadedRef.current = onLoaded; }, [onLoaded]);
  useEffect(() => { cbChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { cbDirtyRef.current  = onDirty;  }, [onDirty]);

  // ===== загрузка свойств =====
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!pageId) { setItems([]); setLoading(false); return; }
      setLoading(true);
      try {
        const r = await fetch(`/api/pages/${encodeURIComponent(pageId)}/properties`, { cache: "no-store" });
        const data = await r.json();
        if (!alive) return;
        const initial: PropItem[] = Array.isArray(data) ? data : [];
        setItems(initial);
        cbLoadedRef.current?.(initial);
        cbChangeRef.current?.(initial);
        setSaving("idle");
      } catch {
        if (!alive) return;
        setItems([]);
        cbLoadedRef.current?.([]);
        cbChangeRef.current?.([]);
        setSaving("error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [pageId]);

  // ===== авто-сохранение (PUT /api/pages/:id/properties) =====
  const saver = useDebouncedSaver(600);
  const saveNow = async (payload: PropItem[]) => {
    if (!pageId) return;
    setSaving("saving");
    try {
      const r = await fetch(`/api/pages/${encodeURIComponent(pageId)}/properties`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      setSaving("idle");
    } catch {
      setSaving("error");
    }
  };

  const apply = (next: PropItem[]) => {
    setItems(next);
    setSaving("dirty");
    cbChangeRef.current?.(next);
    cbDirtyRef.current?.();
    // дебаунс-сейв полной коллекции свойств
    saver.run(() => saveNow(next));
  };

  // ===== палитра типов =====
  type PropTypeDef = { type: PropType; title: string; desc: string; icon: string };
  const palette: PropTypeDef[] = useMemo(
    () => [
      { type: "text",   title: "Текст",   desc: "Обычная строка",        icon: "📝" },
      { type: "status", title: "Статус",  desc: "Не начато, В работе…",  icon: "✅" },
      { type: "date",   title: "Дата",    desc: "Дата/диапазон дат",     icon: "📅" },
    ],
    []
  );
  function openPalette(e: React.MouseEvent) { e.preventDefault(); setPaletteAt({ x: e.clientX + 4, y: e.clientY + 8 }); }
  function closePalette() { setPaletteAt(null); }

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (paletteAt && paletteRef.current && !paletteRef.current.contains(t)) setPaletteAt(null);
      if (menuAt && menuRef.current && !menuRef.current.contains(t)) setMenuAt(null);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") { setPaletteAt(null); setMenuAt(null); } };
    const onScroll = () => { setPaletteAt(null); setMenuAt(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [paletteAt, menuAt]);

  function addTyped(type: PropType) {
    closePalette();
    const newItem: PropItem =
      type === "text"
        ? { id: uid(), name: "Текст", type, value: "" }
        : type === "status"
        ? { id: uid(), name: "Статус", type, value: STATUS_OPTIONS[0].label }
        : { id: uid(), name: "Дата", type, value: { start: new Date().toISOString().slice(0, 10), end: null } };

    apply([...items, newItem]);
    requestAnimationFrame(() => setEditingValueId(newItem.id));
  }

  // ===== CRUD/упорядочивание =====
  const removeItem = (id: string) => { apply(items.filter((x) => x.id !== id)); setMenuAt(null); };
  const moveUp = (id: string) => {
    const i = items.findIndex((x) => x.id === id); if (i <= 0) return;
    const copy = items.slice(); const [m] = copy.splice(i, 1); copy.splice(i - 1, 0, m); apply(copy); setMenuAt(null);
  };
  const moveDown = (id: string) => {
    const i = items.findIndex((x) => x.id === id); if (i < 0 || i === items.length - 1) return;
    const copy = items.slice(); const [m] = copy.splice(i, 1); copy.splice(i + 1, 0, m); apply(copy); setMenuAt(null);
  };
  const rename  = (id: string, name: string) => apply(items.map((x) => (x.id === id ? { ...x, name } : x)));
  const setValue = (id: string, value: any) => apply(items.map((x) => (x.id === id ? { ...x, value } : x)));

  // ===== dnd =====
  const dragFrom = useRef<string | null>(null);
  const onDragStartHandle = (e: React.DragEvent, id: string) => {
    dragFrom.current = id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id);
    const el = (e.target as HTMLElement).closest("li"); if (el) e.dataTransfer.setDragImage(el, 20, 16);
  };
  const onDragEnterRow = (id: string) => { if (dragFrom.current && dragFrom.current !== id) setDragOverId(id); };
  const onDragEnd = () => { dragFrom.current = null; setDragOverId(null); };
  const onDropRow = (targetId: string) => {
    const from = dragFrom.current; dragFrom.current = null; setDragOverId(null);
    if (!from || from === targetId) return;
    const a = items.findIndex((x) => x.id === from); const b = items.findIndex((x) => x.id === targetId);
    if (a < 0 || b < 0) return;
    const copy = items.slice(); const [m] = copy.splice(a, 1); copy.splice(b, 0, m); apply(copy);
  };

  const autoresize = (el: HTMLTextAreaElement | null) => {
    if (!el) return; el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`;
  };

  function Row({ p }: { p: PropItem }) {
    const [openStatus, setOpenStatus] = useState(false);
    const [openDate, setOpenDate] = useState(false);
    const isFocused = focusedRowId === p.id;
    const onFocusIn  = () => setFocusedRowId(p.id);
    const onFocusOut = () =>
      setTimeout(() => {
        const stillInside = rootRef.current?.querySelector(`[data-row="${p.id}"]`)?.contains(document.activeElement as Node);
        if (!stillInside) setFocusedRowId((prev) => (prev === p.id ? null : prev));
      }, 0);

    return (
      <li
        className={`ce-block pp-row group ${isFocused ? "pp-focused" : ""} ${dragOverId === p.id ? "bg-gray-50 border border-gray-300" : ""}`}
        data-row={p.id}
        onDragEnter={() => onDragEnterRow(p.id)}
        onDragOver={(e) => e.preventDefault()}
        onDragEnd={onDragEnd}
        onDrop={() => onDropRow(p.id)}
        onContextMenu={(e) => { e.preventDefault(); setMenuAt({ id: p.id, x: e.clientX, y: e.clientY }); }}
        onFocusCapture={onFocusIn}
        onBlurCapture={onFocusOut}
      >
        <div className="pp-gutter">
          <button className="pp-g-btn pp-g-drag" title="Перетащить" draggable onDragStart={(e) => onDragStartHandle(e, p.id)}>
            ⋮⋮
          </button>
        </div>

        <div className="ce-block__content">
          <div className="grid grid-cols-[240px_minmax(0,1fr)] items-start gap-3 px-1 py-1.5">
            {/* Имя свойства */}
            {editingNameId === p.id ? (
              <input
                className="w-56 rounded-md border px-2 py-1 text-sm focus:border-gray-400 outline-none"
                defaultValue={p.name}
                autoFocus
                onBlur={(e) => { rename(p.id, e.currentTarget.value.trim() || "Без названия"); setEditingNameId(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { rename(p.id, (e.currentTarget as HTMLInputElement).value.trim() || "Без названия"); setEditingNameId(null); }
                  if (e.key === "Escape") setEditingNameId(null);
                }}
              />
            ) : (
              <button className="text-[14px] text-gray-700 text-left hover:underline truncate" onClick={() => setEditingNameId(p.id)}>
                {p.name || "Без названия"}
              </button>
            )}

            {/* Значение по типу */}
            {p.type === "text" && (
              <>
                {editingValueId === p.id ? (
                  <textarea
                    className="w-full rounded-md border px-2 py-1 text-sm focus:border-gray-400 outline-none resize-none overflow-hidden whitespace-pre-wrap break-words"
                    defaultValue={p.value ?? ""} rows={1} autoFocus ref={(el) => autoresize(el)}
                    onInput={(e) => autoresize(e.currentTarget)}
                    onBlur={(e) => { setValue(p.id, e.currentTarget.value); setEditingValueId(null); }}
                    onKeyDown={(e) => { if (e.key === "Escape") { setEditingValueId(null); e.preventDefault(); } }}
                    placeholder="Пусто"
                  />
                ) : (
                  <button
                    className={"text-left w-full px-2 py-1 rounded whitespace-pre-wrap break-words " + ((p.value ?? "") === "" ? "text-gray-400" : "text-gray-800")}
                    onClick={() => setEditingValueId(p.id)}
                  >
                    {(p.value ?? "") === "" ? "Пусто" : String(p.value)}
                  </button>
                )}
              </>
            )}

            {p.type === "status" && (
              <div className="relative">
                <button className="inline-flex items-center gap-2 px-2 py-1 border rounded hover:bg-gray-50" onClick={() => setOpenStatus((v) => !v)}>
                  <StatusPill value={p.value} />
                </button>
                {openStatus && (
                  <div className="absolute z-[220] mt-1 w-48 rounded-lg border bg-white shadow">
                    {STATUS_OPTIONS.map((o) => (
                      <button
                        key={o.id} className="w-full text-left px-3 py-2 hover:bg-gray-50"
                        onClick={() => { setValue(p.id, o.label); setOpenStatus(false); }}
                      >
                        <span
                          className={`mr-2 inline-block w-2 h-2 rounded-full align-middle ${
                            o.id === "todo" ? "bg-gray-400" : o.id === "doing" ? "bg-blue-500" : "bg-green-500"
                          }`}
                        />
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {p.type === "date" && (
              <div className="relative">
                <button className="text-left w-full px-2 py-1 rounded hover:bg-gray-50" onClick={() => setOpenDate((v) => !v)}>
                  {fmtDateValue(p.value)}
                </button>
                {openDate && (
                  <div className="absolute z-[220] mt-1 w-72 rounded-lg border bg-white shadow p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-gray-500">Начало</label>
                      <input
                        type="date" className="border rounded px-2 py-1 text-sm"
                        defaultValue={p.value?.start ?? new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setValue(p.id, { start: e.currentTarget.value, end: p.value?.end ?? null })}
                      />
                      <label className="text-xs text-gray-500">Окончание</label>
                      <input
                        type="date" className="border rounded px-2 py-1 text-sm"
                        value={p.value?.end ?? ""} onChange={(e) => setValue(p.id, { start: p.value?.start ?? new Date().toISOString().slice(0, 10), end: e.currentTarget.value || null })}
                      />
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button className="text-sm px-3 py-1 rounded border" onClick={() => setOpenDate(false)}>Готово</button>
                      <button className="text-sm px-3 py-1 rounded border" onClick={() => { setValue(p.id, { start: null, end: null }); setOpenDate(false); }}>
                        Очистить
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </li>
    );
  }

  function ContextMenu() {
    if (!menuAt) return null;
    const { id, x, y } = menuAt;
    return (
      <div
        ref={menuRef}
        className="fixed z-[220] min-w-[220px] rounded-lg border border-gray-200 bg-white shadow-lg ce-popover"
        style={{ left: x + 6, top: y + 6 }}
        role="menu"
      >
        <div className="px-2 py-2">
          <div className="text-xs text-gray-500 px-2 pb-1">Действия</div>
          <button className="menu-item" onClick={() => { setEditingNameId(id); setMenuAt(null); }}>Переименовать</button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => moveUp(id)}>Переместить вверх</button>
          <button className="menu-item" onClick={() => moveDown(id)}>Переместить вниз</button>
          <div className="menu-sep" />
          <button className="menu-item danger" onClick={() => removeItem(id)}>Удалить</button>
        </div>
      </div>
    );
  }

  function AddPalette() {
    if (!paletteAt) return null;
    return (
      <div ref={paletteRef} className="fixed z-[220] w-[300px] rounded-lg border bg-white shadow" style={{ left: paletteAt.x, top: paletteAt.y }}>
        <div className="px-3 py-2 border-b text-xs text-gray-500">Добавить свойство</div>
        <div className="p-2 space-y-1">
          {palette.map((opt) => (
            <button
              key={opt.type}
              className="w-full text-left px-2 py-2 rounded hover:bg-gray-50 flex items-start gap-2"
              onClick={() => addTyped(opt.type)}
            >
              <span className="text-base leading-5 mt-0.5">{opt.icon}</span>
              <span>
                <div className="text-[14px] font-medium text-gray-800">{opt.title}</div>
                <div className="text-xs text-gray-500">{opt.desc}</div>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="mb-3">
      <div className="flex items-center gap-3 mb-1">
        <div className="text-sm font-medium text-gray-700">Свойства</div>
        <div className="ml-auto flex items-center gap-2">
          {saving === "saving" && <span className="text-xs text-gray-500">Сохранение…</span>}
          {saving === "dirty"   && <span className="text-xs text-gray-500">Требует сохранения…</span>}
          {saving === "error"   && <span className="text-xs text-red-500">Ошибка сохранения</span>}
          <button className="text-[15px] text-gray-500 hover:text-gray-800 px-1 py-0.5 rounded underline" onClick={(e) => openPalette(e)}>
            Добавить свойство
          </button>
        </div>
      </div>

      {!loading && items.length > 0 && (
        <ul className="space-y-1">
          {items.map((p) => (<Row key={p.id} p={p} />))}
        </ul>
      )}

      <ContextMenu />
      <AddPalette />
    </div>
  );
}, (prev, next) => prev.pageId === next.pageId);

export default PageProperties;
