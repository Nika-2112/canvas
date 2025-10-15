/**
 * app/documents/[id]/page.tsx
 *
 * Страница документа: Editor.js + свойства (общий автосейв).
 *
 * Главное:
 *  • В общий PUT /api/pages/:id уходит title, content и properties (из PageProperties).
 *  • Свойства держим в useRef, чтобы изменения не дёргали ререндер родителя/редактора.
 *  • Колбэки в PageProperties стабилизированы через useCallback.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Editor from "@/components/Editor";
import PageActionsMenu from "@/components/PageActionsMenu";
import PageProperties, { PropItem } from "@/components/PageProperties";

type OutputData = { time?: number; blocks: any[]; version?: string };

function jsonEqual(a: unknown, b: unknown) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}
function sanitizeContent(input: any): OutputData {
  const src: any[] = Array.isArray(input?.blocks) ? input.blocks : [];
  let blocks = src;

  // защита от дублирования набора целиком
  if (blocks.length >= 2 && blocks.length % 2 === 0) {
    const half = blocks.length / 2;
    const first = blocks.slice(0, half);
    const second = blocks.slice(half);
    if (jsonEqual(first, second)) blocks = first;
  }

  // схлопываем одинаковые соседние блоки
  const dedup: any[] = [];
  for (const b of blocks) {
    const prev = dedup[dedup.length - 1];
    if (prev && prev.type === b.type && jsonEqual(prev.data, b.data)) continue;
    dedup.push(b);
  }

  return { time: input?.time || Date.now(), version: input?.version || "2.28.0", blocks: dedup };
}

export default function DocumentPage() {
  const { data: session, status } = useSession();
  const params = useParams<{ id: string }>();

  // загрузка/ошибки
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // заголовок
  const [title, setTitle] = useState("");

  // контент редактора — в ref
  const contentRef = useRef<OutputData>({ blocks: [] });

  // свойства страницы — в ref (чтобы не мигал UI и не пересоздавался Editor)
  const propertiesRef = useRef<PropItem[]>([]);

  // общий автосейв
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const [saveTick, setSaveTick] = useState(0);

  // Загрузка
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

        setTitle(data?.title || "");

        // контент
        let initial: OutputData;
        if (typeof data?.content === "object" && data.content?.blocks) {
          initial = sanitizeContent(data.content);
        } else if (typeof data?.content === "string") {
          initial = sanitizeContent({
            blocks: [{ type: "paragraph", data: { text: data.content } }],
          });
        } else {
          initial = { blocks: [] };
        }
        contentRef.current = initial;

        // свойства
        propertiesRef.current = Array.isArray(data?.properties) ? data.properties : [];

        setHasUserEdited(false);
        setSaveState("idle");
        setLoading(false);
      } catch {
        setError("Ошибка соединения с сервером");
        setLoading(false);
      }
    })();
  }, [status, params.id]);

  // Общий автосейв (title + content + properties)
  useEffect(() => {
    if (status !== "authenticated") return;
    if (loading) return;
    if (!hasUserEdited) return;

    const t = setTimeout(async () => {
      try {
        setSaveState("saving");

        const toSave = sanitizeContent(contentRef.current);

        const res = await fetch(`/api/pages/${params.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content: toSave,
            properties: propertiesRef.current, // ← свойства уезжают вместе с контентом
          }),
        });

        if (!res.ok) {
          setSaveState("error");
          return;
        }

        // синхронизуем локально
        contentRef.current = toSave;
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 900);
      } catch {
        setSaveState("error");
      }
    }, 900);

    return () => clearTimeout(t);
  }, [saveTick, status, loading, hasUserEdited, params.id, title]); // свойства не в deps — мы триггерим saveTick вручную

  // стабильные колбэки для PageProperties
  const handlePropsLoaded = useCallback((items: PropItem[]) => {
    propertiesRef.current = items;
    // загрузка свойств сама по себе не помечает страницу «грязной»
  }, []);

  const handlePropsChange = useCallback((items: PropItem[]) => {
    propertiesRef.current = items;
    // общий автосейв страницы: помечаем «грязным» и тикаем дебаунс
    setHasUserEdited(true);
    setSaveTick((x) => x + 1);
  }, []);

  const handlePropsDirty = useCallback(() => {
    setHasUserEdited(true);
    setSaveTick((x) => x + 1);
  }, []);

  // Состояния UI
  if (status === "loading") return <div className="p-6 text-gray-500">Загрузка…</div>;

  if (!session) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Вы не авторизованы</h1>
        <p>
          <a href="/login" className="text-blue-600 underline">Войдите</a>, чтобы редактировать документы.
        </p>
      </div>
    );
  }

  if (loading) return <div className="p-6 text-gray-500">Загрузка страницы…</div>;

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-red-600">Ошибка</h1>
        <p>{error}</p>
        <p className="mt-4">
          <a href="/" className="text-blue-600 underline">← Назад</a>
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Заголовок + меню действий */}
      <div className="flex items-center gap-3 mb-2">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.currentTarget.value);
            setHasUserEdited(true);
            setSaveTick((x) => x + 1);
          }}
          placeholder="Название страницы"
          className="flex-1 text-3xl font-bold outline-none border-b border-gray-200 focus:border-gray-400"
        />
        <PageActionsMenu pageId={String(params.id)} />
      </div>

      <div className="text-sm text-gray-500 mb-2 h-5">
        {saveState === "saving" && "Сохранение…"}
        {saveState === "saved" && "Сохранено"}
        {saveState === "error" && "Ошибка сохранения"}
      </div>

      {/* Свойства: любые изменения дергают общий автосейв */}
      <PageProperties
        pageId={String(params.id)}
        onLoaded={handlePropsLoaded}
        onChange={handlePropsChange}
        onDirty={handlePropsDirty}
      />

      {/* Editor.js */}
      <Editor
        initialData={contentRef.current}
        onChange={(data) => {
          contentRef.current = data;
          setHasUserEdited(true);
          setSaveTick((x) => x + 1);
        }}
      />

      <div className="mt-6">
        <a
          href="/"
          className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
        >
          ← Назад к списку
        </a>
      </div>
    </div>
  );
}
