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
	name: 'ChargementPage'
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
	z-index: 100000;
	background: rgba(255, 255, 255, 0.85);
}

#chargement {
	display: flex;
	justify-content: center;
	align-items: center;
	width: 100%;
	height: 100%;
}
</style>
