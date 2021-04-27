<template>
	<main id="page" v-if="identifiant !== '' && statut === 'utilisateur'">
		<header>
			<span id="conteneur-logo">
				<span id="logo" />
			</span>
			<span id="titre">{{ $t('monCompte') }}</span>
		</header>

		<nav id="nav">
			<span role="button" id="compte" @click="menu = !menu" :title="$t('parametresCompte')"><i class="material-icons">account_circle</i></span>
			<span role="button" id="recherche" @click="recherche = !recherche" :title="$t('recherche')"><i class="material-icons">search</i></span>
			<span role="button" id="informations" :title="$t('nouveautesEtFAQ')"><a href="https://drive.infomaniak.com/app/share/139248/eb7c3ad0-a36f-45f2-8125-3e2c59cce1fc/preview/text/4259" target="_blank"><i class="material-icons">help_outline</i></a></span>
			<span role="button" id="deconnexion" @click="deconnexion" :title="$t('deconnexion')"><i class="material-icons">power_settings_new</i></span>
		</nav>

		<div class="menu gauche" :class="{'ouvert': menu}">
			<div class="en-tete">
				<span class="titre">{{ $t('parametresCompte') }}</span>
				<span role="button" class="fermer" @click="menu = false"><i class="material-icons">close</i></span>
			</div>
			<div class="contenu ascenseur">
				<div class="conteneur">
					<label>{{ $t('langue') }}</label>
					<div id="langues">
						<span role="button" :class="{'selectionne': langue === 'fr'}" @click="modifierLangue('fr')">FR</span>
						<span role="button" :class="{'selectionne': langue === 'es'}" @click="modifierLangue('es')">ES</span>
						<span role="button" :class="{'selectionne': langue === 'it'}" @click="modifierLangue('it')">IT</span>
						<span role="button" :class="{'selectionne': langue === 'en'}" @click="modifierLangue('en')">EN</span>
					</div>
				</div>
				<div class="conteneur">
					<label for="identifiant">{{ $t('identifiant') }}</label>
					<input id="identifiant" type="text" readonly :value="identifiant">
				</div>
				<div class="conteneur">
					<label for="nom">{{ $t('nom') }}</label>
					<input id="nom" type="text" maxlength="48" :value="nom" @keydown.enter="modifierNom">
				</div>
				<div class="conteneur conteneur-bouton">
					<span role="button" tabindex="0" class="bouton-vert" @click="modifierNom">{{ $t('enregistrer') }}</span>
				</div>
				<div class="conteneur conteneur-bouton">
					<span role="button" tabindex="0" class="bouton-bleu" @click="afficherModaleMotDePasse">{{ $t('modifierMotDePasse') }}</span>
				</div>
				<div class="conteneur conteneur-bouton">
					<span role="button" tabindex="0" class="bouton-rouge" @click="afficherModaleConfirmation('', 'supprimer-compte')">{{ $t('supprimerCompte') }}</span>
				</div>
			</div>
		</div>

		<div id="onglets">
			<div class="conteneur" :class="{'actif': onglet === 'pads-crees'}" @click="onglet = 'pads-crees'" v-if="!recherche">
				<span>{{ $t('padsCrees') }}</span>
			</div>
			<div class="conteneur" :class="{'actif': onglet === 'pads-rejoints'}" @click="onglet = 'pads-rejoints'" v-if="!recherche">
				<span>{{ $t('padsRejoints') }}</span>
			</div>
			<div class="conteneur recherche" v-if="recherche">
				<input type="text" id="rechercher" maxlength="48" :placeholder="$t('rechercherPads')" @input="requete = $event.target.value">
				<span role="button" @click="recherche = false"><i class="material-icons">close</i></span>
			</div>
		</div>

		<div id="pads" class="ascenseur">
			<transition name="fondu">
				<section class="pads" v-show="onglet === 'pads-crees' && !recherche">
					<div id="boutons">
						<span id="bouton-creer" role="button" tabindex="0" @click="afficherModaleCreerPad">{{ $t('creerPad') }}</span>
						<span id="bouton-importer" role="button" tabindex="0" @click="afficherModaleImporterPad">{{ $t('importerPad') }}</span>
					</div>
					<div class="conteneur-pads" v-if="padsCrees.length > 0">
						<div class="pad" v-for="(pad, indexPad) in padsCrees" :key="'pad_' + indexPad">
							<div class="conteneur" :class="{'fond-personnalise': pad.fond.substring(1, 9) === 'fichiers'}" :style="definirFond(pad.fond)" @click="ouvrirPad(pad)">
								<div class="meta">
									<span class="titre">{{ pad.titre }}</span>
									<span class="date">{{ $t('creeLe') }} {{ $formaterDate(pad.date, langue) }}</span>
								</div>
							</div>
							<div class="action">
								<span class="dupliquer" @click="afficherModaleConfirmation(pad.id, 'dupliquer')" :title="$t('dupliquerPad')"><i class="material-icons">content_copy</i></span>
								<span class="exporter" @click="afficherModaleConfirmation(pad.id, 'exporter')" :title="$t('exporterPad')"><i class="material-icons">get_app</i></span>
								<span class="supprimer" @click="afficherModaleConfirmation(pad.id, 'supprimer')" :title="$t('supprimerPad')"><i class="material-icons">delete</i></span>
							</div>
						</div>
						<template v-if="padsCrees.length < 9">
							<div class="pad espace" v-for="pad in (8 - padsCrees.length)" :key="'espace_' + pad" />
						</template>
					</div>
					<div class="vide" v-else>
						{{ $t('aucunPadCree') }}
					</div>
				</section>
			</transition>

			<transition name="fondu">
				<section class="pads" v-show="onglet === 'pads-rejoints' && !recherche">
					<div class="conteneur-pads" v-if="padsRejoints.length > 0">
						<div class="pad" v-for="(pad, indexPad) in padsRejoints" :key="indexPad">
							<div class="conteneur" :class="{'fond-personnalise': pad.fond.substring(1, 9) === 'fichiers'}" :style="definirFond(pad.fond)" @click="ouvrirPad(pad)">
								<div class="meta">
									<span class="titre">{{ pad.titre }}</span>
									<span class="date">{{ $t('creeLe') }} {{ $formaterDate(pad.date, langue) }} {{ $t('par') }} {{ pad.nom }}</span>
								</div>
							</div>
							<div class="action">
								<span class="supprimer" @click="afficherModaleConfirmation(pad.id, 'supprimer')"><i class="material-icons">delete</i></span>
							</div>
						</div>
						<template v-if="padsRejoints.length < 9">
							<div class="pad espace" v-for="pad in (8 - padsRejoints.length)" :key="'espace_' + pad" />
						</template>
					</div>
					<div class="vide" v-else>
						{{ $t('aucunPadRejoint') }}
					</div>
				</section>
			</transition>

			<transition name="fondu">
				<section class="pads" v-if="recherche">
					<div class="conteneur-pads" v-if="resultats.length > 0">
						<div class="pad" v-for="(pad, indexPad) in resultats" :key="'pad_' + indexPad">
							<div class="conteneur" :class="{'fond-personnalise': pad.fond.substring(1, 9) === 'fichiers'}" :style="definirFond(pad.fond)" @click="ouvrirPad(pad)">
								<div class="meta">
									<span class="titre">{{ pad.titre }}</span>
									<span class="date">{{ $t('creeLe') }} {{ $formaterDate(pad.date, langue) }} {{ $t('par') }} {{ pad.nom }}</span>
								</div>
							</div>
							<div class="action">
								<span class="dupliquer" @click="afficherModaleConfirmation(pad.id, 'dupliquer')" :title="$t('dupliquerPad')" v-if="pad.identifiant === identifiant"><i class="material-icons">content_copy</i></span>
								<span class="exporter" @click="afficherModaleConfirmation(pad.id, 'exporter')" :title="$t('exporterPad')" v-if="pad.identifiant === identifiant"><i class="material-icons">get_app</i></span>
								<span class="supprimer" @click="afficherModaleConfirmation(pad.id, 'supprimer')" :title="$t('supprimerPad')"><i class="material-icons">delete</i></span>
							</div>
						</div>
						<template v-if="resultats.length < 9">
							<div class="pad espace" v-for="pad in (8 - resultats.length)" :key="'espace_' + pad" />
						</template>
					</div>
					<div class="vide" v-else>
						{{ $t('aucunResultat') }}
					</div>
				</section>
			</transition>
		</div>

		<div class="conteneur-modale" v-if="modaleMotDePasse">
			<div id="motdepasse" class="modale">
				<div class="en-tete">
					<span class="titre">{{ $t('modifierMotDePasse') }}</span>
					<span role="button" class="fermer" @click="fermerModaleMotDePasse"><i class="material-icons">close</i></span>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-motdepasse-actuel">{{ $t('motDePasseActuel') }}</label>
						<input id="champ-motdepasse-actuel" type="password" maxlength="24" :value="motDePasse" @input="motDePasse = $event.target.value">
						<label for="champ-nouveau-motdepasse">{{ $t('nouveauMotDePasse') }}</label>
						<input id="champ-nouveau-motdepasse" type="password" maxlength="24" :value="nouveauMotDePasse" @input="nouveauMotDePasse = $event.target.value">
						<label for="champ-confirmation-motdepasse">{{ $t('confirmationNouveauMotDePasse') }}</label>
						<input id="champ-confirmation-motdepasse" type="password" maxlength="24" :value="confirmationNouveauMotDePasse" @input="confirmationNouveauMotDePasse = $event.target.value" @keydown.enter="modifierMotDePasse">
						<div class="actions">
							<span role="button" tabindex="0" class="bouton" @click="modifierMotDePasse">{{ $t('modifier') }}</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-if="modaleCreerPad">
			<div id="creation" class="modale">
				<div class="en-tete">
					<span class="titre">{{ $t('creerPad') }}</span>
					<span role="button" class="fermer" @click="fermerModaleCreerPad"><i class="material-icons">close</i></span>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-titre-pad">{{ $t('titrePad') }}</label>
						<input id="champ-titre-pad" type="text" maxlength="48" :value="titre" @input="titre = $event.target.value" @keydown.enter="creerPad">
						<div class="actions">
							<span role="button" tabindex="0" class="bouton" @click="creerPad">{{ $t('creer') }}</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-if="modaleImporterPad">
			<div id="import" class="modale">
				<div class="en-tete">
					<span class="titre">{{ $t('importerPad') }}</span>
					<span role="button" class="fermer" @click="fermerModaleImporterPad"><i class="material-icons">close</i></span>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<div class="conteneur-interrupteur" v-if="progressionImport === 0">
							<span>{{ $t('importerCommentaires') }}</span>
							<label class="bouton-interrupteur">
								<input type="checkbox" :checked="parametresImport.commentaires" @change="modifierParametresImport($event, 'commentaires')">
								<span class="barre" />
							</label>
						</div>
						<div class="conteneur-interrupteur" v-if="progressionImport === 0">
							<span>{{ $t('importerEvaluations') }}</span>
							<label class="bouton-interrupteur">
								<input type="checkbox" :checked="parametresImport.evaluations" @change="modifierParametresImport($event, 'evaluations')">
								<span class="barre" />
							</label>
						</div>
						<div class="conteneur-interrupteur" v-if="progressionImport === 0">
							<span>{{ $t('importerActivite') }}</span>
							<label class="bouton-interrupteur">
								<input type="checkbox" :checked="parametresImport.activite" @change="modifierParametresImport($event, 'activite')">
								<span class="barre" />
							</label>
						</div>
						<label for="importer-pad" class="bouton" v-show="progressionImport === 0">{{ $t('selectionnerPad') }}</label>
						<input id="importer-pad" type="file" style="display: none" accept=".zip" @change="importerPad">
						<div class="conteneur-chargement progression" v-if="progressionImport > 0">
							<progress class="barre-progression" max="100" :value="progressionImport" />
							<div class="chargement" />
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale alerte" v-if="modaleConfirmation !== ''">
			<div class="modale">
				<div class="conteneur">
					<div class="contenu">
						<div class="message" v-html="$t('confirmationDupliquerPad')" v-if="modaleConfirmation === 'dupliquer'" />
						<div class="message" v-html="$t('confirmationExporterPad')" v-else-if="modaleConfirmation === 'exporter'" />
						<div class="message" v-html="$t('confirmationSupprimerPad')" v-else-if="modaleConfirmation === 'supprimer'" />
						<div class="message" v-html="$t('confirmationSupprimerCompte')" v-else-if="modaleConfirmation === 'supprimer-compte'" />
						<div class="actions">
							<span role="button" tabindex="0" class="bouton" @click="fermerModaleConfirmation">{{ $t('non') }}</span>
							<span role="button" tabindex="0" class="bouton" @click="dupliquerPad" v-if="modaleConfirmation === 'dupliquer'">{{ $t('oui') }}</span>
							<span role="button" tabindex="0" class="bouton" @click="exporterPad" v-else-if="modaleConfirmation === 'exporter'">{{ $t('oui') }}</span>
							<span role="button" tabindex="0" class="bouton" @click="supprimerPad" v-else-if="modaleConfirmation === 'supprimer'">{{ $t('oui') }}</span>
							<span role="button" tabindex="0" class="bouton" @click="supprimerCompte" v-else-if="modaleConfirmation === 'supprimer-compte'">{{ $t('oui') }}</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<chargement :chargement="chargement" v-if="chargement" />
	</main>
