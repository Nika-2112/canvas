"use client";

/**
 * SidebarDrawer — выезжающий слева сайдбар (поверх контента).
 * - Свёрнут по умолчанию; открывается/закрывается по клику на кнопку.
 * - На мобилках ширина фикс. 90vw; на десктопах — от min..max (ресайз правым краем).
 * - Стили берём из globals.css через селекторы #sd-root .sd-*
 * - Внутри рендерим <Sidebar variant="drawer" />
 *
 * Как подставить свою иконку-кнопку:
 *   <SidebarDrawer menuIcon={<img src="/menu.svg" alt="menu" width={18} height={18} />} />
 */

import { useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";

/** Границы ширины панели по брейкпоинтам */
function getLimits(vw: number, isMobile: boolean) {
  // 📱 Мобилки — фикс 90% экрана
  if (isMobile || vw <= 768) {
    const fixed = Math.round(vw * 0.9);
    return { min: fixed, max: fixed };
  }
  // 💻 Планшеты / ноутбуки
  if (vw > 768 && vw <= 1366) {
    const min = Math.round(vw * 0.25);
    const max = Math.round(vw * 0.5);
    return { min, max };
  }
  // 🖥️ Крупные экраны
  const min = Math.round(vw * 0.19);
  const max = Math.round(vw * 0.5);
  return { min, max };
}

type Props = {
  /** Любая иконка/кнопка для открытия меню */
  menuIcon?: React.ReactNode;
};

export default function SidebarDrawer({ menuIcon }: Props) {
  const [open, setOpen] = useState(false);

  // Текущая ширина панели (px)
  const [panelWidthPx, setPanelWidthPx] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Драг-ресайз
  const dragRef = useRef<{ active: boolean; startX: number; startWidth: number }>({
    active: false,
    startX: 0,
    startWidth: 0,
  });

  // Инициализация размеров
  useEffect(() => {
    const update = () => {
      const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const mobile = vw <= 768;
      setIsMobile(mobile);

      // дефолтная ширина
      let ratio = 0.2; // десктоп по умолчанию ~20vw
      if (vw <= 480) ratio = 0.95;
      else if (vw <= 768) ratio = 0.9;
      else if (vw <= 1024) ratio = 0.28;
      else if (vw <= 1440) ratio = 0.18;
      else ratio = 0.2;

      const { min, max } = getLimits(vw, mobile);
      setPanelWidthPx((prev) => {
        const next = prev > 0 ? prev : Math.round(vw * ratio);
        return Math.max(min, Math.min(max, next));
      });
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Открыть/закрыть
  const toggleOpen = () => setOpen((v) => !v);

  // Ресайз — начало
  const onResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile) return;
    e.preventDefault();
    dragRef.current = { active: true, startX: e.clientX, startWidth: panelWidthPx };
    document.addEventListener("mousemove", onResizing);
    document.addEventListener("mouseup", onResizeEnd);
  };

  // Ресайз — процесс
  const onResizing = (e: MouseEvent) => {
    if (!dragRef.current.active || isMobile) return;
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const { min, max } = getLimits(vw, isMobile);
    if (max - min <= 1) return; // диапазона нет — не ресайзим

    const delta = e.clientX - dragRef.current.startX;
    const next = dragRef.current.startWidth + delta;
    const clamped = Math.max(min, Math.min(max, next));
    setPanelWidthPx(clamped);
  };

  // Ресайз — конец
  const onResizeEnd = () => {
    dragRef.current.active = false;
    document.removeEventListener("mousemove", onResizing);
    document.removeEventListener("mouseup", onResizeEnd);
  };

  return (
    // id="sd-root" — ключ для скоупа стилей в globals.css
    <div id="sd-root" aria-live="polite">
      {/* Кнопка-«бургер». Стили задаются классом .sd-button (globals.css) */}
      <button
        type="button"
        className="sd-button"
        aria-label={open ? "Закрыть меню" : "Открыть меню"}
        aria-expanded={open}
        aria-controls="sd-panel"
        onClick={toggleOpen}
      >
        {menuIcon ?? (
          <svg viewBox="0 0 24 24" role="img" aria-hidden="true" width={24} height={24}>
            <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Оверлей — кликом закрывает */}
      <div
        className={`sd-overlay ${open ? "sd-overlay--show" : ""}`}
        aria-hidden={!open}
        onClick={() => setOpen(false)}
      />

      {/* Панель поверх контента */}
      <aside
        id="sd-panel"
        role="complementary"
        aria-hidden={!open}
        className={`sd-panel ${open ? "sd-panel--open" : ""}`}
        style={{
          width: isMobile ? "90vw" : `${panelWidthPx}px`,
          height: "90vh",
          top: "60px",
          marginLeft: "0px",
          borderTopRightRadius: "20px",
          borderBottomRightRadius: "20px",
        }}
      >
        {/* Внутри — наш Sidebar в режиме drawer */}
        <div className="sd-panel__inner sd-sidebar" style={{ height: "100%", overflow: "auto" }}>
          <Sidebar variant="drawer" />
        </div>

        {/* Ручка ресайза справа (только десктоп) */}
        {!isMobile && <div className="sd-resize-handle" onMouseDown={onResizeStart} />}
      </aside>
    </div>
  );
}
