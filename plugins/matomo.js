export default () => {
	if (process.env.NODE_ENV === 'production' && process.env.matomo && process.env.matomo !== '') {
		const matomo = process.env.matomo
		let matomoSiteId = 1
		if (process.env.matomoSiteId && process.env.matomoSiteId !== '') {
			matomoSiteId = process.env.matomoSiteId
		}
		const script = document.createElement('script')
		script.innerHTML = "var _paq = window._paq = window._paq || []; _paq.push(['trackPageView']); _paq.push(['enableLinkTracking']); (function() { var u='" + matomo + "'; _paq.push(['setTrackerUrl', u+'matomo.php']); _paq.push(['setSiteId', '" + matomoSiteId + "']); var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0]; g.crossOrigin='anonymous'; g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s); })();"
		document.head.appendChild(script)
	}
}
