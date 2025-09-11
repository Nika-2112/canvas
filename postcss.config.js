/**
 * Конфигурация PostCSS для работы с Tailwind CSS v4.
 * 
 * TailwindCSS v4 требует подключения плагина `@tailwindcss/postcss`.
 * Старый вызов `tailwindcss: {}` использовать нельзя.
 */
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {}, // плагин TailwindCSS
    autoprefixer: {}            // автопрефиксы для кроссбраузерной совместимости
  },
};
