import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        host: true, // Expose to network for admin panel
    },
    base: process.env.VITE_BASE_PATH || '/admin/',
    resolve: {
        alias: {
            '@': '/src',
        },
    },
})
