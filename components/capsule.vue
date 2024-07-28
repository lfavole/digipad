<template>
	<div class="contenu">
		<div class="titre" v-if="item.titre !== ''" :style="{'background': $parent.$parent.eclaircirCouleur(item.couleur)}">
			<span>{{ item.titre }}</span>
			<i class="material-icons" v-if="action === 'organiser'">drag_indicator</i>
		</div>
		<div class="texte" v-if="item.texte !== ''" v-html="item.texte" />
		<div class="media" v-if="item.media !== '' && action !== 'organiser'">
			<img role="button" :tabindex="tabindex" v-if="item.type === 'image'" :src="'/' + $parent.$parent.definirDossierFichiers(pad.id) + '/' + pad.id + '/' + item.media" loading="lazy" :alt="item.media" @click="$parent.$parent.afficherVisionneuse(item)" @keydown.enter="$parent.$parent.afficherVisionneuse(item)">
			<img role="button" :tabindex="tabindex" v-else-if="item.type === 'lien-image'" :src="item.media" loading="lazy" :alt="item.media" @click="$parent.$parent.afficherVisionneuse(item)" @keydown.enter="$parent.$parent.afficherVisionneuse(item)">
			<span role="button" :tabindex="tabindex" v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'document' || item.type === 'pdf' || item.type === 'office' || item.type === 'embed'" @click="$parent.$parent.afficherVisionneuse(item)" @keydown.enter="$parent.$parent.afficherVisionneuse(item)"><img :class="{'vignette': $parent.$parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="$parent.$parent.definirVignette(item)" :alt="$parent.$parent.definirVignette(item)" loading="lazy"></span>
			<span v-else-if="item.type === 'lien'"><a :href="item.media" target="_blank"><img :class="{'vignette': $parent.$parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="$parent.$parent.definirVignette(item)" :alt="$parent.$parent.definirVignette(item)" loading="lazy"></a></span>
			<span v-else><a :href="'/' + $parent.$parent.definirDossierFichiers(pad.id) + '/' + pad.id + '/' + item.media" download><img :class="{'vignette': $parent.$parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="$parent.$parent.definirVignette(item)" :alt="$parent.$parent.definirVignette(item)" loading="lazy"></a></span>
		</div>
		<div class="media" v-else-if="item.media !== '' && action === 'organiser'">
			<img v-if="item.type === 'image'" :src="'/' + $parent.$parent.definirDossierFichiers(pad.id) + '/' + pad.id + '/' + item.media" loading="lazy" :alt="item.media">
			<img v-else-if="item.type === 'lien-image'" :src="item.media" loading="lazy" :alt="item.media">
			<span v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'document' || item.type === 'pdf' || item.type === 'office' || item.type === 'embed'"><img :class="{'vignette': $parent.$parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="$parent.$parent.definirVignette(item)" loading="lazy" :alt="$parent.$parent.definirVignette(item)"></span>
			<span v-else-if="item.type === 'lien'"><img :class="{'vignette': $parent.$parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="$parent.$parent.definirVignette(item)" loading="lazy" :alt="$parent.$parent.definirVignette(item)"></span>
			<span v-else><img :class="{'vignette': $parent.$parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="$parent.$parent.definirVignette(item)" loading="lazy" :alt="$parent.$parent.definirVignette(item)"></span>
		</div>
		<div class="evaluation" v-if="pad.evaluations === 'activees'">
			<span class="etoiles">
				<i class="material-icons" :class="{'evalue': $parent.$parent.verifierUtilisateurEvaluation(item.evaluations) === true}" v-for="etoile in $parent.$parent.definirEvaluationCapsule(item.evaluations)" :key="'etoilepleine_' + etoile">star</i>
				<i class="material-icons" :class="{'evalue': $parent.$parent.verifierUtilisateurEvaluation(item.evaluations) === true}" v-for="etoile in (5 - $parent.$parent.definirEvaluationCapsule(item.evaluations))" :key="'etoilevide_' + etoile">star_outline</i>
				<span>({{ item.evaluations.length }})</span>
			</span>
			<span class="bouton" role="button" :tabindex="tabindex" :title="$t('evaluerCapsule')" :style="{'color': couleur}" @click="$parent.$parent.ouvrirModaleEvaluations(item.bloc, item.titre, '')" @keydown.enter="$parent.$parent.ouvrirModaleEvaluations(item.bloc, item.titre, '')" v-if="$parent.$parent.verifierUtilisateurEvaluation(item.evaluations) === false && action !== 'organiser'"><i class="material-icons">add_comment</i></span>
			<span class="bouton" role="button" :tabindex="tabindex" :title="$t('evaluerCapsule')" :style="{'color': couleur}" @click="$parent.$parent.ouvrirModaleEvaluations(item.bloc, item.titre, item.evaluations)" @keydown.enter="$parent.$parent.ouvrirModaleEvaluations(item.bloc, item.titre, item.evaluations)" v-else-if="$parent.$parent.verifierUtilisateurEvaluation(item.evaluations) === true && action !== 'organiser'"><i class="material-icons">rate_review</i></span>
		</div>
		<div class="action" :style="{'color': item.couleur}">
			<span class="bouton" role="button" :tabindex="tabindex" :title="$t('modifierCapsule')" @click="$parent.$parent.ouvrirModaleBloc('edition', item, indexCol)" @keydown.enter="$parent.$parent.ouvrirModaleBloc('edition', item, indexCol)" v-if="(item.identifiant === identifiant || admin || pad.contributions === 'modifiables') && action !== 'organiser'"><i class="material-icons">edit</i></span>
			<span class="bouton" role="button" :tabindex="tabindex" :title="$t('commenterCapsule')" @click="$parent.$parent.ouvrirModaleCommentaires(item.bloc, item.titre)" @keydown.enter="$parent.$parent.ouvrirModaleCommentaires(item.bloc, item.titre)" v-if="pad.commentaires === 'actives'"><i class="material-icons">comment</i><span class="badge">{{ item.commentaires }}</span></span>
			<span class="bouton info" role="button" :tabindex="tabindex" :title="$t('informationsCapsule')" :data-description="$parent.$parent.definirDescription(item)"><i class="material-icons">info</i></span>
			<span class="media-type" v-if="item.media !== ''"><i class="material-icons">{{ $parent.$parent.definirIconeMedia(item) }}</i></span>
			<span class="bouton" role="button" :tabindex="tabindex" :title="$t('copierCapsule')" @click="$parent.$parent.afficherEnvoyerBloc(item.bloc, item.titre)" @keydown.enter="$parent.$parent.afficherEnvoyerBloc(item.bloc, item.titre)" v-if="admin && pad.copieBloc === 'activee' && (statut === 'utilisateur' || digidrive) && action !== 'organiser'"><i class="material-icons">send</i></span>
			<span class="bouton supprimer" role="button" :tabindex="tabindex" :title="$t('supprimerCapsule')" @click="$parent.$parent.afficherSupprimerBloc(item.bloc, item.titre, indexCol)" @keydown.enter="$parent.$parent.afficherSupprimerBloc(item.bloc, item.titre, indexCol)" v-if="(item.identifiant === identifiant || admin) && action !== 'organiser'"><i class="material-icons">delete</i></span>
		</div>
		<div class="moderation" v-if="item.visibilite === 'privee' && admin">
			<span class="bouton" role="button" :tabindex="tabindex" @click="$parent.$parent.autoriserBloc(item, 'privee')" @keydown.enter="$parent.$parent.autoriserBloc(item, 'privee')">{{ $t('afficherCapsule') }}</span>
		</div>
		<div class="moderation" v-else-if="pad.contributions === 'moderees' && item.visibilite === 'masquee'">
			<span class="bouton" role="button" :tabindex="tabindex" @click="$parent.$parent.autoriserBloc(item, 'moderee')" @keydown.enter="$parent.$parent.autoriserBloc(item, 'moderee')" v-if="admin">{{ $t('validerCapsule') }}</span>
			<span class="bouton" v-else-if="item.identifiant === identifiant">{{ $t('enAttenteModeration') }}</span>
		</div>
	</div>
</template>

<script>
export default {
	name: 'Capsule',
	props: {
		admin: Boolean,
		identifiant: String,
		item: Object,
		pad: Object,
		couleur: String,
		indexCol: Number,
		tabindex: Number,
		action: String,
		statut: String,
		digidrive: Boolean
	}
}
</script>
