<template>
	<Transition name="fondu">
		<div id="conteneur-chargement">
			<div id="chargement">
				<div class="spinner">
					<div />
					<div />
					<div />
					<div />
					<div />
					<div />
					<div />
					<div />
					<div />
					<div />
					<div />
					<div />
				</div>
			</div>
		</div>
	</Transition>
</template>

<script>
export default {
	name: 'Chargement'
}
</script>

<style scoped>
#conteneur-chargement {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	width: 100%;
	height: 100%;
	z-index: 10000;
	background: transparent;
}

#chargement {
	display: flex;
	justify-content: center;
	align-items: center;
	width: 100%;
	height: 100%;
}
</style>
