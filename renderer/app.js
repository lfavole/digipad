import { createApp, h } from 'vue'
import PageShell from './PageShell.vue'
import { io } from 'socket.io-client'
import { createI18n } from 'vue-i18n'
import messages from './lang'
import masonry from 'vue-next-masonry'
import dayjs from 'dayjs'
import 'dayjs/locale/es'
import 'dayjs/locale/fr'
import 'dayjs/locale/hr'
import 'dayjs/locale/it'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(localizedFormat)
dayjs.extend(relativeTime)

export { createPageApp }

function createPageApp (pageContext) {
	const { Page, pageProps } = pageContext
	const PageWithLayout = {
    	render () {
      		return h(
        		PageShell,
        		{},
        		{
          			default () {
            			return h(Page, pageProps || {})
          			}
        		}
      		)
    	}
  	}

	const i18n = createI18n({
		locale: 'fr',
		fallbackLocale: 'fr',
		warnHtmlInMessage: 'off',
		messages
	})
	
	const app = createApp(PageWithLayout)
	app.use(i18n)
	app.use(masonry)

	app.config.globalProperties.$socket = io(pageProps.hote, {
		// transports: ['websocket', 'polling'],
		autoConnect: true,
		closeOnBeforeunload: false
	})

	app.config.globalProperties.$pageContext = pageContext

	app.config.globalProperties.$formaterDate = function (date, langue) {
		let dateFormattee = ''
		switch (langue) {
		case 'fr':
			dateFormattee = dayjs(new Date(date)).locale('fr').format('L') + ' à ' + dayjs(new Date(date)).locale('fr').format('LT')
			break
		case 'es':
			dateFormattee = dayjs(new Date(date)).locale('es').format('L') + ' a las ' + dayjs(new Date(date)).locale('es').format('LT')
			break
		case 'it':
			dateFormattee = dayjs(new Date(date)).locale('it').format('L') + ' alle ' + dayjs(new Date(date)).locale('it').format('LT')
			break
		case 'hr':
			dateFormattee = dayjs(new Date(date)).locale('hr').format('L') + ' u ' + dayjs(new Date(date)).locale('hr').format('LT')
			break
		case 'en':
			dateFormattee = dayjs(new Date(date)).locale('en').format('L') + ' at ' + dayjs(new Date(date)).locale('en').format('LT')
			break
		}
		return dateFormattee
	}
	
	app.config.globalProperties.$formaterDateRelative = function (date, langue) {
		return dayjs(new Date(date)).locale(langue).fromNow()
	}
	
	app.config.globalProperties.$verifierEmail = function (email) {
		const regexExp = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/gi
		return regexExp.test(email)
	}

	return app
}
