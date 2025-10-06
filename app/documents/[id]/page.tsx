/**
 * Страница просмотра и редактирования документа.
 *
 * Назначение:
 *  - Загрузка документа текущего пользователя из БД.
 *  - Редактирование содержимого через Editor.js.
 *  - Автосохранение с дебаунсом (без лишних перерендеров).
 *  - Нормализация контента (устранение дублей блоков).
 *  - Удаление документа (кнопка рядом с заголовком).
 *
 * Особенности реализации:
 *  - Содержимое Editor.js хранится в useRef (contentRef), чтобы не пересоздавать редактор.
 *  - Нормализация выполняется при загрузке и перед сохранением.
 *  - Для Next.js 15: параметры маршрута извлекаются через useParams в клиентском компоненте.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Editor from "@/components/Editor";
import DeletePageButton from "@/components/DeletePageButton";

/** Тип данных Editor.js (минимально необходимая часть). */
type OutputData = {
  time?: number;
  blocks: Array<any>;
  version?: string;
};

/**
 * Сравнение объектов по JSON.
 * Достаточно для проверки идентичности соседних блоков Editor.js.
 */
function jsonEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Нормализация контента Editor.js.
 *
 * Выполняет:
 *  1) Удаление «повтора всего набора» блоков: [A..Z, A..Z] -> [A..Z].
 *  2) Схлопывание подряд идущих идентичных блоков: …, A, A, B, B, … -> …, A, B, ….
 *
 * Возвращает корректную структуру OutputData.
 */
function sanitizeContent(input: any): OutputData {
  const srcBlocks: any[] = Array.isArray(input?.blocks) ? input.blocks : [];
  let blocks = srcBlocks;

  // (1) Полный дубль набора блоков (две одинаковые половины массива)
  if (blocks.length >= 2 && blocks.length % 2 === 0) {
    const half = blocks.length / 2;
    const first = blocks.slice(0, half);
    const second = blocks.slice(half);
    if (jsonEqual(first, second)) {
      blocks = first;
    }
  }

  // (2) Схлопывание соседних одинаковых блоков (по type + data)
  const dedup: any[] = [];
  for (const b of blocks) {
    const prev = dedup[dedup.length - 1];
    if (prev && prev.type === b.type && jsonEqual(prev.data, b.data)) {
      continue;
    }
    dedup.push(b);
  }

  return {
    time: input?.time || Date.now(),
    version: input?.version || "2.28.0",
    blocks: dedup,
  };
}

/**
 * Компонент страницы документа.
 */
export default function DocumentPage() {
  const { data: session, status } = useSession();
  const params = useParams<{ id: string }>();

  // Служебные состояния загрузки/ошибок.
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  // Заголовок документа (упрощённый текстовый инпут).
  const [title, setTitle] = useState<string>("");

  // Контент Editor.js храним в ref, чтобы не триггерить пересоздание редактора.
  const contentRef = useRef<OutputData>({ blocks: [] });

  // Состояния автосохранения.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [hasUserEdited, setHasUserEdited] = useState<boolean>(false);
  const [saveTick, setSaveTick] = useState<number>(0); // счётчик изменений для дебаунса

  /**
   * Загрузка документа по идентификатору.
   * Выполняется после подтверждения аутентификации.
   */
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

        // Заголовок.
        setTitle(data?.title || "");

        // Приведение content к формату Editor.js и первичная нормализация.
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

        // Сброс состояний автосохранения после загрузки.
        setHasUserEdited(false);
        setSaveState("idle");
        setLoading(false);
      } catch {
        setError("Ошибка соединения с сервером");
        setLoading(false);
      }
    })();
  }, [status, params.id]);

  /**
   * Автосохранение с дебаунсом.
   * Запускается только после реального редактирования пользователем.
   */
  useEffect(() => {
    if (status !== "authenticated") return;
    if (loading) return;
    if (!hasUserEdited) return;

    const timer = setTimeout(async () => {
      try {
        setSaveState("saving");

        // Нормализация перед отправкой в БД — для защиты от накопления дублей.
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

        // Синхронизация локального ref с фактически сохранёнными данными.
        contentRef.current = toSave;

        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1200);
      } catch {
        setSaveState("error");
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [saveTick, status, loading, hasUserEdited, params.id, title]);

  // Состояния интерфейса.
  if (status === "loading") {
    return <div className="p-6 text-gray-500">Загрузка…</div>;
  }

  if (!session) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Вы не авторизованы</h1>
        <p>
          <a href="/login" className="text-blue-600 underline">
            Войдите
          </a>, чтобы редактировать документы.
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

  /**
   * Основной интерфейс страницы:
   *  - поле заголовка + кнопка удаления;
   *  - статус сохранения;
   *  - редактор Editor.js;
   *  - навигация назад.
   */
  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Верхняя панель: заголовок + удаление */}
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

        {/* Кнопка удаления документа с возвратом на главную */}
        <DeletePageButton
          pageId={String(params.id)}
          redirectAfter={true}
          className="px-3 py-2 border border-red-300 text-red-700 rounded hover:bg-red-50"
        >
          Удалить
        </DeletePageButton>
      </div>

      {/* Индикатор состояния сохранения */}
      <div className="text-sm text-gray-500 mb-2 h-5">
        {saveState === "saving" && "Сохранение…"}
        {saveState === "saved" && "Сохранено"}
        {saveState === "error" && "Ошибка сохранения"}
      </div>

      {/* Редактор Editor.js
          ВАЖНО: initialData читается однократно при монтировании EditorClient. */}
      <Editor
        initialData={contentRef.current}
        onChange={(data) => {
          contentRef.current = data;
          if (!hasUserEdited) setHasUserEdited(true);
          setSaveTick((x) => x + 1);
        }}
      />

      {/* Навигация назад */}
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
