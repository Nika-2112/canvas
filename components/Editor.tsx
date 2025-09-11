"use client";

/**
 * Editor — обёртка для EditorClient с отключённым SSR.
 * Next.js не будет пытаться рендерить Editor.js на сервере.
 */

import dynamic from "next/dynamic";
import type { OutputData } from "@editorjs/editorjs";

type Props = {
  initialData: OutputData;
  onChange: (data: OutputData) => void;
};

const Editor = dynamic(() => import("./EditorClient"), { ssr: false });

export default function EditorWrapper({ initialData, onChange }: Props) {
  return <Editor initialData={initialData} onChange={onChange} />;
}
