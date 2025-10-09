import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		basicSsl({
			name: 'ask',
			domains: ['localhost', '127.0.0.1']
		}),
		tailwindcss(),
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			devOptions: { enabled: true },
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,ttf,woff,woff2}']
			},
			manifest: false
		}),
	]
});
