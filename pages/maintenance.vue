<template>
	<main id="page">
		<div id="maintenance">
			<h1>{{ $t('maintenance') }}</h1>
			<h3>{{ $t('maintenanceDigipad') }}</h3>
		</div>
	</main>
</template>

<script>
export default {
	name: 'Maintenance',
	head () {
		return {
			title: 'Maintenance - Digipad by La Digitale'
		}
	},
	computed: {
		langue () {
			return this.$store.state.langue
		}
	},
	created () {
		this.$i18n.setLocale(this.langue)
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
