<template>
	<div id="page" v-if="acces">
		<div id="accueil">
			<div id="langues">
				<span class="bouton" role="button" :tabindex="definirTabIndex()" :class="{'selectionne': langue === 'fr'}" @click="modifierLangue('fr')" @keydown.enter="modifierLangue('fr')">FR</span>
				<span class="bouton" role="button" :tabindex="definirTabIndex()" :class="{'selectionne': langue === 'es'}" @click="modifierLangue('es')" @keydown.enter="modifierLangue('es')">ES</span>
				<span class="bouton" role="button" :tabindex="definirTabIndex()" :class="{'selectionne': langue === 'it'}" @click="modifierLangue('it')" @keydown.enter="modifierLangue('it')">IT</span>
				<span class="bouton" role="button" :tabindex="definirTabIndex()" :class="{'selectionne': langue === 'de'}" @click="modifierLangue('de')" @keydown.enter="modifierLangue('de')">DE</span>
				<span class="bouton" role="button" :tabindex="definirTabIndex()" :class="{'selectionne': langue === 'en'}" @click="modifierLangue('en')" @keydown.enter="modifierLangue('en')">EN</span>
				<span class="bouton" role="button" :tabindex="definirTabIndex()" :class="{'selectionne': langue === 'hr'}" @click="modifierLangue('hr')" @keydown.enter="modifierLangue('hr')">HR</span>
			</div>
			<div id="conteneur">
				<h1>
					<span>{{ $t('maintenance') }}</span>
				</h1>
				<div class="conteneur actions">
					<span class="bouton maintenance" role="button" :tabindex="definirTabIndex()" @click="activerMaintenance" @keydown.enter="activerMaintenance" v-if="maintenance === false">{{ $t('activerMaintenance') }}</span>
					<span class="bouton maintenance" role="button" :tabindex="definirTabIndex()" @click="desactiverMaintenance" @keydown.enter="desactiverMaintenance" v-else>{{ $t('desactiverMaintenance') }}</span>
				</div>
				<h1>
					<span>{{ $t('modifierMotDePasseUtilisateur') }}</span>
				</h1>
				<div class="conteneur">
					<label for="champ-identifiant">{{ $t('identifiant') }}</label>
					<input id="champ-identifiant" type="text" :value="identifiant" @input="identifiant = $event.target.value">
				</div>
				<div class="conteneur">
					<label for="champ-email">{{ $t('email') }}</label>
					<input id="champ-email" type="text" :value="email" @input="email = $event.target.value">
				</div>
				<div class="conteneur">
					<label for="champ-motdepasse">{{ $t('motDePasse') }}</label>
					<input id="champ-motdepasse" type="text" maxlength="48" :value="motdepasse" @input="motdepasse = $event.target.value" @keydown.enter="modifierMotDePasse">
				</div>
				<div class="conteneur actions">
					<span class="bouton" role="button" :tabindex="definirTabIndex()" @click="modifierMotDePasse" @keydown.enter="modifierMotDePasse">{{ $t('valider') }}</span>
				</div>
				<h1>
					<span>{{ $t('recupererDonneesPad') }}</span>
				</h1>
				<div class="conteneur">
					<label for="champ-numero-pad">{{ $t('numeroPad') }}</label>
					<input id="champ-numero-pad" type="number" :value="padId" @input="padId = $event.target.value" @keydown.enter="recupererDonneesPad">
				</div>
				<div class="conteneur" v-if="donneesPad !== ''">
					<span class="donnees">{{ donneesPad }}</span>
				</div>
				<div class="conteneur actions">
					<span class="bouton" role="button" :tabindex="definirTabIndex()" @click="recupererDonneesPad" @keydown.enter="recupererDonneesPad">{{ $t('valider') }}</span>
				</div>
				<h1>
					<span>{{ $t('modifierDonneesPad') }}</span>
				</h1>
				<div class="conteneur">
					<label for="champ-numero-pad-m">{{ $t('numeroPad') }}</label>
					<input id="champ-numero-pad-m" type="number" :value="padIdM" @input="padIdM = $event.target.value">
				</div>
				<div class="conteneur">
					<label for="champ">{{ $t('champ') }}</label>
					<select id="champ" @change="champ = $event.target.value">
						<option value="" :selected="champ === ''">-</option>
						<option value="code" :selected="champ === 'code'">{{ $t('codeAcces') }}</option>
						<option value="motdepasse" :selected="champ === 'motdepasse'">{{ $t('motDePasse') }}</option>
					</select>
				</div>
				<div class="conteneur">
					<label for="champ-valeur">{{ $t('valeur') }}</label>
					<input id="champ-valeur" type="text" :value="valeur" :maxlength="18" @input="valeur = $event.target.value" v-if="champ === 'code'">
					<input id="champ-valeur" type="text" :value="valeur" @input="valeur = $event.target.value" v-else>
				</div>
				<div class="conteneur actions">
					<span class="bouton" role="button" :tabindex="definirTabIndex()" @click="modifierDonneesPad" @keydown.enter="modifierDonneesPad">{{ $t('valider') }}</span>
				</div>
				<h1>
					<span>{{ $t('exporterPad') }}</span>
				</h1>
				<div class="conteneur">
					<label for="champ-numero-pad-e">{{ $t('numeroPad') }}</label>
					<input id="champ-numero-pad-e" type="number" :value="padIdE" @input="padIdE = $event.target.value" @keydown.enter="exporterPad">
				</div>
				<div class="conteneur actions">
					<span class="bouton" role="button" :tabindex="definirTabIndex()" @click="exporterPad" @keydown.enter="exporterPad">{{ $t('valider') }}</span>
				</div>
				<h1>
					<span>{{ $t('rattacherPad') }}</span>
				</h1>
				<div class="conteneur">
					<label for="champ-numero-pad-r">{{ $t('numeroPad') }}</label>
					<input id="champ-numero-pad-r" type="number" :value="padIdR" @input="padIdR = $event.target.value">
				</div>
				<div class="conteneur">
					<label for="champ-destination">{{ $t('identifiantDestination') }}</label>
					<input id="champ-destination" type="text" :value="identifiantR" @input="identifiantR = $event.target.value">
				</div>
				<div class="conteneur actions">
					<span class="bouton" role="button" :tabindex="definirTabIndex()" @click="afficherModaleRattacher" @keydown.enter="afficherModaleRattacher">{{ $t('valider') }}</span>
				</div>
				<h1>
					<span>{{ $t('transfererPad') }}</span>
				</h1>
				<div class="conteneur">
					<label for="champ-numero-pad-n">{{ $t('numeroPad') }}</label>
					<input id="champ-numero-pad-n" type="number" :value="padIdN" @input="padIdN = $event.target.value">
				</div>
				<div class="conteneur">
					<label for="champ-identifiant-n">{{ $t('identifiantDestination') }}</label>
					<input id="champ-identifiant-n" type="text" :value="identifiantN" @input="identifiantN = $event.target.value">
				</div>
				<div class="conteneur actions">
					<span class="bouton" role="button" :tabindex="definirTabIndex()" @click="afficherModaleTransfererPad" @keydown.enter="afficherModaleTransfererPad">{{ $t('valider') }}</span>
				</div>
				<h1>
					<span>{{ $t('supprimerPad') }}</span>
				</h1>
				<div class="conteneur">
					<label for="champ-numero-pad-s">{{ $t('numeroPad') }}</label>
					<input id="champ-numero-pad-s" type="number" :value="padIdS" @input="padIdS = $event.target.value">
				</div>
				<div class="conteneur">
					<div class="conteneur-interrupteur">
						<span>{{ $t('supprimerFichiersServeur') }}</span>
						<label class="bouton-interrupteur" :tabindex="definirTabIndex()" @keydown.enter="activerInput('suppression-fichier')">
							<input id="suppression-fichier" type="checkbox" :checked="suppressionFichiers" @change="modifierSuppressionFichiers">
							<span class="barre" />
						</label>
					</div>
				</div>
				<div class="conteneur actions">
					<span class="bouton" role="button" :tabindex="definirTabIndex()" @click="afficherModaleSupprimerPad" @keydown.enter="afficherModaleSupprimerPad">{{ $t('valider') }}</span>
				</div>
				<h1>
					<span>{{ $t('transfererCompte') }}</span>
				</h1>
				<div class="conteneur">
					<label for="champ-identifiant-transferer">{{ $t('identifiantCompteATransferer') }}</label>
					<input id="champ-identifiant-transferer" type="text" :value="identifiantO" @input="identifiantO = $event.target.value">
				</div>
				<div class="conteneur">
					<label for="champ-identifiant-destination">{{ $t('identifiantDestination') }}</label>
					<input id="champ-identifiant-destination" type="text" :value="identifiantT" @input="identifiantT = $event.target.value">
				</div>
				<div class="conteneur actions">
					<span class="bouton" role="button" :tabindex="definirTabIndex()" @click="afficherModaleTransfererCompte" @keydown.enter="afficherModaleTransfererCompte">{{ $t('valider') }}</span>
				</div>
				<h1>
					<span>{{ $t('supprimerCompte') }}</span>
				</h1>
				<div class="conteneur">
					<label for="champ-identifiant-s">{{ $t('identifiant') }}</label>
					<input id="champ-identifiant-s" type="text" :value="identifiantS" @input="identifiantS = $event.target.value">
				</div>
				<div class="conteneur actions">
					<span class="bouton" role="button" :tabindex="definirTabIndex()" @click="afficherModaleSupprimerCompte" @keydown.enter="afficherModaleSupprimerCompte">{{ $t('valider') }}</span>
				</div>
			</div>
		</div>

		<div id="conteneur-message" class="conteneur-modale" v-if="modale !== ''">
			<div class="modale" role="dialog">
				<div class="conteneur">
					<div class="contenu">
						<div class="message" v-html="$t('confirmationRattacherPad')" v-if="modale === 'rattacher-pad'" />
						<div class="message" v-html="$t('confirmationSupprimerPad')" v-else-if="modale === 'supprimer-pad'" />
						<div class="message" v-html="$t('confirmationRattacherPad')" v-else-if="modale === 'transferer-pad'" />
						<div class="message" v-html="$t('confirmationTransfererCompte')" v-else-if="modale === 'transferer-compte'" />
						<div class="message" v-html="$t('confirmationSupprimerCompteAdmin')" v-else-if="modale === 'supprimer-compte'" />
						<div class="actions">
							<span class="bouton" role="button" :tabindex="message === '' ? 0 : -1" @click="fermerModale" @keydown.enter="fermerModale">{{ $t('non') }}</span>
							<span class="bouton" role="button" :tabindex="message === '' ? 0 : -1" @click="rattacherPad" @keydown.enter="rattacherPad" v-if="modale === 'rattacher-pad'">{{ $t('oui') }}</span>
							<span class="bouton" role="button" :tabindex="message === '' ? 0 : -1" @click="supprimerPad" @keydown.enter="supprimerPad" v-else-if="modale === 'supprimer-pad'">{{ $t('oui') }}</span>
							<span class="bouton" role="button" :tabindex="message === '' ? 0 : -1" @click="transfererPad" @keydown.enter="transfererPad" v-else-if="modale === 'transferer-pad'">{{ $t('oui') }}</span>
							<span class="bouton" role="button" :tabindex="message === '' ? 0 : -1" @click="transfererCompte" @keydown.enter="transfererCompte" v-else-if="modale === 'transferer-compte'">{{ $t('oui') }}</span>
							<span class="bouton" role="button" :tabindex="message === '' ? 0 : -1" @click="supprimerCompte" @keydown.enter="supprimerCompte" v-else-if="modale === 'supprimer-compte'">{{ $t('oui') }}</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<Notification :notification="notification" @fermer="notification = ''" v-if="notification !== ''" />

		<Message :message="message" @elementPrecedent="definirElementPrecedent" @fermer="fermerMessage" v-if="message !== ''" />

		<Chargement v-if="chargement" />
	</div>
