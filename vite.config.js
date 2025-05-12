import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import UnoCSS from 'unocss/vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    root: resolve(__dirname, 'example'),
    plugins: [
        UnoCSS(),
    ],
    build: {
        lib: {
            entry: resolve(__dirname, 'src/Sprincul.js'),
            name: 'Sprincul',
            fileName: 'Sprincul',
        },
        rollupOptions: {
            output: {
                globals: {
                    morphdom: 'morphdom',
                },
            },
        },
    },
})