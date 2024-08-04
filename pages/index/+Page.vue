<template>
	<div id="page">
		<div id="accueil" :style="{'background-image': 'url(./img/fond.png)'}">
			<div id="langues">
				<span class="bouton" role="button" :tabindex="definirTabIndex()" :class="{'selectionne': langue === 'fr'}" @click="modifierLangue('fr')" @keydown.enter="modifierLangue('fr')">FR</span>
				<span class="bouton" role="button" :tabindex="definirTabIndex()" :class="{'selectionne': langue === 'es'}" @click="modifierLangue('es')" @keydown.enter="modifierLangue('es')">ES</span>
				<span class="bouton" role="button" :tabindex="definirTabIndex()" :class="{'selectionne': langue === 'it'}" @click="modifierLangue('it')" @keydown.enter="modifierLangue('it')">IT</span>
				<span class="bouton" role="button" :tabindex="definirTabIndex()" :class="{'selectionne': langue === 'de'}" @click="modifierLangue('de')" @keydown.enter="modifierLangue('de')">DE</span>
				<span class="bouton" role="button" :tabindex="definirTabIndex()" :class="{'selectionne': langue === 'en'}" @click="modifierLangue('en')" @keydown.enter="modifierLangue('en')">EN</span>
				<span class="bouton" role="button" :tabindex="definirTabIndex()" :class="{'selectionne': langue === 'hr'}" @click="modifierLangue('hr')" @keydown.enter="modifierLangue('hr')">HR</span>
			</div>
			<div id="conteneur">
				<div id="contenu">
					<h1>
						<span>Digipad</span> <span>by La Digitale</span>
					</h1>
					<div>
						<p v-html="$t('slogan')" />
						<div id="actions">
							<span class="bouton" role="button" :tabindex="definirTabIndex()" @click="afficherModaleConnexion" @keydown.enter="afficherModaleConnexion">{{ $t('seConnecter') }}</span>
							<span class="bouton" role="button" :tabindex="definirTabIndex()" @click="afficherModaleInscription" @keydown.enter="afficherModaleInscription" v-if="creationCompte === 1">{{ $t('sInscrire') }}</span>
							<div v-if="creationPadSansCompte === 1">
								<span class="bouton" role="button" :tabindex="definirTabIndex()" @click="afficherModaleCreer" @keydown.enter="afficherModaleCreer">{{ $t('creerPad') }}</span>
							</div>
						</div>
					</div>
				</div>
				<div id="credits">
					<p><span class="mentions-legales" role="button" :tabindex="definirTabIndex()" @click="afficherMentionsLegales" @keydown.enter="afficherMentionsLegales">{{ $t('mentionsLegales') }}</span> - <a href="https://opencollective.com/ladigitale" target="_blank">{{ $t('soutien') }} ❤️.</a></p>
					<p>{{ new Date().getFullYear() }} - <a href="https://ladigitale.dev" target="_blank" rel="noreferrer">La Digitale</a> - <a href="https://codeberg.org/ladigitale/digipad" target="_blank" rel="noreferrer">{{ $t('codeSource') }}</a> - <a href="https://codeberg.org/ladigitale/digipad/releases" target="_blank" rel="noreferrer">v{{ version }}</a> - <span class="hub" role="button" :tabindex="definirTabIndex()" @click="ouvrirHub" @keydown.enter="ouvrirHub"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#001d1d" width="36px" height="36px"><path d="M0 0h24v24H0z" fill="none" /><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z" /></svg></span></p>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-if="modale === 'creer'">
			<div id="creation" class="modale" role="dialog">
				<div class="en-tete">
					<span class="titre">{{ $t('creerPad') }}</span>
					<span class="fermer" role="button" :tabindex="message === '' ? 0 : -1" @click="fermerModaleCreer" @keydown.enter="fermerModaleCreer"><i class="material-icons">close</i></span>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-titre-pad">{{ $t('titrePad') }}</label>
						<input id="champ-titre-pad" type="text" maxlength="48" :value="titre" @input="titre = $event.target.value">
						<label for="champ-motdepasse-pad">{{ $t('motDePassePad') }}</label>
						<p class="information">{{ $t('infoMotDePassePad') }}</p>
						<input id="champ-motdepasse-pad" type="text" maxlength="48" :value="motDePassePad" @input="motDePassePad = $event.target.value" @keydown.enter="creerPad">
						<div class="actions">
							<span class="bouton" role="button" :tabindex="message === '' ? 0 : -1" @click="creerPad" @keydown.enter="creerPad" v-if="!chargement">{{ $t('creer') }}</span>
							<div class="conteneur-chargement" v-else>
								<div class="chargement" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-else-if="modale === 'connexion' || modale === 'mot-de-passe-oublie'">
			<div id="connexion" class="modale" role="dialog" v-if="modale === 'connexion'">
				<div class="en-tete">
					<span class="titre">{{ $t('seConnecter') }}</span>
					<span class="fermer" role="button" :tabindex="message === '' ? 0 : -1" @click="fermerModaleConnexion" @keydown.enter="fermerModaleConnexion"><i class="material-icons">close</i></span>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-identifiant">{{ $t('identifiant') }}</label>
						<input id="champ-identifiant" type="text" maxlength="48" :value="identifiant" @input="identifiant = $event.target.value">
						<label for="champ-motdepasse">{{ $t('motDePasse') }}</label>
						<input id="champ-motdepasse" type="password" maxlength="48" :value="motDePasse" @input="motDePasse = $event.target.value" @keydown.enter="seConnecter">
						<div class="mot-de-passe-oublie" role="button" :tabindex="message === '' ? 0 : -1" @click="afficherModaleMotDePasseOublie" @keydown.enter="afficherModaleMotDePasseOublie" v-html="$t('motDePasseOublie')" />
						<div class="actions">
							<span class="bouton" role="button" :tabindex="message === '' ? 0 : -1" @click="seConnecter" @keydown.enter="seConnecter" v-if="!chargement">{{ $t('valider') }}</span>
							<div class="conteneur-chargement" v-else>
								<div class="chargement" />
							</div>
						</div>
					</div>
				</div>
			</div>
			<div class="modale" role="dialog" v-else-if="modale === 'mot-de-passe-oublie'">
				<div class="en-tete">
					<span class="titre">{{ $t('motDePasseOublie') }}</span>
					<span class="fermer" role="button" :tabindex="message === '' ? 0 : -1" @click="fermerModaleMotDePasseOublie" @keydown.enter="fermerModaleMotDePasseOublie"><i class="material-icons">close</i></span>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-identifiant">{{ $t('identifiant') }}</label>
						<input id="champ-identifiant" type="text" maxlength="48" :value="identifiant" @input="identifiant = $event.target.value">
						<label for="champ-email">{{ $t('email') }}</label>
						<input id="champ-email" type="text" :value="email" @input="email = $event.target.value" @keydown.enter="envoyerMotDePasse">
						<div class="actions">
							<span class="bouton" role="button" :tabindex="message === '' ? 0 : -1" @click="envoyerMotDePasse" @keydown.enter="envoyerMotDePasse" v-if="!chargement">{{ $t('valider') }}</span>
							<div class="conteneur-chargement" v-else>
								<div class="chargement" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-else-if="modale === 'inscription'">
			<div id="inscription" class="modale" role="dialog">
				<div class="en-tete">
					<span class="titre">{{ $t('sInscrire') }}</span>
					<span class="fermer" role="button" :tabindex="message === '' ? 0 : -1" @click="fermerModaleInscription" @keydown.enter="fermerModaleInscription"><i class="material-icons">close</i></span>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-identifiant">{{ $t('identifiant') }}</label>
						<p class="information">{{ $t('infoIdentifiant') }}</p>
						<input id="champ-identifiant" type="text" maxlength="48" :value="identifiant" @input="identifiant = $event.target.value">
						<label for="champ-email">{{ $t('email') }}</label>
						<input id="champ-email" type="text" :value="email" @input="email = $event.target.value">
						<label for="champ-motdepasse">{{ $t('motDePasse') }}</label>
						<p class="information">{{ $t('infoMotDePasse') }}</p>
						<input id="champ-motdepasse" type="password" maxlength="48" :value="motDePasse" @input="motDePasse = $event.target.value">
						<label for="champ-confirmation-motdepasse">{{ $t('confirmationMotDePasse') }}</label>
						<input id="champ-confirmation-motdepasse" type="password" maxlength="48" :value="confirmationMotDePasse" @input="confirmationMotDePasse = $event.target.value" @keydown.enter="sInscrire">
						<div class="actions">
							<span class="bouton" role="button" :tabindex="message === '' ? 0 : -1" @click="sInscrire" @keydown.enter="sInscrire" v-if="!chargement">{{ $t('valider') }}</span>
							<div class="conteneur-chargement" v-else>
								<div class="chargement" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-else-if="modale === 'mentions-legales'">
			<div id="mentions-legales" class="modale" role="dialog">
				<div class="en-tete">
					<span class="titre">{{ $t('mentionsLegales') }}</span>
					<span class="fermer" role="button" :tabindex="message === '' ? 0 : -1" @click="fermerModale" @keydown.enter="fermerModale"><i class="material-icons">close</i></span>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<p>{{ $t('mentionsLegales1') }}</p>
						<label>{{ $t('administrationEtDeveloppement') }}</label>
						<p>La Digitale - Emmanuel ZIMMERT</p>
						<label>{{ $t('contact') }}</label>
						<p>{{ $t('courriel') }} ez[at]ladigitale.dev – {{ $t('siteWeb') }} https://ladigitale.dev</p>
						<label>{{ $t('proprieteIntellectuelle') }}</label>
						<p>{{ $t('mentionsLegales2') }}</p>
						<p>{{ $t('mentionsLegales3') }}</p>
						<label>{{ $t('politiqueConfidentialite') }}</label>
						<p>{{ $t('mentionsLegales4') }}</p>
						<p>{{ $t('mentionsLegales5') }}</p>
						<label>{{ $t('hebergement') }}</label>
						<p>{{ $t('mentionsLegales6') }}</p>
					</div>
				</div>
			</div>
		</div>

		<div id="hub" :class="{'ouvert': hub}" :tabindex="hub ? 0 : -1">
			<span role="button" :tabindex="hub ? 0 : -1" @click="fermerHub" @keydown.enter="fermerHub"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" width="36px" height="36px"><path d="M0 0h24v24H0z" fill="none" /><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg></span>
			<iframe src="https://ladigitale.dev/hub.html" title="Le Hub by La Digitale"></iframe>
		</div>

		<Notification :notification="notification" @fermer="notification = ''" v-if="notification !== ''" />

		<Message :message="message" @elementPrecedent="definirElementPrecedent" @fermer="fermerMessage" v-if="message !== ''" />

		<ChargementPage v-if="chargementPage" />
	</div>
