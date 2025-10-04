/** @type {import('next').NextConfig} */
const nextConfig = {
  // В dev-режиме React повторно монтирует эффекты (Editor.js плодит 2 экземпляра).
  // Отключаем StrictMode, чтобы useEffect вызывался ровно один раз.
  reactStrictMode: false,
};

module.exports = nextConfig;
