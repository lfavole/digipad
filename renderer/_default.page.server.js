export { render }

export const passToClient = ['pageProps']

import { escapeInject } from 'vite-plugin-ssr/server'

async function render (pageContext) {
	let titre = 'Digipad by La Digitale'
	if (pageContext.pageProps.hasOwnProperty('titre')) {
		titre = pageContext.pageProps.titre
	}
	const documentHtml = escapeInject`<!DOCTYPE html>
		<html lang="fr">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, height=device-height, viewport-fit=cover, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no">
				<meta name="apple-mobile-web-app-capable" content="yes">
				<meta name="mobile-web-app-capable" content="yes">
				<meta name="HandheldFriendly" content="true">
				<meta name="keywords" content="ladigitale, collaborative, education, openedtech, free software">
				<meta name="description" content="Une application en ligne pour créer des murs multimédias collaboratifs proposée par La Digitale">
				<meta name="robots" content="index, no-follow" />
				<meta name="theme-color" content="#00ced1">
				<meta property="og:title" content="${titre}">
				<meta property="og:description" content="Une application en ligne pour créer des murs multimédias collaboratifs proposée par La Digitale">
				<meta property="og:type" content="website" />
				<meta property="og:url" content="https://digipad.app" />
				<meta property="og:image" content="https://digipad.app/img/digipad.png" />
				<meta property="og:locale" content="fr_FR" />
				<title>${titre}</title>
				<link rel="icon" type="image/png" href="/img/favicon.png">
			</head>
			<body>
				<noscript>
      				<strong>Veuillez activer Javascript dans votre navigateur pour utiliser <i>Digipad</i>.</strong>
    			</noscript>
				<div id="app"></div>
				<script src="/js/qrcode.js"></script>
				<script src="/js/jspanel.js"></script>
				<script src="/js/flex-images.js"></script>
			</body>
		</html>`
  	return {
    	documentHtml
  	}
}
