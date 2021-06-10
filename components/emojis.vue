<template>
	<div id="emojis" :class="definirClasses()">
		<h5>{{ $t('emoticones') }}</h5>
		<div class="categorie">
			<span v-for="(smiley, indexSmiley) in smileys" @click="insererEmoji(smiley)" :key="indexSmiley">{{ smiley }}</span>
		</div>
	</div>
</template>

<script>
export default {
	name: 'Emojis',
	props: {
		type: String,
		diaporama: Boolean
	},
	data () {
		return {
			smileys: ['🙂', '😀', '😁', '😂', '🤣', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '😘', '😗', '😙', '😚', '🤗', '🤩', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😮', '🤐', '😯', '😪', '😫', '😴', '😌', '😛', '😜', '😝', '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '🙁', '😖', '😞', '😟', '😤', '😢', '😭', '😨', '😩', '🤯', '😬', '😰', '😱', '😳', '😵', '😡', '😠', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '😇', '🤠', '🤡', '🤥', '🤫', '🤭', '🧐', '🤓', '👹', '👺', '💀', '👻', '👽', '🤖', '💐', '🔥', '❤️', '🙏', '👍', '👎', '👌', '🙌', '✌️', '🎵', '👏', '💯', '✔️', '☀️', '✨', '🎉', '💪', '✊', '👑']
		}
	},
	methods: {
		definirClasses () {
			if (this.diaporama === true) {
				return this.type + ' diaporama'
			} else {
				return this.type
			}
		},
		insererEmoji (emoji) {
			this.$emit('emoji', emoji)
		}
	}
}
</script>

<style scoped>
#emojis {
	position: absolute;
	height: 17.2rem;
    width: 30rem;
	padding: 1rem;
	border: 1px solid #ddd;
	background: #fff;
	box-shadow: 0px 0px 8px 3px rgba(0, 0, 0, 0.2);
	overflow: auto;
	-webkit-overflow-scrolling: touch;
	z-index: 10;
	line-height: 1.25;
}

#emojis.commentaire {
	bottom: 12rem;
	left: 1rem;
}

#emojis.commentaire.diaporama {
	left: -1px;
}

#emojis.commentaire-modifie {
	top: 11.5rem;
	left: -1px;
}

#emojis h5 {
	margin: 0 0 2px 0;
	text-transform: uppercase;
	font-size: 1rem;
	cursor: default;
}

.categorie {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	width: 100%;
}

.categorie:after {
	content: '';
	flex: auto;
}

.categorie span {
	font-size: 2rem;
	padding: 2px;
	cursor: pointer;
	border-radius: 0.5rem;
}

.categorie span:hover {
	background: #ececec;
	cursor: pointer;
}
</style>
