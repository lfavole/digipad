<template>
	<div id="conteneur-message" class="conteneur-modale">
		<div id="message" class="modale" role="dialog">
			<div class="conteneur">
				<div class="contenu">
					<div class="message" v-html="message" />
					<div class="actions">
						<span class="bouton" role="button" tabindex="0" @click="$emit('fermer')" @keydown.enter="$emit('fermer')">{{ $t('fermer') }}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
export default {
	name: 'Message',
	props: {
		message: String
	},
	mounted () {
		if (message !== '') {
			this.$emit('elementPrecedent', document.activeElement || document.body)
			this.$nextTick(function () {
				document.querySelector('#message .bouton').focus()
			})
		}
	}
}
</script>
