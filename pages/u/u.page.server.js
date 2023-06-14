import axios from 'axios'

export { onBeforeRender }

async function onBeforeRender (pageContext) {
	let pageProps, erreur
	const identifiant = pageContext.routeParams.utilisateur
	const reponse = await axios.post(pageContext.hote + '/api/recuperer-donnees-utilisateur', {
		identifiant: identifiant
	}, {
		headers: { 'Content-Type': 'application/json' }
	}).catch(function () {
		erreur = true
		pageProps = { erreur }
	})
	if (reponse && reponse.hasOwnProperty('data') && identifiant === pageContext.identifiant && pageContext.statut === 'utilisateur') {
		const params = pageContext.params
		const hote = pageContext.hote
		const nom = pageContext.nom
		const email = pageContext.email
		const langue = pageContext.langue
		const statut = pageContext.statut
		const affichage = reponse.data.affichage
		const classement = reponse.data.classement
		const padsCrees = reponse.data.padsCrees
		const padsRejoints = reponse.data.padsRejoints
		const padsAdmins = reponse.data.padsAdmins
		const padsFavoris = reponse.data.padsFavoris
		const dossiers = reponse.data.dossiers
		const titre = identifiant + ' - Digipad by La Digitale'
		pageProps = { params, hote, identifiant, nom, email, langue, statut, affichage, classement, padsCrees, padsRejoints, padsAdmins, padsFavoris, dossiers, titre }
	} else {
		erreur = true
		pageProps = { erreur }
	}
	return {
		pageContext: {
			pageProps
		}
	}
}
