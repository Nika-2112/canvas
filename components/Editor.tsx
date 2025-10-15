// /canvas/components/Editor.tsx
"use client";

/**
 * Обёртка над Editor.js (динамический импорт).
 * Без функциональных изменений — совместимо с разнесёнными API.
 */
import dynamic from "next/dynamic";
import type { OutputData } from "@editorjs/editorjs";

type Props = { initialData: OutputData; onChange: (data: OutputData) => void };

const EditorClient = dynamic(() => import("./EditorClient"), { ssr: false });

export default function Editor({ initialData, onChange }: Props) {
  return <EditorClient initialData={initialData} onChange={onChange} />;
}

