<template>
	<div id="page">
		<div id="maintenance">
			<h1>{{ $t('maintenance') }}</h1>
			<h3>{{ $t('maintenanceDigipad') }}</h3>
		</div>

		<ChargementPage v-if="chargementPage" />
	</div>
</template>

<script>
import ChargementPage from '#root/components/chargement-page.vue'

export default {
	name: 'Maintenance',
	components: {
		ChargementPage
	},
	data () {
		return {
			chargementPage: true,
			langue: this.$pageContext.pageProps.langue
		}
	},
	created () {
		this.$i18n.locale = this.langue
	},
	mounted () {
		document.getElementsByTagName('html')[0].setAttribute('lang', this.langue)

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

#maintenance {
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
