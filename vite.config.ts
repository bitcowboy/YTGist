import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

const localSsl = basicSsl({
	name: 'ask',
	domains: ['localhost', '127.0.0.1']
});

let https = {};

export default defineConfig({	
	publicDir: 'static',
	server: {
		https,
	},
	plugins: [
		localSsl,
		tailwindcss(),
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			devOptions: { enabled: true },
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,ttf,woff,woff2}'],
			},
			manifest: false
		}),
	]
});
