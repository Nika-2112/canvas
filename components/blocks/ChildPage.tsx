"use client";

/**
 * Карточка подстраницы, визуально похожая на Notion child page.
 * Название страницы подтягиваем по API, чтобы оно всегда было актуальным.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

export default function ChildPage({ refId }: { refId: string }) {
  const [title, setTitle] = useState<string>("Страница");

  useEffect(() => {
    fetch(`/api/pages/${refId}`)
      .then((r) => r.json())
      .then((p) => setTitle(p?.title || "Страница"));
  }, [refId]);

  return (
    <Link
      href={`/documents/${refId}`}
      className="block rounded-md border border-neutral-200 px-3 py-2 hover:bg-neutral-50"
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-neutral-500">Подстраница</div>
    </Link>
  );
}