</template>

<script>
import axios from 'axios'
import fileSaver from 'file-saver'
const { saveAs } = fileSaver
import Chargement from '#root/components/chargement.vue'
import Message from '#root/components/message.vue'
import Notification from '#root/components/notification.vue'

export default {
	name: 'Admin',
	components: {
		Chargement,
		Message,
		Notification
	},
	data () {
		return {
			chargement: false,
			message: '',
			notification: '',
			acces: false,
			admin: '',
			modale: '',
			identifiant: '',
			email: '',
			motdepasse: '',
			padId: '',
			padIdS: '',
			padIdM: '',
			padIdE: '',
			padIdR: '',
			padIdN: '',
			donneesPad: '',
			identifiantS: '',
			identifiantO: '',
			identifiantT: '',
			identifiantR: '',
			identifiantN: '',
			champ: '',
			valeur: '',
			maintenance: false,
			suppressionFichiers: true,
			elementPrecedent: null,
			hote: this.$pageContext.pageProps.hote,
			langue: this.$pageContext.pageProps.langue
		}
	},
	created () {
		this.$i18n.locale = this.langue
		this.$socket.emit('verifiermaintenance')
		this.$socket.on('verifiermaintenance', function (valeur) {
			this.maintenance = valeur
		}.bind(this))
	},
	mounted () {
		const motdepasse = prompt(this.$t('motDePasse'), '')
		if (motdepasse) {
			axios.post(this.hote + '/api/verifier-mot-de-passe-admin', {
				admin: motdepasse
			}).then(function (reponse) {
				const donnees = reponse.data
				if (donnees === 'acces_verifie') {
					this.acces = true
					this.admin = motdepasse
					document.addEventListener('keydown', this.gererClavier, false)
				}
			}.bind(this))
		}
	},
	beforeUnmount () {
		document.removeEventListener('keydown', this.gererClavier, false)
	},
	methods: {
		modifierLangue (langue) {
			if (this.langue !== langue) {
				axios.post(this.hote + '/api/modifier-langue', {
					identifiant: this.identifiant,
					langue: langue
				}).then(function () {
					this.$i18n.locale = langue
					document.getElementsByTagName('html')[0].setAttribute('lang', langue)
					this.langue = langue
					this.notification = this.$t('langueModifiee')
				}.bind(this)).catch(function () {
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			}
		},
		activerInput (id) {
			document.querySelector('#' + id).click()
		},
		definirTabIndex () {
			return this.modale === '' && this.message === '' ? 0 : -1
		},
		activerMaintenance () {
			this.$socket.emit('activermaintenance', this.admin)
		},
		desactiverMaintenance () {
			this.$socket.emit('desactivermaintenance', this.admin)
		},
		modifierMotDePasse () {
			if (this.motdepasse.trim() !== '' && (this.identifiant !== '' || this.email !== '')) {
				this.chargement = true
				axios.post(this.hote + '/api/modifier-mot-de-passe-admin', {
					admin: this.admin,
					identifiant: this.identifiant,
					email: this.email,
					motdepasse: this.motdepasse
				}).then(function (reponse) {
					this.chargement = false
					const donnees = reponse.data
					if (donnees === 'erreur') {
						this.message = this.$t('erreurActionServeur')
					} else if (donnees === 'identifiant_non_valide') {
						this.message = this.$t('identifiantNonValide')
					} else if (donnees === 'email_non_valide') {
						this.message = this.$t('erreurEmail')
					} else {
						this.notification = this.$t('motDePasseModifie')
						if (donnees !== 'motdepasse_modifie') {
							this.message = this.$t('identifiant') + ' : ' + donnees
						}
					}
					this.identifiant = ''
					this.motdepasse = ''
					this.email = ''
				}.bind(this)).catch(function () {
					this.chargement = false
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			}
		},
		recupererDonneesPad () {
			if (this.padId !== '') {
				this.chargement = true
				axios.post(this.hote + '/api/recuperer-donnees-pad-admin', {
					admin: this.admin,
					padId: this.padId
				}).then(function (reponse) {
					this.chargement = false
					const donnees = reponse.data
					if (donnees === 'erreur') {
						this.message = this.$t('erreurActionServeur')
					} else if (donnees === 'pad_inexistant') {
						this.message = this.$t('padInexistant')
					} else if (donnees === 'non_autorise') {
						this.message = this.$t('actionNonAutorisee')
					} else {
						this.donneesPad = donnees
					}
					this.padId = ''
				}.bind(this)).catch(function () {
					this.chargement = false
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			}
		},
		modifierDonneesPad () {
			if (this.padIdM !== '' && this.champ !== '' && this.valeur.trim() !== '') {
				this.chargement = true
				axios.post(this.hote + '/api/modifier-donnees-pad-admin', {
					admin: this.admin,
					padId: this.padIdM,
					champ: this.champ,
					valeur: this.valeur
				}).then(function (reponse) {
					this.chargement = false
					const donnees = reponse.data
					if (donnees === 'erreur') {
						this.message = this.$t('erreurActionServeur')
					} else if (donnees === 'pad_inexistant') {
						this.message = this.$t('padInexistant')
					} else if (donnees === 'non_autorise') {
						this.message = this.$t('actionNonAutorisee')
					} else {
						this.notification = this.$t('donneesModifiees')
					}
					this.padIdM = ''
					this.champ = ''
					this.valeur = ''
				}.bind(this)).catch(function () {
					this.chargement = false
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			}
		},
		modifierSuppressionFichiers (event) {
			if (event.target.checked === true) {
				this.suppressionFichiers = true
			} else {
				this.suppressionFichiers = false
			}
		},
		exporterPad () {
			if (this.padIdE !== '') {
				this.chargement = true
				axios.post(this.hote + '/api/exporter-pad', {
					padId: this.padIdE,
					identifiant: '',
					admin: this.admin
				}).then(function (reponse) {
					this.chargement = false
					const donnees = reponse.data
					if (donnees === 'erreur_export') {
						this.message = this.$t('erreurExportPad')
					} else if (donnees === 'non_autorise') {
						this.message = this.$t('actionNonAutorisee')
					} else if (donnees === 'pad_inexistant') {
						this.message = this.$t('padInexistant')
					} else {
						saveAs('/temp/' + donnees, 'pad-' + this.padIdE + '.zip')
						this.padIdE = ''
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.padIdE = ''
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			}
		},
		afficherModaleRattacher () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'rattacher-pad'
			this.$nextTick(function () {
				document.querySelector('.modale .bouton').focus()
			})
		},
		rattacherPad () {
			if (this.padIdR !== '' && this.identifiantR !== '') {
				this.modale = ''
				this.chargement = true
				axios.post(this.hote + '/api/rattacher-pad', {
					admin: this.admin,
					padId: this.padIdR,
					identifiant: this.identifiantR
				}).then(function (reponse) {
					this.chargement = false
					const donnees = reponse.data
					if (donnees === 'erreur') {
						this.message = this.$t('erreurActionServeur')
					} else if (donnees === 'utilisateur_inexistant') {
						this.message = this.$t('utilisateurInexistant')
					} else if (donnees === 'pad_inexistant') {
						this.message = this.$t('padInexistant')
					} else if (donnees === 'pad_cree_avec_compte') {
						this.message = this.$t('padCreeAvecCompte')
					} else if (donnees === 'non_autorise') {
						this.message = this.$t('actionNonAutorisee')
					} else {
						this.notification = this.$t('padTransfere')
						this.padIdR = ''
						this.identifiantR = ''
						this.gererFocus()
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			}
		},
		afficherModaleSupprimerPad () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'supprimer-pad'
			this.$nextTick(function () {
				document.querySelector('.modale .bouton').focus()
			})
		},
		supprimerPad () {
			if (this.padIdS !== '') {
				this.modale = ''
				this.chargement = true
				axios.post(this.hote + '/api/recuperer-donnees-pad-admin', {
					admin: this.admin,
					padId: this.padIdS
				}).then(function (reponse) {
					this.chargement = false
					const donnees = reponse.data
					if (donnees === 'erreur') {
						this.message = this.$t('erreurActionServeur')
					} else if (donnees === 'pad_inexistant') {
						this.message = this.$t('padInexistant')
					} else if (donnees === 'non_autorise') {
						this.message = this.$t('actionNonAutorisee')
					} else {
						const identifiant = donnees.identifiant
						axios.post(this.hote + '/api/supprimer-pad', {
							padId: this.padIdS,
							type: 'pad',
							identifiant: identifiant,
							admin: this.admin,
							suppressionFichiers: this.suppressionFichiers
						}).then(function (reponse) {
							this.chargement = false
							const donnees = reponse.data
							if (donnees === 'erreur_suppression') {
								this.message = this.$t('erreurSuppressionMur')
							} else if (donnees === 'non_autorise') {
								this.message = this.$t('actionNonAutorisee')
							} else {
								this.notification = this.$t('padSupprime')
								this.padIdS = ''
								this.suppressionFichiers = true
								this.gererFocus()
							}
						}.bind(this)).catch(function () {
							this.chargement = false
							this.padIdS = ''
							this.suppressionFichiers = true
							this.message = this.$t('erreurCommunicationServeur')
						}.bind(this))
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.padIdS = ''
					this.suppressionFichiers = true
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			}
		},
		afficherModaleTransfererPad () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'transferer-pad'
			this.$nextTick(function () {
				document.querySelector('.modale .bouton').focus()
			})
		},
		transfererPad () {
			if (this.identifiantN !== '' && this.padIdN !== '') {
				this.modale = ''
				this.chargement = true
				axios.post(this.hote + '/api/transferer-pad', {
					admin: this.admin,
					nouvelIdentifiant: this.identifiantN,
					padId: this.padIdN
				}).then(function (reponse) {
					this.chargement = false
					const donnees = reponse.data
					if (donnees === 'erreur') {
						this.message = this.$t('erreurActionServeur')
					} else if (donnees === 'utilisateur_inexistant') {
						this.message = this.$t('utilisateurInexistant')
					} else if (donnees === 'pad_inexistant') {
						this.message = this.$t('padInexistant')
					} else if (donnees === 'non_autorise') {
						this.message = this.$t('actionNonAutorisee')
					} else {
						this.notification = this.$t('padTransfere')
						this.identifiantN = ''
						this.padIdN = ''
						this.gererFocus()
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			}
		},
		afficherModaleTransfererCompte () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'transferer-compte'
			this.$nextTick(function () {
				document.querySelector('.modale .bouton').focus()
			})
		},
		transfererCompte () {
			if (this.identifiantO !== '' && this.identifiantT !== '') {
				this.modale = ''
				this.chargement = true
				axios.post(this.hote + '/api/transferer-compte', {
					admin: this.admin,
					identifiant: this.identifiantO,
					nouvelIdentifiant: this.identifiantT
				}).then(function (reponse) {
					this.chargement = false
					const donnees = reponse.data
					if (donnees === 'erreur') {
						this.message = this.$t('erreurActionServeur')
					} else if (donnees === 'utilisateur_inexistant') {
						this.message = this.$t('utilisateursInexistants')
					} else if (donnees === 'non_autorise') {
						this.message = this.$t('actionNonAutorisee')
					} else {
						this.notification = this.$t('compteTransfere')
						this.identifiantO = ''
						this.identifiantT = ''
						this.gererFocus()
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			}
		},
		afficherModaleSupprimerCompte () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'supprimer-compte'
			this.$nextTick(function () {
				document.querySelector('.modale .bouton').focus()
			})
		},
		supprimerCompte () {
			if (this.identifiantS !== '') {
				this.modale = ''
				this.chargement = true
				axios.post(this.hote + '/api/supprimer-compte', {
					identifiant: this.identifiantS,
					admin: this.admin
				}).then(function (reponse) {
					this.chargement = false
					const donnees = reponse.data
					if (donnees === 'erreur') {
						this.message = this.$t('erreurActionServeur')
					} else if (donnees === 'non_autorise') {
						this.message = this.$t('actionNonAutorisee')
					} else {
						this.notification = this.$t('compteSupprime')
						this.identifiantS = ''
						this.gererFocus()
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			}
		},
		fermerModale () {
			this.modale = ''
			this.gererFocus()
		},
		fermerMessage () {
			this.message = ''
			this.gererFocus()
		},
		definirElementPrecedent (element) {
			this.elementPrecedent = element
		},
		gererFocus () {
			if (this.elementPrecedent) {
				this.elementPrecedent.focus()
				this.elementPrecedent = null
			}
		},
		gererClavier (event) {
			if (event.key === 'Escape' && this.message !== '') {
				this.fermerMessage()
			} else if (event.key === 'Escape' && this.modale !== '') {
				this.fermerModale()
			}
		}
	}
}
</script>

<style scoped>
#page,
#accueil {
	width: 100%;
	height: 100%;
}

#page {
	overflow: auto;
}

#langues {
	position: fixed;
	display: flex;
	top: 1rem;
	right: 0.5rem;
	z-index: 10;
}

#langues span {
    display: flex;
    justify-content: center;
	align-items: center;
	font-size: 1.4rem;
    width: 3rem;
	height: 3rem;
	background: #fff;
    border-radius: 50%;
    border: 1px solid #ddd;
    margin-right: 1rem;
	cursor: pointer;
}

#langues span.selectionne {
    background: #242f3d;
    color: #fff;
    border: 1px solid #222;
    cursor: default;
}

#conteneur {
    width: 100%;
	max-width: 500px;
	margin: auto;
	padding-top: 5em;
	padding-bottom: 5em;
}

#conteneur h1 {
    font-family: 'HKGroteskWide-ExtraBold', 'HKGrotesk-ExtraBold', sans-serif;
    font-size: 2rem;
	font-weight: 900;
	margin: 0 1.5rem 0.85em;
    line-height: 1.4;
}

#conteneur .conteneur {
    margin: 2rem 1.5rem;
}

#conteneur .conteneur-bouton {
	font-size: 0;
}

#conteneur .conteneur label {
    font-size: 14px;
    display: block;
	margin-bottom: 10px;
	line-height: 1.15;
	font-weight: 700;
}

#conteneur .conteneur select,
#conteneur .conteneur input {
	display: block;
    width: 100%;
    font-size: 16px;
    border: 1px solid #ddd;
    border-radius: 4px;
	padding: 7px 15px;
	line-height: 1.5;
}

#conteneur .conteneur select {
	background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 0 29 14" width="29"><path fill="%23000000" d="M9.37727 3.625l5.08154 6.93523L19.54036 3.625" /></svg>') center right no-repeat;
	padding-right: 30px;
}

#conteneur .conteneur div {
    margin-bottom: 10px;
}

#conteneur .conteneur div:not(.conteneur-interrupteur):last-child {
    margin-bottom: 3rem;
}

#conteneur .conteneur .donnees {
	user-select: text!important;
	-webkit-user-select: text!important;
	-webkit-touch-callout: default!important;
}

#conteneur .actions {
	display: flex;
	justify-content: center;
	flex-wrap: wrap;
	margin-bottom: 4rem;
}

#conteneur .actions .bouton {
	display: inline-block;
	width: 180px;
    line-height: 1;
    font-size: 1em;
    font-weight: 700;
    text-transform: uppercase;
	text-align: center;
	padding: 1em 1.5em;
	margin-right: 1em;
    border: 2px solid #00ced1;
	border-radius: 2em;
    background: #46fbff;
	cursor: pointer;
    transition: all 0.1s ease-in;
}

#conteneur .actions .bouton.maintenance {
	width: 100%;
}

#conteneur .actions .bouton.maintenance:first-child {
	margin-right: 0;
	margin-bottom: 2rem;
}

#conteneur .actions .bouton:hover {
    color: #fff;
	text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.3);
	background: #00ced1;
}

