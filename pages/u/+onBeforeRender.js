export { onBeforeRender }

async function onBeforeRender (pageContext) {
	let pageProps, erreur
	if (pageContext.hasOwnProperty('erreur')) {
		erreur = true
		pageProps = { erreur }
	} else {
		const params = pageContext.params
		const hote = pageContext.hote
		const identifiant = pageContext.identifiant
		const nom = pageContext.nom
		const email = pageContext.email
		const langue = pageContext.langue
		const statut = pageContext.statut
		const affichage = pageContext.affichage
		const classement = pageContext.classement
		const padsCrees = pageContext.padsCrees
		const padsRejoints = pageContext.padsRejoints
		const padsAdmins = pageContext.padsAdmins
		const padsFavoris = pageContext.padsFavoris
		const dossiers = pageContext.dossiers
		const titre = identifiant + ' - Digipad by La Digitale'
		pageProps = { params, hote, identifiant, nom, email, langue, statut, affichage, classement, padsCrees, padsRejoints, padsAdmins, padsFavoris, dossiers, titre }
	}
	return {
		pageContext: {
			pageProps
		}
	}
}