</template>

<script>
import axios from 'axios'
import saveAs from 'file-saver'
import chargement from '../../components/chargement.vue'

export default {
	name: 'Utilisateur',
	components: {
		chargement
	},
	watchQuery: ['page'],
	async asyncData (context) {
		const { data } = await axios.post(context.store.state.hote + '/api/recuperer-donnees-utilisateur', {
			identifiant: context.store.state.identifiant
		}, {
			headers: { 'Content-Type': 'application/json' }
		})
		return {
			padsCrees: data.padsCrees,
			padsRejoints: data.padsRejoints
		}
	},
	data () {
		return {
			chargement: false,
			onglet: 'pads-crees',
			titre: '',
			menu: false,
			modaleCreerPad: false,
			modaleImporterPad: false,
			progressionImport: 0,
			modaleConfirmation: '',
			padId: '',
			modaleMotDePasse: false,
			motDePasse: '',
			nouveauMotDePasse: '',
			confirmationNouveauMotDePasse: '',
			recherche: false,
			requete: '',
			parametresImport: {
				commentaires: false,
				evaluations: false,
				activite: false
			}
		}
	},
	computed: {
		hote () {
			return this.$store.state.hote
		},
		identifiant () {
			return this.$store.state.identifiant
		},
		nom () {
			return this.$store.state.nom
		},
		langue () {
			return this.$store.state.langue
		},
		statut () {
			return this.$store.state.statut
		},
		resultats () {
			const pads = this.padsCrees.concat(this.padsRejoints)
			const resultats = pads.filter(function (element) {
				return element.titre.toLowerCase().includes(this.requete.toLowerCase()) || element.nom.toLowerCase().includes(this.requete.toLowerCase())
			}.bind(this))
			return resultats
		}
	},
	watch: {
		recherche: function (valeur) {
			if (valeur === true) {
				this.$nextTick(function () {
					document.querySelector('#rechercher').focus()
				})
			}
		}
	},
	created () {
		if (this.identifiant === '' || this.statut === 'invite') {
			this.$router.push('/')
		}
		this.$i18n.setLocale(this.langue)
	},
	methods: {
		definirFond (fond) {
			if (fond.substring(0, 1) === '#') {
				return { backgroundColor: fond }
			} else {
				return { backgroundImage: 'url(' + fond + ')' }
			}
		},
		afficherModaleCreerPad () {
			this.modaleCreerPad = true
			this.$nextTick(function () {
				document.querySelector('#creation input').focus()
			})
		},
		creerPad () {
			if (this.titre !== '') {
				axios.post(this.hote + '/api/creer-pad', {
					titre: this.titre,
					identifiant: this.identifiant
				}).then(function (reponse) {
					const donnees = reponse.data
					if (donnees === 'non_connecte') {
						this.$router.push('/')
					} else if (donnees === 'erreur_creation') {
						this.$store.dispatch('modifierAlerte', this.$t('erreurCreationPad'))
					} else {
						this.padsCrees.push(donnees)
						this.$router.push('/p/' + donnees.id + '/' + donnees.token)
					}
				}.bind(this)).catch(function () {
					this.$store.dispatch('modifierAlerte', this.$t('erreurCommunicationServeur'))
				}.bind(this))
			}
		},
		fermerModaleCreerPad () {
			this.modaleCreerPad = false
			this.titre = ''
		},
		afficherModaleImporterPad () {
			this.modaleImporterPad = true
		},
		modifierParametresImport (event, type) {
			this.parametresImport[type] = event.target.checked
		},
		importerPad () {
			const champ = document.querySelector('#importer-pad')
			const extension = champ.files[0].name.substring(champ.files[0].name.lastIndexOf('.') + 1).toLowerCase()
			if (champ.files && champ.files[0] && extension === 'zip') {
				const formulaire = new FormData()
				formulaire.append('parametres', JSON.stringify(this.parametresImport))
				formulaire.append('fichier', champ.files[0])
				axios.post(this.hote + '/api/importer-pad', formulaire, {
					headers: {
						'Content-Type': 'multipart/form-data'
					},
					onUploadProgress: function (progression) {
						const pourcentage = parseInt(Math.round((progression.loaded * 100) / progression.total))
						this.progressionImport = pourcentage
					}.bind(this)
				}).then(function (reponse) {
					const donnees = reponse.data
					if (donnees === 'non_connecte') {
						this.$router.push('/')
					} else if (donnees === 'erreur_import') {
						this.fermerModaleImporterPad()
						this.$store.dispatch('modifierAlerte', this.$t('erreurImportPad'))
					} else if (donnees === 'donnees_corrompues') {
						this.fermerModaleImporterPad()
						this.$store.dispatch('modifierAlerte', this.$t('donneesCorrompuesImportPad'))
					} else {
						this.padsCrees.push(donnees)
						this.$store.dispatch('modifierMessage', this.$t('padImporte'))
						this.fermerModaleImporterPad()
					}
				}.bind(this)).catch(function () {
					this.fermerModaleImporterPad()
					this.$store.dispatch('modifierAlerte', this.$t('erreurCommunicationServeur'))
				}.bind(this))
			} else {
				this.$store.dispatch('modifierAlerte', this.$t('formatFichierPasAccepte'))
				champ.value = ''
			}
		},
		fermerModaleImporterPad () {
			this.modaleImporterPad = false
			this.parametresImport.commentaires = false
			this.parametresImport.evaluations = false
			this.parametresImport.activite = false
			this.progressionImport = 0
			document.querySelector('#importer-pad').value = ''
		},
		ouvrirPad (pad) {
			this.$router.push('/p/' + pad.id + '/' + pad.token)
		},
		afficherModaleConfirmation (pad, type) {
			if (type === 'supprimer-compte') {
				this.menu = false
			} else {
				this.padId = pad
			}
			this.modaleConfirmation = type
		},
		fermerModaleConfirmation () {
			this.modaleConfirmation = ''
			this.padId = ''
		},
		dupliquerPad () {
			this.modaleConfirmation = ''
			this.chargement = true
			axios.post(this.hote + '/api/dupliquer-pad', {
				padId: this.padId,
				identifiant: this.identifiant
			}).then(function (reponse) {
				const donnees = reponse.data
				if (donnees === 'non_connecte') {
					this.$router.push('/')
				} else if (donnees === 'erreur_duplication') {
					this.chargement = false
					this.$store.dispatch('modifierAlerte', this.$t('erreurDuplicationPad'))
				} else {
					this.padsCrees.push(donnees)
					this.$store.dispatch('modifierMessage', this.$t('padDuplique'))
					this.padId = ''
					this.chargement = false
				}
			}.bind(this)).catch(function () {
				this.chargement = false
				this.$store.dispatch('modifierAlerte', this.$t('erreurCommunicationServeur'))
			}.bind(this))
		},
		exporterPad () {
			this.modaleConfirmation = ''
			this.chargement = true
			axios.post(this.hote + '/api/exporter-pad', {
				padId: this.padId,
				identifiant: this.identifiant
			}).then(function (reponse) {
				const donnees = reponse.data
				if (donnees === 'non_connecte') {
					this.$router.push('/')
				} else if (donnees === 'erreur_export') {
					this.chargement = false
					this.$store.dispatch('modifierAlerte', this.$t('erreurExportPad'))
				} else {
					saveAs('/temp/' + donnees, 'pad-' + this.padId + '.zip')
					this.padId = ''
					this.chargement = false
				}
			}.bind(this)).catch(function () {
				this.chargement = false
				this.$store.dispatch('modifierAlerte', this.$t('erreurCommunicationServeur'))
			}.bind(this))
		},
		supprimerPad () {
			this.modaleConfirmation = ''
			this.chargement = true
			axios.post(this.hote + '/api/supprimer-pad', {
				padId: this.padId,
				identifiant: this.identifiant
			}).then(function (reponse) {
				const donnees = reponse.data
				if (donnees === 'non_connecte') {
					this.$router.push('/')
				} else if (donnees === 'erreur_suppression') {
					this.chargement = false
					this.$store.dispatch('modifierAlerte', this.$t('erreurSuppressionPad'))
				} else {
					this.padsCrees.forEach(function (pad, index) {
						if (pad.id === this.padId) {
							this.padsCrees.splice(index, 1)
						}
					}.bind(this))
					this.padsRejoints.forEach(function (pad, index) {
						if (pad.id === this.padId) {
							this.padsRejoints.splice(index, 1)
						}
					}.bind(this))
					this.$store.dispatch('modifierMessage', this.$t('padSupprime'))
					this.padId = ''
					this.chargement = false
				}
			}.bind(this)).catch(function () {
				this.chargement = false
				this.$store.dispatch('modifierAlerte', this.$t('erreurCommunicationServeur'))
			}.bind(this))
		},
		modifierNom () {
			const nom = document.querySelector('#nom').value
			if (nom !== '' && nom !== this.nom) {
				this.menu = false
				this.chargement = true
				axios.post(this.hote + '/api/modifier-nom', {
					identifiant: this.identifiant,
					nom: nom
				}).then(function (reponse) {
					const donnees = reponse.data
					if (donnees === 'non_connecte') {
						this.$router.push('/')
					} else {
						this.$store.dispatch('modifierNom', nom)
						this.$store.dispatch('modifierMessage', this.$t('nomModifie'))
						this.chargement = false
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.$store.dispatch('modifierAlerte', this.$t('erreurCommunicationServeur'))
				}.bind(this))
			}
		},
		afficherModaleMotDePasse () {
			this.menu = false
			this.modaleMotDePasse = true
		},
		modifierMotDePasse () {
			const motDePasse = this.motDePasse
			const nouveauMotDePasse = this.nouveauMotDePasse
			const confirmationNouveauMotDePasse = this.confirmationNouveauMotDePasse
			if (nouveauMotDePasse === confirmationNouveauMotDePasse) {
				this.modaleMotDePasse = false
				this.chargement = true
				axios.post(this.hote + '/api/modifier-mot-de-passe', {
					identifiant: this.identifiant,
					motdepasse: motDePasse,
					nouveaumotdepasse: nouveauMotDePasse
				}).then(function (reponse) {
					const donnees = reponse.data
					if (donnees === 'non_connecte') {
						this.$router.push('/')
					} else if (donnees === 'motdepasse_incorrect') {
						this.chargement = false
						this.$store.dispatch('modifierAlerte', this.$t('motDePasseActuelPasCorrect'))
					} else if (donnees === 'erreur') {
						this.chargement = false
						this.$store.dispatch('modifierAlerte', this.$t('erreurCommunicationServeur'))
					} else {
						this.$store.dispatch('modifierMessage', this.$t('motDePasseModifie'))
						this.fermerModaleMotDePasse()
						this.chargement = false
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.$store.dispatch('modifierAlerte', this.$t('erreurCommunicationServeur'))
				}.bind(this))
			} else {
				this.$store.dispatch('modifierAlerte', this.$t('nouveauxMotsDePasseCorrespondentPas'))
			}
		},
		fermerModaleMotDePasse () {
			this.modaleMotDePasse = false
			this.motDePasse = ''
			this.nouveauMotDePasse = ''
			this.confirmationNouveauMotDePasse = ''
		},
		modifierLangue (langue) {
			if (this.langue !== langue) {
				this.chargement = true
				axios.post(this.hote + '/api/modifier-langue', {
					identifiant: this.identifiant,
					langue: langue
				}).then(function (reponse) {
					const donnees = reponse.data
					if (donnees === 'non_connecte') {
						this.$router.push('/')
					} else {
						this.$i18n.setLocale(langue)
						this.$store.dispatch('modifierLangue', langue)
						this.$store.dispatch('modifierMessage', this.$t('langueModifiee'))
						this.chargement = false
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.$store.dispatch('modifierAlerte', this.$t('erreurCommunicationServeur'))
				}.bind(this))
			}
		},
		afficherModaleSupprimerCompte () {
			this.menu = false
			this.modaleSupprimerCompte = true
		},
		supprimerCompte () {
			this.chargement = true
			const identifiant = this.identifiant
			axios.post(this.hote + '/api/supprimer-compte', {
				identifiant: this.identifiant
			}).then(function (reponse) {
				const donnees = reponse.data
				if (donnees === 'erreur') {
					this.chargement = false
					this.$store.dispatch('modifierAlerte', this.$t('erreurCommunicationServeur'))
				} else {
					this.$socket.emit('deconnexion', identifiant)
					this.$store.dispatch('reinitialiser')
					this.$router.push('/')
				}
			}.bind(this)).catch(function () {
				this.chargement = false
				this.$store.dispatch('modifierAlerte', this.$t('erreurCommunicationServeur'))
			}.bind(this))
		},
		deconnexion () {
			const identifiant = this.identifiant
			axios.post(this.hote + '/api/deconnexion').then(function () {
				this.$socket.emit('deconnexion', identifiant)
				this.$store.dispatch('reinitialiser')
				this.$router.push('/')
			}.bind(this)).catch(function () {
				this.$store.dispatch('modifierAlerte', this.$t('erreurCommunicationServeur'))
			}.bind(this))
		}
	},
	head () {
		return {
			title: this.identifiant + ' - Digipad'
		}
	}
}
</script>

<style scoped>
#page {
	width: 100%;
	height: 100%;
}

#boutons {
	display: flex;
	justify-content: center;
	flex-wrap: wrap;
	margin-bottom: 1.5rem;
	padding: 0 1.5rem;
}

#bouton-importer,
#bouton-creer {
	display: inline-flex;
	justify-content: center;
	align-items: center;
	width: 200px;
    line-height: 1;
    font-size: 1.6rem;
    font-weight: 700;
    text-transform: uppercase;
	padding: 1em 1.5em;
    border: 2px solid #00ced1;
	border-radius: 2em;
	margin-bottom: 1.5rem;
	background: #46fbff;
	cursor: pointer;
    transition: all ease-in 0.1s;
}

