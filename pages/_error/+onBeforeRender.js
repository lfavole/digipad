export { onBeforeRender }

function onBeforeRender (pageContext) {
	const langue = pageContext.langue
	const titre = 'Erreur - Digipad by La Digitale'
	const pageProps = { langue, titre }
	return {
		pageContext: {
			pageProps
		}
	}
}
