import axios from 'axios'

export { onBeforeRender }

async function onBeforeRender (pageContext) {
	let pageProps
	let redirection = '/'
	const id = pageContext.routeParams.id
	const token = pageContext.routeParams.token
	const identifiant = pageContext.identifiant
	const statut = pageContext.statut
	let pads = pageContext.pads
	const reponse = await axios.post(pageContext.hote + '/api/recuperer-donnees-pad', {
		id: id,
		token: token,
		identifiant: identifiant,
		statut: statut
	}, {
		headers: { 'Content-Type': 'application/json' }
	}).catch(function () {
		if (statut === 'utilisateur') {
			redirection = '/u/' + identifiant
		}
		pageProps = { redirection }
	})
	if (!reponse || !reponse.hasOwnProperty('data') || !reponse.data.hasOwnProperty('pad') || !reponse.data.hasOwnProperty('blocs') || !reponse.data.hasOwnProperty('activite') || (reponse.data && reponse.data === 'erreur')) {
		if (statut === 'utilisateur') {
			redirection = '/u/' + identifiant
		}
		pageProps = { redirection }
	} else {
		let admin = false
		if ((reponse.data.pad.hasOwnProperty('identifiant') && reponse.data.pad.identifiant === identifiant) || (reponse.data.pad.hasOwnProperty('admins') && reponse.data.pad.admins.includes(identifiant)) || (statut === 'auteur' && reponse.data.pad.hasOwnProperty('id') && pads.includes(reponse.data.pad.id))) {
			admin = true
		}
		if (!admin && reponse.data.pad.acces === 'prive' && statut === 'utilisateur') {
			redirection = '/u/' + identifiant
			pageProps = { redirection }
		} else if (!admin && reponse.data.pad.acces === 'prive' && statut !== 'utilisateur') {
			pageProps = { redirection }
		} else {
			const params = pageContext.params
			const hote = pageContext.hote
			const userAgent = pageContext.userAgent
			const langues = pageContext.langues
			const nom = pageContext.nom
			const langue = pageContext.langue
			let digidrive = pageContext.digidrive
			const pad = reponse.data.pad
			const blocs = reponse.data.blocs
			const activite = reponse.data.activite
			const titre = pad.titre + ' - Digipad by La Digitale'
			if (!admin) {
				digidrive = []
				pads = []
			}
			pageProps = { params, hote, userAgent, langues, identifiant, nom, langue, statut, pads, digidrive, pad, blocs, activite, titre }
		}
	}
	return {
		pageContext: {
			pageProps
		}
	}
}