#bouton-creer {
	margin-right: 1.5rem;
}

#bouton-importer:hover,
#bouton-creer:hover {
    color: #fff;
	text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.3);
	background: #00ced1;
}

#identifiant {
	background: #e9e9e9;
}

#informations {
	color: #fdcc33;
}

#deconnexion {
	color: #ff6259;
	margin-bottom: 3rem;
}

.menu .bouton-rouge,
.menu .bouton-bleu {
	margin-top: 3rem;
}

.menu .bouton-rouge {
	margin-bottom: 3rem;
}

#onglets {
	display: flex;
    padding-left: 4rem;
    height: 7rem;
	line-height: calc(7rem - 3px);
}

#onglets .conteneur {
	display: inline-block;
    width: calc(50% - 3rem);
	text-align: center;
	margin: 0 1.5rem;
	font-size: 2rem;
	cursor: pointer;
}

#onglets .conteneur.recherche {
	display: flex;
    justify-content: center;
	width: calc(100% - 3rem);
	height: 100%;
	padding-top: 1.5rem;
}

#onglets .conteneur.recherche input {
	width: 80%;
	border-bottom: 3px solid #00ced1;
	line-height: 1;
}

#onglets .conteneur.recherche input:focus {
	border-color: #00ced1!important;
}

#onglets .conteneur.recherche span {
	font-size: 24px;
    color: #00ced1;
	border-bottom: 3px solid #00ced1;
	line-height: 5.5rem;
}