</template>

<script>
import axios from 'axios'
import ChargementPage from '#root/components/chargement-page.vue'
import Message from '#root/components/message.vue'
import Notification from '#root/components/notification.vue'

export default {
	name: 'Accueil',
	components: {
		ChargementPage,
		Message,
		Notification
	},
	data () {
		return {
			chargementPage: true,
			chargement: false,
			message: '',
			notification: '',
			modale: '',
			titre: '',
			motDePassePad: '',
			identifiant: '',
			motDePasse: '',
			confirmationMotDePasse: '',
			email: '',
			hub: false,
			elementPrecedent: null,
			hote: this.$pageContext.pageProps.hote,
			langues: this.$pageContext.pageProps.langues,
			langue: this.$pageContext.pageProps.langue,
			creationCompte: 1,
			creationPadSansCompte: 0,
			version: app_version
		}
	},
	created () {
		const params = this.$pageContext.pageProps.params
		const langue = params.lang
		if (langue && this.langues.includes(langue) === true) {
			this.$i18n.locale = langue
			this.langue = langue
			this.$socket.emit('modifierlangue', langue)
		} else {
			this.$i18n.locale = this.langue
		}
		if (import.meta.env.VITE_CREATE_ACCOUNT && import.meta.env.VITE_CREATE_ACCOUNT !== '') {
			this.creationCompte = parseInt(import.meta.env.VITE_CREATE_ACCOUNT)
		}
		if (import.meta.env.VITE_PAD_WITHOUT_ACCOUNT && import.meta.env.VITE_PAD_WITHOUT_ACCOUNT !== '') {
			this.creationPadSansCompte = parseInt(import.meta.env.VITE_PAD_WITHOUT_ACCOUNT)
		}
	},
	mounted () {
		document.getElementsByTagName('html')[0].setAttribute('lang', this.langue)

		setTimeout(function () {
			this.chargementPage = false
		}.bind(this), 300)

		document.addEventListener('keydown', this.gererClavier, false)
	},
	beforeUnmount () {
		document.removeEventListener('keydown', this.gererClavier, false)
	},
	methods: {
		definirTabIndex () {
			return this.modale === '' && this.message === '' && !this.hub ? 0 : -1
		},
		afficherModaleCreer () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'creer'
			this.$nextTick(function () {
				document.querySelector('.modale input').focus()
			})
		},
		creerPad () {
			if (this.titre.trim() !== '' && this.motDePassePad.trim() !== '') {
				this.chargement = true
				axios.post(this.hote + '/api/creer-pad-sans-compte', {
					titre: this.titre.trim(),
					motdepasse: this.motDePassePad.trim()
				}).then(function (reponse) {
					const donnees = reponse.data
					if (donnees === 'erreur_creation') {
						this.chargement = false
						this.message = this.$t('erreurCreationPad')
					} else {
						window.location.href = '/p/' + donnees.id + '/' + donnees.token
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			} else {
				this.message = this.$t('remplirChamps')
			}
		},
		fermerModaleCreer () {
			this.modale = ''
			this.titre = ''
			this.gererFocus()
		},
		afficherModaleConnexion () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'connexion'
			this.$nextTick(function () {
				document.querySelector('.modale input').focus()
			})
		},
		seConnecter () {
			if (this.identifiant !== '' && this.motDePasse !== '') {
				this.chargement = true
				axios.post(this.hote + '/api/connexion', {
					identifiant: this.identifiant,
					motdepasse: this.motDePasse
				}).then(function (reponse) {
					const donnees = reponse.data
					if (donnees === 'erreur_connexion') {
						this.chargement = false
						this.message = this.$t('informationsConnexionIncorrectes')
					} else {
						window.location.href = '/u/' + donnees.identifiant
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			} else {
				this.message = this.$t('remplirChamps')
			}
		},
		afficherModaleInscription () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'inscription'
			this.$nextTick(function () {
				document.querySelector('.modale input').focus()
			})
		},
		sInscrire () {
			if (this.identifiant.trim() !== '' && this.verifierIdentifant(this.identifiant.trim()) === true && this.motDePasse.trim() !== '' && this.motDePasse.trim() === this.confirmationMotDePasse.trim() && this.email.trim() !== '' && this.$verifierEmail(this.email.trim()) === true) {
				this.chargement = true
				axios.post(this.hote + '/api/inscription', {
					identifiant: this.identifiant.trim(),
					motdepasse: this.motDePasse.trim(),
					email: this.email.trim()
				}).then(function (reponse) {
					const donnees = reponse.data
					if (donnees === 'utilisateur_existe_deja') {
						this.chargement = false
						this.message = this.$t('identifiantExisteDeja', { identifiant: this.identifiant.trim() })
					} else {
						window.location.href = '/u/' + donnees.identifiant
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			} else if (this.identifiant.trim() === '' || this.motDePasse.trim() === '' || this.confirmationMotDePasse.trim() === '' || this.email.trim() === '') {
				this.message = this.$t('remplirChamps')
			} else if (this.verifierIdentifant(this.identifiant.trim()) === false) {
				this.message = this.$t('identifiantNonConforme')
			} else if (this.motDePasse.trim() !== this.confirmationMotDePasse.trim()) {
				this.message = this.$t('motsDePassePasIdentiques')
			} else if (this.$verifierEmail(this.email.trim()) === false) {
				this.message = this.$t('erreurEmail')
			}
		},
		verifierIdentifant (identifiant) {
			const caracteres = ['?', '#', '$', '&', '%', '[', ']', '{', '}', '<', '>', '/', '@', '"', "'", '*', '+', '°', '=', '€']
			let conforme = true
			caracteres.forEach(function (caractere) {
				if (identifiant.includes(caractere)) {
					conforme = false
				}
			})
			if (identifiant.length < 3) {
				conforme = false
			}
			return conforme
		},
		afficherModaleMotDePasseOublie () {
			this.motDePasse = ''
			this.modale = 'mot-de-passe-oublie'
			this.$nextTick(function () {
				document.querySelector('.modale input').focus()
			})
		},
		envoyerMotDePasse () {
			if (this.identifiant.trim() !== '' && this.email.trim() !== '' && this.$verifierEmail(this.email.trim()) === true) {
				this.chargement = true
				axios.post(this.hote + '/api/mot-de-passe-oublie', {
					identifiant: this.identifiant.trim(),
					email: this.email.trim()
				}).then(function (reponse) {
					this.chargement = false
					const donnees = reponse.data
					if (donnees === 'erreur') {
						this.message = this.$t('erreurCommunicationServeur')
					} else if (donnees === 'identifiant_invalide') {
						this.message = this.$t('identifiantNonValide')
					} else if (donnees === 'email_invalide') {
						this.message = this.$t('emailNonValide')
					} else {
						this.fermerModaleMotDePasseOublie()
						this.notification = this.$t('emailEnvoye')
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			} else if (this.identifiant.trim() === '' || this.email.trim() === '') {
				this.message = this.$t('remplirChamps')
			} else if (this.$verifierEmail(this.email.trim()) === false) {
				this.message = this.$t('erreurEmail')
			}
		},
		fermerModaleConnexion () {
			this.modale = ''
			this.identifiant = ''
			this.motDePasse = ''
			this.gererFocus()
		},
		fermerModaleInscription () {
			this.modale = ''
			this.identifiant = ''
			this.motDePasse = ''
			this.confirmationMotDePasse = ''
			this.gererFocus()
		},
		fermerModaleMotDePasseOublie () {
			this.modale = ''
			this.identifiant = ''
			this.email = ''
			this.gererFocus()
		},
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
		afficherMentionsLegales () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'mentions-legales'
			this.$nextTick(function () {
				document.querySelector('.modale .fermer').focus()
			})
		},
		ouvrirHub () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.hub = true
			this.$nextTick(function () {
				document.querySelector('#hub span').focus()
			})
		},
		fermerHub () {
			this.hub = false
			this.gererFocus()
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
			} else if (event.key === 'Escape' && this.modale === 'creer') {
				this.fermerModaleCreer()
			} else if (event.key === 'Escape' && this.modale === 'connexion') {
				this.fermerModaleConnexion()
			} else if (event.key === 'Escape' && this.modale === 'mot-de-passe-oublie') {
				this.fermerModaleMotDePasseOublie()
			} else if (event.key === 'Escape' && this.modale === 'inscription') {
				this.fermerModaleInscription()
			} else if (event.key === 'Escape' && this.modale !== '') {
				this.fermerModale()
			} else if (event.key === 'Escape' && this.hub) {
				this.hub = false
				this.gererFocus()
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

#accueil {
	background-size: cover;
	background-position: center;
	background-repeat: no-repeat;
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
	position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
	flex-wrap: wrap;
	overflow: auto;
}

#contenu {
	max-width: 76em;
	text-align: center;
	padding: 12em 1em 6em;
	margin: auto;
}

#conteneur h1 {
    font-family: 'HKGroteskWide-ExtraBold', 'HKGrotesk-ExtraBold', sans-serif;
    font-size: 3em;
	font-weight: 900;
    margin-bottom: 0.85em;
    line-height: 1.4;
}

#conteneur p {
    font-size: 1.25em;
    line-height: 1.4;
    margin-bottom: 1.5em;
}

#actions {
	display: flex;
	justify-content: center;
	flex-wrap: wrap;
}

#actions .bouton {
	display: flex;
	justify-content: center;
	align-items: center;
	width: 180px;
    line-height: 1;
    font-size: 1em;
    font-weight: 700;
    text-transform: uppercase;
	padding: 1em 1.5em;
	margin-right: 1em;
    border: 2px solid #00ced1;
	border-radius: 2em;
    background: #46fbff;
	cursor: pointer;
    transition: all 0.1s ease-in;
	text-align: center;
}

#actions .bouton:hover {
	text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.2);
	background: #fff;
}

#actions .bouton:last-child {
	margin-right: 0;
}

#credits {
	width: 100%;
	margin: 0 auto 0.75em;
}

