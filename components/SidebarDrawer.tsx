"use client";

/**
 * SidebarDrawer — выезжающий слева сайдбар в стиле Notion.
 *
 * Ключевые особенности:
 *  - Корневой wrapper имеет id="sd-root". Все CSS-правила скоупятся через этот id,
 *    чтобы не влиять на другие элементы приложения.
 *  - Кнопка-«бургер» — фиксируется поверх контента; панель — выезжает поверх контента,
 *    НЕ сдвигая основную страницу.
 *  - По умолчанию панель скрыта. Открытие/закрытие — по клику на иконку (или по оверлею).
 *  - Ширина на десктопе: от 15% до 30% (ресайз мышью с правого края).
 *  - На мобильных устройствах — 90% ширины экрана.
 *  - Геометрия панели по ТЗ: height: 70vh; margin-left: 40px; top: 10px;
 *    border-top-right-radius: 20px; border-bottom-right-radius: 20px.
 *
 * Как подставить свою иконку:
 *   <SidebarDrawer menuIcon={<img src="/menu.svg" alt="menu" />} />
 */

import { useEffect, useRef, useState } from "react";

type Props = {
  /** Любой React-элемент (svg, img, иконка) для кнопки-меню */
  menuIcon?: React.ReactNode;
};

export default function SidebarDrawer({ menuIcon }: Props) {
  const [open, setOpen] = useState<boolean>(false);

  // Текущая ширина панели в пикселях (для десктопов).
  const [panelWidthPx, setPanelWidthPx] = useState<number>(0);

  // Признак мобильного режима (<= 768px).
  const [isMobile, setIsMobile] = useState<boolean>(false);

  // Ресайз-драг: активен ли, и откуда начат.
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startWidth: number;
  }>({ active: false, startX: 0, startWidth: 0 });

  // Инициализация ширины и mobile-флага
  useEffect(() => {
    const update = () => {
      const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const mobile = vw <= 768;
      setIsMobile(mobile);

      if (mobile) {
        // на мобильных — всегда 90vw
        setPanelWidthPx(Math.round(vw * 0.9));
      } else {
        // на десктопе — по умолчанию 15vw
        setPanelWidthPx(Math.round(vw * 0.15));
      }
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Старт перетягивания правого края
  const onResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile) return; // на мобильных не ресайзим
    e.preventDefault();
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startWidth: panelWidthPx,
    };
    // Вешаем обработчики на документ, чтобы ловить движение вне панели
    document.addEventListener("mousemove", onResizing);
    document.addEventListener("mouseup", onResizeEnd);
  };

  // Во время перетягивания
  const onResizing = (e: MouseEvent) => {
    if (!dragRef.current.active || isMobile) return;
    const delta = e.clientX - dragRef.current.startX;
    const next = dragRef.current.startWidth + delta;

    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const min = Math.round(vw * 0.15); // 15%
    const max = Math.round(vw * 0.3);  // 30%
    const clamped = Math.max(min, Math.min(max, next));
    setPanelWidthPx(clamped);
  };

  // Завершение перетягивания
  const onResizeEnd = () => {
    dragRef.current.active = false;
    document.removeEventListener("mousemove", onResizing);
    document.removeEventListener("mouseup", onResizeEnd);
  };

  // Щелчок по бургеру — открыть/закрыть
  const toggleOpen = () => setOpen((v) => !v);

  return (
    // ВАЖНО: id="sd-root" — корневой скоуп для всех стилей сайдбара
    <div id="sd-root" aria-live="polite">
      {/* Кнопка-«бургер». Стили полностью задаются в globals.css через #sd-root .sd-button */}
      <button
        type="button"
        className="sd-button"
        aria-label={open ? "Закрыть меню" : "Открыть меню"}
        aria-expanded={open}
        aria-controls="sd-panel"
        onClick={toggleOpen}
      >
        {menuIcon ?? (
          // Дефолтная иконка (если свою не передали)
          <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Оверлей: кликом закрывает панель. НЕ влияет на лейаут (position: fixed). */}
      <div
        className={`sd-overlay ${open ? "sd-overlay--show" : ""}`}
        aria-hidden={!open}
        onClick={() => setOpen(false)}
      />

      {/* Панель: фиксированная, поверх контента. Не сдвигает основной layout. */}
      <aside
        id="sd-panel"
        role="complementary"
        aria-hidden={!open}
        className={`sd-panel ${open ? "sd-panel--open" : ""}`}
        style={{
          width: isMobile ? "90vw" : `${panelWidthPx}px`,
          height: "90vh",
          marginLeft: "0px",
          top: "60px",
          borderTopRightRadius: "20px",
          borderBottomRightRadius: "20px",
        }}
      >
        {/* Внутреннее содержимое (пока заглушка) */}
        <div className="sd-panel__inner">
          Пустой сайдбар. Здесь будет навигация.
        </div>

        {/* Ручка для ресайза (справа). Только десктоп. */}
        {!isMobile && <div className="sd-resize-handle" onMouseDown={onResizeStart} />}
      </aside>
    </div>
  );
}
