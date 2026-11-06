import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 静态托管没有 history fallback，产物用相对路径，保证发布到任意根域名都能加载。
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // 发布器会把 dist/ 当作 build output 排除，不随源码上传，导致线上只剩未编译的
    // 源码模板 index.html（引用 /src/main.tsx）而白屏。产物直接落到 site/，
    // 发布时由静态服务器以 site/ 为根目录托管。site/ 不能写进 .gitignore。
    outDir: 'site',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
