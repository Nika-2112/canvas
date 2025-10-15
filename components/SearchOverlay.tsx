"use client";

/**
 * Полотно поиска:
 *  - Открывается/закрывается через пропсы isOpen/onClose.
 *  - Поиск с дебаунсом 250мс по API /api/search?q=
 *  - Enter переходит к первому результату.
 *  - Закрытие по ESC, клику по фону или крестику.
 *  - Опционально: глобальный шорткат обрабатывается родителем (мы просто фокусим инпут).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Result = {
  _id: string;
  title: string;
  parentId: string | null;
  updatedAt?: string;
  snippet?: string;
};

export default function SearchOverlay({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const inputRef = useRef<HTMLInputElement>(null);

  // фокус на инпут при открытии
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      setQ("");
      setResults([]);
      setError("");
    }
  }, [isOpen]);

  // дебаунс-поиск
  useEffect(() => {
    if (!isOpen) return;
    const term = q.trim();
    if (!term) {
      setResults([]);
      setError("");
      return;
    }
    setLoading(true);
    setError("");

    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = await r.json();
        if (!r.ok) {
          setResults([]);
          setError(data?.error || "Ошибка поиска");
        } else {
          setResults(Array.isArray(data?.results) ? data.results : []);
        }
      } catch {
        setResults([]);
        setError("Ошибка соединения");
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [q, isOpen]);

  // закрытие кликом по фону
  const onBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  // Enter — перейти к первому
  const firstHref = useMemo(
    () => (results[0]?._id ? `/documents/${results[0]._id}` : null),
    [results]
  );
  useEffect(() => {
    function onEnter(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && !e.shiftKey && firstHref) {
        window.location.href = firstHref;
      }
    }
    document.addEventListener("keydown", onEnter);
    return () => document.removeEventListener("keydown", onEnter);
  }, [isOpen, onClose, firstHref]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onBackdropClick}
      className="fixed inset-0 z-[1000] bg-black/50 flex items-start justify-center p-6"
      aria-modal
      role="dialog"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border">
        {/* header */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск страниц…  (Ctrl/Cmd + K)"
            className="flex-1 outline-none text-[15px]"
          />
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black px-2 py-1"
            aria-label="Закрыть"
            title="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div className="max-h-[60vh] overflow-y-auto">
          {error && <div className="px-4 py-3 text-sm text-red-600">{error}</div>}
          {!error && loading && (
            <div className="px-4 py-3 text-sm text-gray-500">Идёт поиск…</div>
          )}
          {!error && !loading && results.length === 0 && q.trim() && (
            <div className="px-4 py-3 text-sm text-gray-500">Ничего не найдено</div>
          )}
          {!error && !loading && results.length > 0 && (
            <ul className="divide-y">
              {results.map((r) => (
                <li key={r._id}>
                  <a
                    href={`/documents/${r._id}`}
                    className="block px-4 py-3 hover:bg-gray-50"
                  >
                    <div className="text-[15px] font-medium truncate">
                      {r.title || "Без названия"}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500 truncate">
                      {r.snippet || "…"}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-gray-500">
          <div>Найдены: {results.length}</div>
          <div>Esc — закрыть</div>
        </div>
      </div>
    </div>
  );
}