#onglets .conteneur.actif {
	font-weight: 700;
	border-bottom: 3px solid #00ced1;
}

#pads {
	margin: 0;
	padding-left: 4rem;
	padding-bottom: 4rem;
	width: 100%;
	height: calc(100% - 11rem);
	overflow: auto;
	-webkit-overflow-scrolling: touch;
}

.pads {
    width: 100%;
    text-align: center;
    margin: 4rem 0 0;
}

.conteneur-pads {
	display: flex;
	flex-wrap: wrap;
	padding: 0 0.75rem;
}

.pad {
    padding: 0 0 4rem;
	width: calc(50% - 1.5rem);
	height: 20rem;
    border: 2px solid #001d1d;
    margin: 0 0.75rem 1.5rem;
	position: relative;
	border-radius: 1rem;
}

.pad.espace {
	border: 2px dashed #ddd;
	background: #f5f5f5;
}

.pad .conteneur {
	display: flex;
	justify-content: center;
	align-items: center;
	padding: 0;
	width: 100%;
	height: 100%;
	cursor: pointer;
	border-top-left-radius: 1rem;
	border-top-right-radius: 1rem;
}

.pad .conteneur.fond-personnalise {
	background-size: cover;
	background-repeat: no-repeat;
	background-position: center;
}

.pad .meta {
	width: 100%;
	padding: 1.5rem;
    background: rgba(0, 0, 0, 0.55);
}

