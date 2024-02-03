<template>
	<div id="conteneur-message" class="conteneur-modale" role="dialog" tabindex="-1">
		<div id="message" class="modale" role="document">
			<div class="conteneur">
				<div class="contenu">
					<div class="message" v-html="message" />
					<div class="actions">
						<span class="bouton" role="button" tabindex="0" @click="$emit('fermer')">{{ $t('fermer') }}</span>
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
	}
}
</script>