#credits p {
    font-size: 1em;
    line-height: 1.2;
    margin-bottom: 1em;
	text-align: center;
}

#credits p:last-child {
	display: flex;
	justify-content: center;
	align-items: center;
}

#credits p:last-child a {
	margin: 0 5px;
}

#credits .mentions-legales {
	cursor: pointer;
}

#credits .hub {
	font-size: 0;
	cursor: pointer;
}

#hub {
	position: fixed;
	visibility: hidden;
	opacity: 0;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
	z-index: -1;
}

#hub.ouvert {
	visibility: visible;
	opacity: 1;
    animation: fonduEntrant linear 0.1s;
	z-index: 100000;
}

#hub iframe {
	width: 100%;
    height: 100%;
}

#hub span {
	font-size: 0;
	color: #fff;
	position: absolute;
	top: 15px;
	right: 15px;
	cursor: pointer;
}

#mentions-legales {
	max-width: 700px;
	height: 500px;
	max-height: 90%;
}

#connexion #champ-motdepasse {
	margin-bottom: 10px;
}

.modale .contenu .mot-de-passe-oublie {
	font-size: 12px;
    margin-bottom: 20px;
	cursor: pointer;
}

@media screen and (max-width: 359px) {
	#contenu {
		padding: 4em 1em 2em;
	}

	#actions .bouton {
		font-size: 0.75em!important;
		width: 130px;
		padding: 1em 0.5em;
	}
}

