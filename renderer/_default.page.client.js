export { render }

import { createPageApp } from './app'

function render (pageContext) {
	if (pageContext.pageProps.hasOwnProperty('erreur')) {
		window.location.href = '/'
	} else if (pageContext.pageProps.hasOwnProperty('redirection')) {
		window.location.href = pageContext.pageProps.redirection
	} else {
		const app = createPageApp(pageContext)
		app.mount('#app')
	}
}

if (process.env.NODE_ENV === 'production' && import.meta.env.VITE_MATOMO && import.meta.env.VITE_MATOMO !== '') {
	const matomo = import.meta.env.VITE_MATOMO
	let matomoSiteId = 1
	if (import.meta.env.VITE_MATOMO_SITE_ID && import.meta.env.VITE_MATOMO_SITE_ID !== '') {
		matomoSiteId = import.meta.env.VITE_MATOMO_SITE_ID
	}
	const script = document.createElement('script')
	script.innerHTML = "var _paq = window._paq = window._paq || []; _paq.push(['trackPageView']); _paq.push(['enableLinkTracking']); (function () { var u='" + matomo + "'; _paq.push(['setTrackerUrl', u+'matomo.php']); _paq.push(['setSiteId', '" + matomoSiteId + "']); var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0]; g.crossOrigin='anonymous'; g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s); })();"
	document.head.appendChild(script)
}
