export { onBeforeRender }

function onBeforeRender (pageContext) {
	const hote = pageContext.hote
	const langue = pageContext.langue
	const titre = 'Admin - Digipad by La Digitale'
	const pageProps = { hote, langue, titre }
	return {
		pageContext: {
			pageProps
		}
	}
}
