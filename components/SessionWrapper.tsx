"use client";

/**
 * Обёртка для NextAuth SessionProvider.
 * Вынесена в отдельный client component, чтобы работать в App Router.
 */

import { SessionProvider } from "next-auth/react";

export default function SessionWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
