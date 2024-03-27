export { onBeforeRender }

function onBeforeRender (pageContext) {
	const hote = pageContext.hote
	const langue = pageContext.langue
	const acces = pageContext.acces
	const titre = 'Admin - Digipad by La Digitale'
	const pageProps = { hote, langue, acces, titre }
	return {
		pageContext: {
			pageProps
		}
	}
}
