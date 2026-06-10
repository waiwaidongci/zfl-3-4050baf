export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: false },
  app: {
    head: {
      title: '露营装备共享社群',
      htmlAttrs: { lang: 'zh-CN' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }]
    }
  }
});
