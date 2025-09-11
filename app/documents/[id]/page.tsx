/**
 * Страница просмотра и редактирования документа.
 *
 * Важно:
 *  - Контент редактора храним в useRef, а НЕ в useState — чтобы не пересоздавать Editor.js.
 *  - Editor рендерится только после загрузки данных (нет перепрыгивания и дублирования).
 *  - Автосохранение с дебаунсом, запускается только после реального редактирования пользователем.
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

export default function DocumentPage() {
  const { data: session, status } = useSession();
  const params = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [title, setTitle] = useState<string>("");

  // Контент храним в useRef — это ключ к отсутствию «дёрганья» и дубликатов
  const contentRef = useRef<OutputData>({ blocks: [] });

  // Состояние автосохранения
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const [saveTick, setSaveTick] = useState(0); // счётчик изменений для дебаунса

  // ---------------- Загрузка документа ----------------
  useEffect(() => {
    if (status !== "authenticated" || !params.id) return;

    const run = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/pages/${params.id}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data?.error || "Ошибка загрузки страницы");
          setLoading(false);
          return;
        }

        setTitle(data.title || "");

        // Контент переводим в формат Editor.js и пишем в ref
        if (typeof data.content === "object" && data.content?.blocks) {
          contentRef.current = data.content;
        } else if (typeof data.content === "string") {
          contentRef.current = {
            blocks: [{ type: "paragraph", data: { text: data.content } }],
          };
        } else {
          contentRef.current = { blocks: [] };
        }

        setLoading(false);
      } catch {
        setError("Ошибка соединения с сервером");
        setLoading(false);
      }
    };

    run();
  }, [status, params.id]);

  // ---------------- Автосохранение (дебаунс) ----------------
  useEffect(() => {
    if (status !== "authenticated") return;
    if (loading) return;
    if (!hasUserEdited) return; // не сохраняем, пока юзер ничего не правил

    const t = setTimeout(async () => {
      try {
        setSaveState("saving");
        const res = await fetch(`/api/pages/${params.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content: contentRef.current, // сохраняем актуальные данные из ref
          }),
        });
        if (!res.ok) {
          setSaveState("error");
          return;
        }
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      } catch {
        setSaveState("error");
      }
    }, 1200);

    return () => clearTimeout(t);
  }, [saveTick, status, loading, hasUserEdited, params.id, title]);

  // ---------------- UI состояния ----------------
  if (status === "loading") {
    return <div className="p-6 text-gray-500">Загрузка…</div>;
  }
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
  if (loading) {
    return <div className="p-6 text-gray-500">Загрузка страницы…</div>;
  }
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

  // ---------------- Основной UI ----------------
  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Заголовок документа */}
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.currentTarget.value);
          setHasUserEdited(true);      // пользователь начал редактировать
          setSaveTick((x) => x + 1);   // триггерим дебаунс сохранения
        }}
        placeholder="Название страницы"
        className="w-full text-3xl font-bold mb-4 outline-none border-b border-gray-200 focus:border-gray-400"
      />

      {/* Статус сохранения */}
      <div className="text-sm text-gray-500 mb-2">
        {saveState === "saving" && "Сохранение…"}
        {saveState === "saved" && "Сохранено"}
        {saveState === "error" && "Ошибка сохранения"}
      </div>

      {/* Редактор (Editor.js). ВАЖНО: initialData читается один раз при монтировании. */}
      <Editor
        initialData={contentRef.current}
        onChange={(data) => {
          // Сюда попадаем на каждую правку текста в Editor.js
          contentRef.current = data;   // обновляем данные без перерендера
          if (!hasUserEdited) setHasUserEdited(true);
          setSaveTick((x) => x + 1);   // запускаем цикл автосохранения (дебаунс)
        }}
      />

      {/* Навигация */}
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
