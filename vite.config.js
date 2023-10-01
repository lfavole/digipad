import vue from '@vitejs/plugin-vue'
import ssr from 'vike/plugin'

export default {
	plugins: [vue(), ssr()],
	resolve: {
		alias: {
			'#root': __dirname
		}
	},
	define: {
		'app_version': JSON.stringify(process.env.npm_package_version)
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
