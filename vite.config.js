import vue from '@vitejs/plugin-vue'
import ssr from 'vite-plugin-ssr/plugin'

export default {
	plugins: [vue(), ssr()],
	resolve: {
		alias: {
			'#root': __dirname
		}
	},
	server: {
		watch: {
			ignored: ["**/static/**"],
		}
	},
	build: {
		target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari12']
	}
}
