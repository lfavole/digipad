import axios from 'axios'

export { onBeforeRender }

async function onBeforeRender (pageContext) {
	let pageProps
	let redirection = '/'
	const id = pageContext.routeParams.id
	const token = pageContext.routeParams.token
	let identifiant = pageContext.identifiant
	let statut = pageContext.statut
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
	if (!reponse || !reponse.hasOwnProperty('data') || (reponse.data && reponse.data === 'erreur_pad')) {
		if (statut === 'utilisateur') {
			redirection = '/u/' + identifiant
		}
		pageProps = { redirection }
	} else {
		const params = pageContext.params
		const hote = pageContext.hote
		const userAgent = pageContext.userAgent
		const langues = pageContext.langues
		let nom, langue, digidrive
		const id = params.id
		const mdp = params.mdp
		if (id && id !== '' && mdp && mdp !== '') {
			const rep = await axios.post(hote + '/api/verifier-acces', {
				pad: reponse.data.pad.id,
				identifiant: id,
				motdepasse: atob(mdp)
			})
			if (rep.data.hasOwnProperty('message') && rep.data.message === 'pad_debloque') {
				identifiant = id
				nom = rep.data.nom
				langue = rep.data.langue
				statut = 'auteur'
				digidrive = rep.data.digidrive
			}
		} else {
			nom = pageContext.nom
			langue = pageContext.langue
			digidrive = pageContext.digidrive
		}
		let admin = false
		if ((reponse.data.pad.hasOwnProperty('identifiant') && reponse.data.pad.identifiant === identifiant) || (reponse.data.pad.hasOwnProperty('admins') && reponse.data.pad.admins.includes(identifiant))) {
			admin = true
		}
		if (!admin && reponse.data.pad.acces === 'prive' && statut === 'utilisateur') {
			redirection = '/u/' + identifiant
			pageProps = { redirection }
		} else if (!admin && reponse.data.pad.acces === 'prive' && statut !== 'utilisateur') {
			pageProps = { redirection }
		} else {
			const acces = pageContext.acces
			const pads = pageContext.pads
			const pad = reponse.data.pad
			const blocs = reponse.data.blocs
			const activite = reponse.data.activite
			const titre = pad.titre + ' - Digipad by La Digitale'
			pageProps = { params, hote, userAgent, langues, identifiant, nom, langue, statut, acces, pads, digidrive, pad, blocs, activite, titre }
		}
	}
	return {
		pageContext: {
			pageProps
		}
	}
}
