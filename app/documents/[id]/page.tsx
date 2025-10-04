/**
 * Страница просмотра и редактирования документа.
 *
 * Важное в этой версии:
 *  - EditorClient оставляем без изменений (holder: "editorjs").
 *  - На ЗАГРУЗКЕ и ПЕРЕД СОХРАНЕНИЕМ нормализуем контент:
 *    * убираем повтор всего списка блоков (типичный «дубль после повторного входа»),
 *    * убираем подряд идущие одинаковые блоки (защита от локальных повторов).
 *  - Автосохранение: дебаунс, работает как раньше.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Editor from "@/components/Editor";

type OutputData = {
  time?: number;
  blocks: Array<any>;
  version?: string;
};

/** Сравнение по JSON (достаточно для наших блоков) */
function jsonEqual(a: unknown, b: unknown) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/** Нормализация контента:
 *  1) Если блоки состоят из двух одинаковых половин (A…Z + A…Z) → берём только первую половину.
 *  2) Схлопываем подряд идущие идентичные блоки (…A A B B… → …A B…).
 *  3) При необходимости можно расширить проверку (но пока этого достаточно и безопасно).
 */
function sanitizeContent(input: any): OutputData {
  const srcBlocks: any[] = Array.isArray(input?.blocks) ? input.blocks : [];

  let blocks = srcBlocks;

  // (1) повтор целиком: [A,B,C, A,B,C]
  if (blocks.length >= 2 && blocks.length % 2 === 0) {
    const half = blocks.length / 2;
    const first = blocks.slice(0, half);
    const second = blocks.slice(half);
    if (jsonEqual(first, second)) {
      blocks = first;
    }
  }

  // (2) подряд идущие одинаковые блоки
  const dedup: any[] = [];
  for (const b of blocks) {
    const prev = dedup[dedup.length - 1];
    if (prev && prev.type === b.type && jsonEqual(prev.data, b.data)) {
      continue; // пропускаем дубликат «рядом»
    }
    dedup.push(b);
  }

  return {
    time: input?.time || Date.now(),
    version: input?.version || "2.28.0",
    blocks: dedup,
  };
}

export default function DocumentPage() {
  const { data: session, status } = useSession();
  const params = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string>("");

  const [title, setTitle] = useState<string>("");

  // контент редактора держим в ref — без лишних ререндеров
  const contentRef = useRef<OutputData>({ blocks: [] });

  // автосохранение
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const [saveTick, setSaveTick] = useState(0);

  // ------------ Загрузка документа ------------
  useEffect(() => {
    if (status !== "authenticated" || !params.id) return;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`/api/pages/${params.id}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data?.error || "Ошибка загрузки страницы");
          setLoading(false);
          return;
        }

        setTitle(data.title || "");

        // Приводим content к Editor.js и СРАЗУ чистим от дублей
        let initial: OutputData;
        if (typeof data.content === "object" && data.content?.blocks) {
          initial = sanitizeContent(data.content);
        } else if (typeof data.content === "string") {
          initial = sanitizeContent({
            blocks: [{ type: "paragraph", data: { text: data.content } }],
          });
        } else {
          initial = { blocks: [] };
        }

        contentRef.current = initial;

        setHasUserEdited(false);
        setSaveState("idle");
        setLoading(false);
      } catch {
        setError("Ошибка соединения с сервером");
        setLoading(false);
      }
    })();
  }, [status, params.id]);

  // ------------ Автосохранение (дебаунс) ------------
  useEffect(() => {
    if (status !== "authenticated") return;
    if (loading) return;
    if (!hasUserEdited) return;

    const t = setTimeout(async () => {
      try {
        setSaveState("saving");

        // ЧИСТИМ данные перед отправкой — чтобы в БД не копились повторы
        const toSave = sanitizeContent(contentRef.current);

        const res = await fetch(`/api/pages/${params.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content: toSave }),
        });

        if (!res.ok) {
          setSaveState("error");
          return;
        }

        // Синхронизируем локальный ref с тем, что реально сохранили
        contentRef.current = toSave;

        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1200);
      } catch {
        setSaveState("error");
      }
    }, 900);

    return () => clearTimeout(t);
  }, [saveTick, status, loading, hasUserEdited, params.id, title]);

  // ------------ UI состояния ------------
  if (status === "loading") return <div className="p-6 text-gray-500">Загрузка…</div>;
  if (!session) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Вы не авторизованы</h1>
        <p><a href="/login" className="text-blue-600 underline">Войдите</a>, чтобы редактировать документы.</p>
      </div>
    );
  }
  if (loading) return <div className="p-6 text-gray-500">Загрузка страницы…</div>;
  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-red-600">Ошибка</h1>
        <p>{error}</p>
        <p className="mt-4"><a href="/" className="text-blue-600 underline">← Назад</a></p>
      </div>
    );
  }

  // ------------ Основной UI ------------
  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Заголовок документа */}
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.currentTarget.value);
          setHasUserEdited(true);
          setSaveTick((x) => x + 1);
        }}
        placeholder="Название страницы"
        className="w-full text-3xl font-bold mb-4 outline-none border-b border-gray-200 focus:border-gray-400"
      />

      {/* Статус сохранения */}
      <div className="text-sm text-gray-500 mb-2 h-5">
        {saveState === "saving" && "Сохранение…"}
        {saveState === "saved" && "Сохранено"}
        {saveState === "error" && "Ошибка сохранения"}
      </div>

      {/* Редактор */}
      <Editor
        initialData={contentRef.current}
        onChange={(data) => {
          contentRef.current = data;
          if (!hasUserEdited) setHasUserEdited(true);
          setSaveTick((x) => x + 1);
        }}
      />

      <div className="mt-6">
        <a href="/" className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100">
          ← Назад к списку
        </a>
      </div>
    </div>
  );
}
