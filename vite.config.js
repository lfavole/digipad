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
	}
}