#conteneur .actions .bouton:last-child {
	margin-right: 0;
}

#conteneur .conteneur-interrupteur {
	display: flex;
	justify-content: space-between;
	margin-bottom: 1rem;
	line-height: 2.2rem;
}

#conteneur .conteneur-interrupteur > span {
	font-size: 16px;
}

#conteneur .bouton-interrupteur {
	position: relative;
	display: inline-block!important;
	width: 3.8rem!important;
	height: 2.2rem;
	margin: 0!important;
}

#conteneur .bouton-interrupteur input {
	opacity: 0;
	width: 0;
	height: 0;
}

#conteneur .bouton-interrupteur .barre {
	position: absolute;
	cursor: pointer;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background-color: #ccc;
	transition: 0.2s;
	border-radius: 3rem;
}

#conteneur .bouton-interrupteur .barre:before {
	position: absolute;
	content: '';
	height: 1.6rem;
	width: 1.6rem;
	left: 0.3rem;
	bottom: 0.3rem;
	background-color: #fff;
	transition: 0.2s;
	border-radius: 50%;
}

#conteneur .bouton-interrupteur input:checked + .barre {
	background-color: #00ced1;
}

#conteneur .bouton-interrupteur input:focus + .barre {
	box-shadow: 0 0 1px #00ced1;
}

#conteneur .bouton-interrupteur input:checked + .barre:before {
	transform: translateX(1.6rem);
}

@media screen and (max-width: 359px) {
	#conteneur .actions .bouton {
		font-size: 0.75em!important;
		width: 130px;
		padding: 1em 0.5em;
	}
}

@media screen and (min-width: 360px) and (max-width: 599px) {
	#conteneur .actions .bouton {
		width: 145px;
	}
}

@media screen and (max-width: 399px) {
	#conteneur h1 span {
		display: block;
	}
}

@media screen and (max-width: 599px) {
	#conteneur h1 {
		font-size: 2em;
		margin-bottom: 1em;
	}

	#conteneur .actions .bouton {
		font-size: 0.85em;
		margin-bottom: 1em;
	}
}

@media screen and (max-width: 850px) and (max-height: 500px) {
	#conteneur h1 {
		font-size: 2em;
		margin-bottom: 1em;
	}

	#conteneur .actions .bouton {
		font-size: 0.85em!important;
	}
}
</style>

<style>
#message .message {
	user-select: text!important;
}
</style>
