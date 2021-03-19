let hote = 'localhost'
if (process.env.NODE_ENV === 'production') {
	hote = process.env.HOST
}

module.exports = {
	head: {
		title: 'Digipad by La Digitale',
		meta: [
			{ charset: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, height=device-height, viewport-fit=cover, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no' },
			{ name: 'apple-mobile-web-app-capable', content: 'yes' },
			{ name: 'mobile-web-app-capable', content: 'yes' },
			{ name: 'HandheldFriendly', content: 'true' },
			{ hid: 'description', name: 'description', content: 'une application collaborative proposée par La Digitale' }
		],
		noscript: [
			{ innerHTML: 'Vous devez activer Javascript sur votre navigateur pour utiliser cette application...' }
		],
		htmlAttrs: {
			lang: 'fr'
		},
		script: [
			{ src: '/js/jspanel.js' },
			{ src: '/js/flex-images.js' }
		],
		link: [
			{ rel: 'icon', type: 'image/png', href: '/favicon.png' }
		]
	},
	loading: '~/components/chargement-page.vue',
	css: [
		'destyle.css',
		'@/assets/css/main.css'
	],
	plugins: [
		{ src: '~/plugins/vue-socket-io', mode: 'client' },
		{ src: '~/plugins/vue-methods', mode: 'client' },
		{ src: '~/plugins/vue-masonry-css', mode: 'client' }
	],
	modules: [
		'nuxt-i18n'
	],
	i18n: {
		locales: [
			{
				code: 'en',
				file: 'en.js'
			},
			{
				code: 'fr',
				file: 'fr.js'
			}
		],
		defaultLocale: 'fr',
		strategy: 'no_prefix',
		lazy: true,
		langDir: 'lang/',
		vueI18n: {
			fallbackLocale: 'fr'
		}
	},
	router: {
		middleware: 'middleware'
	},
	server: {
		port: 3000,
		host: hote
	},
	render: {
		csp: {
			hashAlgorithm: 'sha256',
			policies: {
				'script-src': ["'self'", "'unsafe-inline'"],
				'frame-ancestors': ["'self'", 'https://ladigitale.dev']
			}
		},
		static: {
			maxAge: 1000 * 60 * 60 * 24 * 7
		}
	},
	buildModules: [
		'@nuxtjs/eslint-module'
	]
}
