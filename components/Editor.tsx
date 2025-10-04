"use client";

/**
 * Обёртка над клиентским редактором Editor.js.
 * 
 * Назначение:
 *  - Отключает серверный рендеринг для Editor.js (динамический импорт с ssr:false).
 *  - Прокидывает данные и колбэки родителя без изменения.
 * 
 * Внимание:
 *  - Вся фактическая инициализация редактора и разметка контейнера находятся
 *    в components/EditorClient.tsx.
 */

import dynamic from "next/dynamic";
import type { OutputData } from "@editorjs/editorjs";

type Props = {
  /** Данные Editor.js (формат OutputData). Передаются только на первую инициализацию. */
  initialData: OutputData;
  /** Колбэк, вызывается на каждое изменение в редакторе. */
  onChange: (data: OutputData) => void;
};

const EditorClient = dynamic(() => import("./EditorClient"), {
  ssr: false,
});

export default function Editor({ initialData, onChange }: Props) {
  return <EditorClient initialData={initialData} onChange={onChange} />;
}
