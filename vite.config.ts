import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'fs';

/*
const localSsl = basicSsl({
	name: 'ask',
	domains: ['localhost', '127.0.0.1']
});
*/

let localSsl = basicSsl({
	name: 'ask',
	domains: ['localhost', '127.0.0.1']
});

let https = {};

export default defineConfig(({ command, mode }) => {
	
	const env = loadEnv(mode, process.cwd(), '')

	console.log(env.HTTPS_CRT, env.HTTPS_KEY);
	
	if (env.HTTPS_CRT) {
		localSsl = undefined;
		https = {
			key: fs.readFileSync(env.HTTPS_KEY),
			cert: fs.readFileSync(env.HTTPS_CRT),
		};
	}

	return {
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
					globIgnores: ['**/font/KingHwaOldSong.ttf']
				},
				manifest: false
			}),
		]
	}
});
