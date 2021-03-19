export default function (context) {
	const userAgent = context.userAgent = process.server ? context.req.headers['user-agent'] : navigator.userAgent
	context.store.dispatch('modifierUserAgent', userAgent)
	if (context.req && context.req.session && context.req.session.identifiant !== '' && context.req.session.identifiant !== undefined) {
		const donnees = {}
		donnees.identifiant = context.req.session.identifiant
		donnees.motdepasse = context.req.session.motdepasse
		donnees.nom = context.req.session.nom
		donnees.langue = context.req.session.langue
		donnees.statut = context.req.session.statut
		context.store.dispatch('modifierUtilisateur', donnees)
	}
}
