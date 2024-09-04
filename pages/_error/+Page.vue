<template>
	<div id="page">
		<div id="erreur">
			<h1>{{ $t('erreur') }}</h1>
			<h3>{{ $t('erreurChargementPage') }}</h3>
			<a href="/">{{ $t('retourAccueil') }}</a>
		</div>

		<ChargementPage v-if="chargementPage" />
	</div>
</template>

<script>
import ChargementPage from '#root/components/chargement-page.vue'

export default {
	name: 'Erreur',
	components: {
		ChargementPage
	},
	data () {
		return {
			chargementPage: true
		}
	},
	mounted () {
		setTimeout(function () {
			this.chargementPage = false
		}.bind(this), 300)
	}
}
</script>

<style scoped>
#page {
	display: flex;
	justify-content: center;
	align-items: center;
	width: 100%;
	height: 100%;
	overflow: auto;
}

#erreur {
	padding: 2rem;
	margin-bottom: 7rem;
}

#page h1 {
	font-size: 4.5rem;
	text-transform: uppercase;
	text-align: center;
	margin-bottom: 3rem;
}

#page h3 {
	font-size: 2.7rem;
	text-align: center;
	margin-bottom: 3rem;
}

#page a {
	display: block;
	text-decoration: underline;
	text-align: center;
}

@media screen and (max-width: 599px) {
	#page h1 {
		font-size: 3.2rem;
	}

	#page h3 {
		font-size: 2rem;
	}
}
</style>