.pad .titre {
	color: #fff;
	text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.3);
    font-size: 2rem;
	line-height: 1.4;
	font-weight: 700;
}

.pad .date {
    margin-top: 0.5rem;
    color: #ddd;
    font-size: 1.2rem;
    display: block;
}

.pad .action {
	position: absolute;
	display: flex;
	justify-content: center;
	align-items: center;
	height: 4rem;
	left: 0;
	right: 0;
	bottom: 0;
	width: 100%;
    font-size: 24px;
	border-top: 1px dashed #ddd;
	line-height: 1;
}

.pad .action span {
	cursor: pointer;
	text-align: center;
	width: 3rem;
	display: inline-block;
}

.pad .action span + span {
	margin-left: 3rem;
}

.pad .action .dupliquer {
	color: #001d1d;
}

.pad .action .supprimer {
	color: #ff6259;
}

#pads .vide {
	font-size: 1.7rem;
    padding: 2.5rem 0;
    border-top: 1px dotted #ddd;
    border-bottom: 1px dotted #ddd;
    margin: 0 1.5rem 5rem;
}

#import label:not(.bouton-interrupteur) {
	width: 100%;
	text-align: center;
}

.progression .chargement {
	border-top: 0.7rem solid #00ced1;
	margin-top: 1rem;
}