@media screen and (orientation: landscape) and (max-height: 479px) {
	#creation,
	#connexion,
	#inscription {
		height: 90%;
	}
}

@media screen and (min-width: 360px) and (max-width: 599px) {
	#contenu {
		padding: 5em 1em 2.5em;
	}

	#actions .bouton {
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

	#conteneur p {
		font-size: 1em;
		margin-bottom: 1.2em;
	}

	#actions .bouton {
		font-size: 0.85em;
	}

	#credits p {
		font-size: 0.85em;
	}

	#hub span {
		top: 5px;
		right: 5px;
	}

	#hub span svg {
		width: 24px;
		height: 24px;
	}
}

@media screen and (max-width: 767px) {
	#actions .bouton:last-of-type {
		margin-right: 0;
	}

	#actions div {
		width: 100%;
		margin-top: 1em;
	}

	#actions div .bouton {
		margin: auto!important;
	}
}

@media screen and (max-width: 599px) and (orientation: landscape) {
	#contenu {
		padding: 2em 1em 1.5em!important;
	}
}

@media screen and (min-width: 600px) and (max-width: 820px) and (orientation: landscape) {
	#contenu {
		padding: 3em 1em 1.5em!important;
	}
}

@media screen and (max-width: 820px) and (orientation: landscape) {
	#conteneur p {
		font-size: 1em!important;
	}

	#credits p {
		font-size: 0.85em!important;
		margin-bottom: 0.85em!important;
	}
}

@media screen and (max-width: 1023px) and (orientation: landscape) {
	#contenu {
		padding: 7em 1em 3.5em;
	}
}

@media screen and (max-width: 850px) and (max-height: 500px) {
	#conteneur h1 {
		font-size: 2em;
		margin-bottom: 1em;
	}

	#conteneur p {
		font-size: 1em;
		margin-bottom: 1.2em;
	}

	#credits p {
		font-size: 0.85em!important;
	}

	#actions .bouton {
		font-size: 0.85em!important;
	}
}
</style>
