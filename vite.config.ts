import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages では https://<user>.github.io/englishwords/ に置かれる
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '英単語1400',
        short_name: '英単語',
        description: '単語帳と連動して覚える英単語アプリ',
        lang: 'ja',
        theme_color: '#c4562f',
        background_color: '#faf7f2',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // 単語データ（Supabase）はアプリ内で IndexedDB ではなく localStorage にキャッシュするため、ここでは静的資産のみ
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallbackDenylist: [/^\/local-data\//],
      },
    }),
  ],
})