.modale .conteneur-interrupteur {
	display: flex;
	justify-content: space-between;
	margin-bottom: 1rem;
	line-height: 2.2rem;
}

.modale .conteneur-interrupteur > span {
	font-size: 16px;
}

.modale .bouton-interrupteur {
	position: relative;
	display: inline-block!important;
	width: 3.8rem!important;
	height: 2.2rem;
	margin: 0;
}

.modale .bouton-interrupteur input {
	opacity: 0;
	width: 0;
	height: 0;
}

.modale .bouton-interrupteur .barre {
	position: absolute;
	cursor: pointer;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background-color: #ccc;
	transition: 0.3s;
	border-radius: 3rem;
}

.modale .bouton-interrupteur .barre:before {
	position: absolute;
	content: '';
	height: 1.6rem;
	width: 1.6rem;
	left: 0.3rem;
	bottom: 0.3rem;
	background-color: #fff;
	transition: 0.3s;
	border-radius: 50%;
}

.modale .bouton-interrupteur input:checked + .barre {
	background-color: #00ced1;
}

.modale .bouton-interrupteur input:focus + .barre {
	box-shadow: 0 0 1px #00ced1;
}

.modale .bouton-interrupteur input:checked + .barre:before {
	transform: translateX(1.6rem);
}

@media screen and (orientation: landscape) and (max-height: 479px) {
	#motdepasse {
		height: 90%;
	}
}

@media screen and (max-width: 479px) {
	#bouton-creer {
		margin-right: 0;
	}
}

@media screen and (max-width: 575px) {
	#onglets {
		height: 5rem;
		line-height: calc(5rem - 3px);
	}

	#onglets .conteneur {
		font-size: 1.7rem;
	}

	#onglets .conteneur.recherche {
		padding-top: 1rem;
	}

	#onglets .conteneur.recherche span {
		line-height: 4rem;
	}

	#pads {
		height: calc(100% - 9rem);
	}

	#pads .vide {
		font-size: 16px;
	}

	.pads  {
		margin: 3rem 0 0;
	}

	.pad .titre {
		font-size: 1.7rem;
	}
}

@media screen and (max-width: 599px) {
	.pad {
		width: calc(100% - 1.5rem);
	}
}

@media screen and (min-width: 600px) {
	.pad {
		width: calc(50% - 1.5rem);
	}
}

@media screen and (min-width: 1120px) {
	.pad {
		width: calc(33.333333333% - 1.5rem);
	}
}

@media screen and (min-width: 1440px) {
	.pad {
		width: calc(25% - 1.5rem);
	}
}
</style>
