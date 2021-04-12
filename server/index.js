require('dotenv').config()
const http = require('http')
const path = require('path')
const fs = require('fs-extra')
const { Nuxt, Builder } = require('nuxt')
const express = require('express')
const app = express()
const server = http.createServer(app)
const axios = require('axios')
const cors = require('cors')
const io = require('socket.io')(server)
const redis = require('redis')
const session = require('express-session')
const RedisStore = require('connect-redis')(session)
let db
if (process.env.NODE_ENV === 'production') {
	db = redis.createClient({ host: process.env.DB_HOST, port: '6379', password: process.env.DB_PWD })
} else {
	db = redis.createClient()
}
const bodyParser = require('body-parser')
const helmet = require('helmet')
const v = require('voca')
const multer = require('multer')
const sharp = require('sharp')
const gm = require('gm')
const moment = require('moment')
const bcrypt = require('bcrypt')
let storeOptions
if (process.env.NODE_ENV === 'production') {
	storeOptions = {
		host: process.env.DB_HOST,
		port: '6379',
		pass: process.env.DB_PWD,
		client: db,
		prefix: 'sessions:'
	}
} else {
	storeOptions = {
		host: 'localhost',
		port: 6379,
		client: db,
		prefix: 'sessions:'
	}
}
const sessionOptions = {
	secret: process.env.SESSION_KEY,
	store: new RedisStore(storeOptions),
	name: 'digipad',
	resave: false,
	rolling: true,
	saveUninitialized: false
}
const expressSession = session(sessionOptions)
const sharedsession = require('express-socket.io-session')
const config = require('../nuxt.config.js')

config.dev = !(process.env.NODE_ENV === 'production')
const nuxt = new Nuxt(config)
const { host, port } = nuxt.options.server

if (config.dev) {
	process.env.DEBUG = 'nuxt:*'
	const builder = new Builder(nuxt)
	builder.build()
} else {
	nuxt.ready()
}

app.set('trust proxy', true)
app.use(helmet())
app.use(bodyParser.json({ limit: '100mb' }))
app.use(expressSession)
io.use(sharedsession(expressSession, {
	autoSave: true
}))
app.use(cors())

app.get('/', function (req, res) {
	const identifiant = req.session.identifiant
	if (identifiant && req.session.statut === 'utilisateur') {
		res.redirect('/u/' + identifiant)
	} else {
		req.next()
	}
})

app.get('/u/:u', function(req, res) {
	const identifiant = req.params.u
	if (identifiant === req.session.identifiant && req.session.statut === 'utilisateur') {
		req.next()
	} else {
		res.redirect('/')
	}
})

app.get('/p/:id/:token', function (req) {
	if (req.session.identifiant === '' || req.session.identifiant === undefined) {
		const identifiant = 'u' + Math.random().toString(16).slice(3)
		const nom = choisirNom() + ' ' + choisirAdjectif()
		db.hmset('noms:' + identifiant, 'nom', nom, function () {
			req.session.identifiant = identifiant
			req.session.nom = nom
			req.session.langue = 'fr'
			req.session.statut = 'invite'
			req.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
			req.next()
		})
	} else {
		req.next()
	}
})

app.post('/api/inscription', function (req, res) {
	const identifiant = req.body.identifiant
	const motdepasse = req.body.motdepasse
	db.exists('utilisateurs:' + identifiant, function (err, reponse) {
		if (err) { res.send('erreur') }
		if (reponse === 0) {
			const hash = bcrypt.hashSync(motdepasse, 10)
			const date = moment().format()
			const multi = db.multi()
			multi.hmset('utilisateurs:' + identifiant, 'id', identifiant, 'motdepasse', hash, 'date', date, 'nom', '', 'langue', 'fr')
			multi.exec(function () {
				req.session.identifiant = identifiant
				req.session.nom = ''
				req.session.langue = 'fr'
				req.session.statut = 'utilisateur'
				req.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				res.json({ identifiant: identifiant, motdepasse: hash, nom: '', langue: 'fr', statut: 'utilisateur' })
			})
		} else {
			res.send('utilisateur_existe_deja')
		}
	})
})

app.post('/api/connexion', function (req, res) {
	const identifiant = req.body.identifiant
	const motdepasse = req.body.motdepasse
	db.exists('utilisateurs:' + identifiant, function (err, reponse) {
		if (err) { res.send('erreur_connexion') }
		if (reponse === 1 && req.session.identifiant !== identifiant) {
			db.hgetall('utilisateurs:' + identifiant, function (err, donnees) {
				if (err) { res.send('erreur_connexion') }
				if (bcrypt.compareSync(motdepasse, donnees.motdepasse)) {
					const nom = donnees.nom
					const langue = donnees.langue
					req.session.identifiant = identifiant
					req.session.nom = nom
					req.session.langue = langue
					req.session.statut = 'utilisateur'
					req.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
					res.json({ identifiant: identifiant, nom: nom, langue: langue, statut: 'utilisateur' })
				} else {
					res.send('erreur_connexion')
				}
			})
		} else {
			res.send('erreur_connexion')
		}
	})
})

app.post('/api/deconnexion', function (req, res) {
	req.session.identifiant = ''
	req.session.nom = ''
	req.session.langue = ''
	req.session.statut = ''
	req.session.destroy()
	res.send('deconnecte')
})

app.post('/api/recuperer-donnees-utilisateur', function (req, res) {
	const identifiant = req.body.identifiant
	recupererDonnees(identifiant).then(function (pads) {
		const padsCrees = pads[0]
		const padsRejoints = pads[1]
		res.json({ padsCrees: padsCrees, padsRejoints: padsRejoints })
	})
})

app.post('/api/recuperer-donnees-pad', function (req, res) {
	const id = req.body.id
	const token = req.body.token
	const identifiant = req.body.identifiant
	const statut = req.body.statut
	db.exists('pads:' + id, function (err, resultat) {
		if (err) { res.send('erreur_pad') }
		if (resultat === 1) {
			db.hgetall('pads:' + id, function (err, pad) {
				if (err) { res.send('erreur_pad') }
				if (pad.id === id && pad.token === token) {
					const blocsPad = new Promise(function (resolveMain) {
						const donneesBlocs = []
						db.zrange('blocs:' + id, 0, -1, function (err, blocs) {
							if (err) { resolveMain(donneesBlocs) }
							for (const bloc of blocs) {
								const donneesBloc = new Promise(function (resolve) {
									db.hgetall('pad-' + id + ':' + bloc, function (err, donnees) {
										if (err) { resolve() }
										db.exists('utilisateurs:' + donnees.identifiant, function (err, resultat) {
											if (err) { resolve(donnees) }
											if (resultat === 1) {
												db.hgetall('utilisateurs:' + donnees.identifiant, function (err, utilisateur) {
													if (err) { resolve(donnees) }
													donnees.nom = utilisateur.nom
													db.hget('couleurs:' + donnees.identifiant, 'pad' + id, function (err, couleur) {
														if (err) { resolve(donnees) }
														donnees.couleur = couleur
														db.zcard('commentaires:' + bloc, function (err, commentaires) {
															if (err) { resolve(donnees) }
															donnees.commentaires = commentaires
															db.zrange('evaluations:' + bloc, 0, -1, function (err, evaluations) {
																if (err) { resolve(donnees) }
																const donneesEvaluations = []
																evaluations.forEach(function (evaluation) {
																	donneesEvaluations.push(JSON.parse(evaluation))
																})
																donnees.evaluations = donneesEvaluations
																resolve(donnees)
															})
														})
													})
												})
											} else {
												db.hget('noms:' + donnees.identifiant, 'nom', function (err, nom) {
													if (err) { resolve(donnees) }
													donnees.nom = nom
													db.hget('couleurs:' + donnees.identifiant, 'pad' + id, function (err, couleur) {
														if (err) { resolve(donnees) }
														donnees.couleur = couleur
														db.zcard('commentaires:' + bloc, function (err, commentaires) {
															if (err) { resolve(donnees) }
															donnees.commentaires = commentaires
															db.zrange('evaluations:' + bloc, 0, -1, function (err, evaluations) {
																if (err) { resolve(donnees) }
																const donneesEvaluations = []
																evaluations.forEach(function (evaluation) {
																	donneesEvaluations.push(JSON.parse(evaluation))
																})
																donnees.evaluations = donneesEvaluations
																resolve(donnees)
															})
														})
													})
												})
											}
										})
									})
								})
								donneesBlocs.push(donneesBloc)
							}
							Promise.all(donneesBlocs).then(function (resultat) {
								resolveMain(resultat)
							})
						})
					})
					const activitePad = new Promise(function (resolveMain) {
						const donneesEntrees = []
						db.zrange('activite:' + id, 0, -1, function (err, entrees) {
							if (err) { resolveMain(donneesEntrees) }
							for (let entree of entrees) {
								entree = JSON.parse(entree)
								const donneesEntree = new Promise(function (resolve) {
									db.exists('utilisateurs:' + entree.identifiant, function (err, resultat) {
										if (err) { resolve() }
										if (resultat === 1) {
											db.hgetall('utilisateurs:' + entree.identifiant, function (err, utilisateur) {
												if (err) { resolve() }
												entree.nom = utilisateur.nom
												db.hget('couleurs:' + entree.identifiant, 'pad' + id, function (err, couleur) {
													if (err) { resolve() }
													entree.couleur = couleur
													resolve(entree)
												})
											})
										} else {
											db.hget('noms:' + entree.identifiant, 'nom', function (err, nom) {
												if (err) { resolve() }
												entree.nom = nom
												db.hget('couleurs:' + entree.identifiant, 'pad' + id, function (err, couleur) {
													if (err) { resolve() }
													entree.couleur = couleur
													resolve(entree)
												})
											})
										}
									})
								})
								donneesEntrees.push(donneesEntree)
							}
							Promise.all(donneesEntrees).then(function (resultat) {
								resolveMain(resultat)
							})
						})
					})
					Promise.all([blocsPad, activitePad]).then(function ([blocs, activite]) {
						if (pad.colonnes) {
							pad.colonnes = JSON.parse(pad.colonnes)
						}
						if (pad.identifiant !== identifiant && statut === 'utilisateur') {
							db.smembers('pads-rejoints:' + identifiant, function (err, padsRejoints) {
								if (err) { res.send('erreur_pad') }
								let padDejaRejoint = false
								for (const padRejoint of padsRejoints) {
									if (padRejoint === id) {
										padDejaRejoint = true
									}
								}
								if (padDejaRejoint === false) {
									const multi = db.multi()
									multi.sadd('pads-rejoints:' + identifiant, id)
									multi.sadd('pads-utilisateurs:' + identifiant, id)
									multi.hmset('couleurs:' + identifiant, 'pad' + id, choisirCouleur())
									multi.sadd('utilisateurs-pads:' + id, identifiant)
									multi.exec(function () {
										res.json({ pad: pad, blocs: blocs, activite: activite.reverse() })
									})
								} else {
									res.json({ pad: pad, blocs: blocs, activite: activite.reverse() })
								}
							})
						} else {
							res.json({ pad: pad, blocs: blocs, activite: activite.reverse() })
						}
					})
				} else {
					res.send('erreur_pad')
				}
			})
		} else {
			res.send('erreur_pad')
		}
	})
})

app.post('/api/creer-pad', function (req, res) {
	const identifiant = req.body.identifiant
	if (req.session.identifiant && req.session.identifiant === identifiant) {
		const titre = req.body.titre
		const token = Math.random().toString(16).slice(2)
		const date = moment().format()
		const couleur = choisirCouleur()
		db.exists('pad', function (err, resultat) {
			if (err) { res.send('erreur_creation') }
			if (resultat === 1) {
				db.get('pad', function (err, resultat) {
					if (err) { res.send('erreur_creation') }
					const id = parseInt(resultat) + 1
					const multi = db.multi()
					multi.incr('pad')
					multi.hmset('pads:' + id, 'id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'fond', '/img/fond1.png', 'acces', 'public', 'contributions', 'ouvertes', 'affichage', 'mur', 'registreActivite', 'active', 'conversation', 'desactivee', 'fichiers', 'actives', 'liens', 'actives', 'documents', 'desactives', 'commentaires', 'desactives', 'evaluations', 'desactivees', 'date', date, 'colonnes', JSON.stringify([]), 'bloc', 0, 'activite', 0)
					multi.sadd('pads-crees:' + identifiant, id)
					multi.sadd('utilisateurs-pads:' + id, identifiant)
					multi.hmset('couleurs:' + identifiant, 'pad' + id, couleur)
					multi.exec(function () {
						const chemin = path.join(__dirname, '..', '/static/fichiers/' + id)
						fs.mkdirsSync(chemin)
						res.json({ id: id, token: token, titre: titre, identifiant: identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desdesactivee', fichiers: 'actives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', date: date, colonnes: [], bloc: 0, activite: 0 })
					})
				})
			} else {
				const multi = db.multi()
				multi.set('pad', '1')
				multi.hmset('pads:1', 'id', 1, 'token', token, 'titre', titre, 'identifiant', identifiant, 'fond', '/img/fond1.png', 'acces', 'public', 'contributions', 'ouvertes', 'affichage', 'mur', 'registreActivite', 'active', 'conversation', 'activee', 'fichiers', 'actives', 'liens', 'actives', 'documents', 'desactives', 'commentaires', 'desactives', 'evaluations', 'desactivees', 'date', date, 'colonnes', JSON.stringify([]), 'bloc', 0, 'activite', 0)
				multi.sadd('pads-crees:' + identifiant, 1)
				multi.sadd('utilisateurs-pads:1', identifiant)
				multi.hmset('couleurs:' + identifiant, 'pad1', couleur)
				multi.exec(function () {
					const chemin = path.join(__dirname, '..', '/static/fichiers/1')
					fs.mkdirsSync(chemin)
					res.json({ id: 1, token: token, titre: titre, identifiant: identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desactivee', fichiers: 'actives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', date: date, colonnes: [], bloc: 0, activite: 0 })
				})
			}
		})
	} else {
		res.send('non_connecte')
	}
})

app.post('/api/creer-pad-sans-compte', function (req, res) {
	let identifiant, nom
	if (req.session.identifiant === '' || req.session.identifiant === undefined) {
		identifiant = 'u' + Math.random().toString(16).slice(3)
		nom = choisirNom() + ' ' + choisirAdjectif()
		req.session.identifiant = identifiant
		req.session.nom = nom
	} else {
		identifiant = req.session.identifiant
		nom = req.session.nom
	}
	const titre = req.body.titre
	const motdepasse = req.body.motdepasse
	const hash = bcrypt.hashSync(motdepasse, 10)
	const token = Math.random().toString(16).slice(2)
	const date = moment().format()
	db.get('pad', function (err, resultat) {
		if (err) { res.send('erreur_creation') }
		const id = parseInt(resultat) + 1
		const multi = db.multi()
		multi.incr('pad')
		multi.hmset('pads:' + id, 'id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'motdepasse', hash, 'fond', '/img/fond1.png', 'acces', 'public', 'contributions', 'ouvertes', 'affichage', 'mur', 'registreActivite', 'active', 'conversation', 'desactivee', 'fichiers', 'actives', 'liens', 'actives', 'documents', 'desactives', 'commentaires', 'desactives', 'evaluations', 'desactivees', 'date', date, 'colonnes', JSON.stringify([]), 'bloc', 0, 'activite', 0)
		multi.hmset('utilisateurs:' + identifiant, 'id', identifiant, 'motdepasse', '', 'date', date, 'nom', nom, 'langue', 'fr')
		multi.exec(function () {
			const chemin = path.join(__dirname, '..', '/static/fichiers/' + id)
			fs.mkdirsSync(chemin)
			req.session.langue = 'fr'
			req.session.statut = 'auteur'
			req.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
			res.json({ id: id, token: token, titre: titre, identifiant: identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desactivee', fichiers: 'actives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', date: date, colonnes: [], bloc: 0, activite: 0 })
		})
	})
})

app.post('/api/deconnecter-pad', function (req, res) {
	const identifiant = req.body.identifiant
	if (req.session.identifiant && req.session.identifiant === identifiant) {
		req.session.identifiant = ''
		req.session.statut = ''
		res.send('deconnecte')
	} else {
		res.send('non_connecte')
	}
})

app.post('/api/modifier-mot-de-passe-pad', function (req, res) {
	const identifiant = req.body.identifiant
	if (req.session.identifiant && req.session.identifiant === identifiant) {
		const pad = req.body.pad
		db.hgetall('pads:' + pad, function (err, donnees) {
			if (err) { res.send('erreur') }
			if (bcrypt.compareSync(req.body.motdepasse, donnees.motdepasse)) {
				const hash = bcrypt.hashSync(req.body.nouveaumotdepasse, 10)
				db.hmset('pads:' + pad, 'motdepasse', hash)
				res.send('motdepasse_modifie')
			} else {
				res.send('motdepasse_incorrect')
			}
		})
	} else {
		res.send('non_connecte')
	}
})

app.post('/api/dupliquer-pad', function (req, res) {
	const identifiant = req.body.identifiant
	if (req.session.identifiant && req.session.identifiant === identifiant) {
		const pad = req.body.padId
		db.get('pad', function (err, resultat) {
			if (err) { res.send('erreur_duplication') }
			const id = parseInt(resultat) + 1
			db.hgetall('pads:' + pad, function (err, donnees) {
				if (err) { res.send('erreur_duplication') }
				const donneesBlocs = []
				db.zrange('blocs:' + pad, 0, -1, function (err, blocs) {
					if (err) { res.send('erreur_duplication') }
					for (const bloc of blocs) {
						const donneesBloc = new Promise(function (resolve) {
							db.hgetall('pad-' + pad + ':' + bloc, function (err, donnees) {
								if (err) { resolve() }
								const date = moment().format()
								const multi = db.multi()
								const blocId = 'bloc-id-' + (new Date()).getTime() + Math.random().toString(16).slice(10)
								multi.hmset('pad-' + id + ':' + blocId, 'id', donnees.id, 'bloc', blocId, 'titre', donnees.titre, 'texte', donnees.texte, 'media', donnees.media, 'iframe', donnees.iframe, 'type', donnees.type, 'source', donnees.source, 'vignette', donnees.vignette, 'date', date, 'identifiant', identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', donnees.colonne)
								multi.zadd('blocs:' + id, donnees.id, blocId)
								multi.exec(function () {
									resolve(blocId)
								})
							})
						})
						donneesBlocs.push(donneesBloc)
					}
					Promise.all(donneesBlocs).then(function () {
						const token = Math.random().toString(16).slice(2)
						const date = moment().format()
						const couleur = choisirCouleur()
						const multi = db.multi()
						multi.incr('pad')
						multi.hmset('pads:' + id, 'id', id, 'token', token, 'titre', 'Copie de ' + donnees.titre, 'identifiant', identifiant, 'fond', donnees.fond, 'acces', donnees.acces, 'contributions', donnees.contributions, 'affichage', donnees.affichage, 'fichiers', donnees.fichiers, 'liens', donnees.liens, 'documents', donnees.documents, 'commentaires', donnees.commentaires, 'evaluations', donnees.evaluations, 'date', date, 'colonnes', donnees.colonnes, 'bloc', donnees.bloc, 'activite', 0)
						multi.sadd('pads-crees:' + identifiant, id)
						multi.sadd('utilisateurs-pads:' + id, identifiant)
						multi.hmset('couleurs:' + identifiant, 'pad' + id, couleur)
						multi.exec(function () {
							fs.copySync(path.join(__dirname, '..', '/static/fichiers/' + pad), path.join(__dirname, '..', '/static/fichiers/' + id))
							res.json({ id: id, token: token, titre: 'Copie de ' + donnees.titre, identifiant: identifiant, fond: donnees.fond, acces: donnees.acces, contributions: donnees.contributions, affichage: donnees.affichage, fichiers: donnees.fichiers, liens: donnees.liens, documents: donnees.documents, commentaires: donnees.commentaires, evaluations: donnees.evaluations, date: date, colonnes: donnees.colonnes, bloc: donnees.bloc, activite: 0 })
						})
					})
				})
			})
		})
	} else {
		res.send('non_connecte')
	}
})

app.post('/api/supprimer-pad', function (req, res) {
	const identifiant = req.body.identifiant
	if (req.session.identifiant && req.session.identifiant === identifiant) {
		const pad = req.body.padId
		db.hgetall('pads:' + pad, function (err, resultat) {
			if (err) { res.send('erreur_suppression') }
			if (resultat.identifiant === identifiant) {
				db.zrange('blocs:' + pad, 0, -1, function (err, blocs) {
					if (err) { res.send('erreur_suppression') }
					const multi = db.multi()
					for (let i = 0; i < blocs.length; i++) {
						multi.del('commentaires:' + blocs[i])
						multi.del('evaluations:' + blocs[i])
						multi.del('pad-' + pad + ':' + blocs[i])
					}
					multi.del('blocs:' + pad)
					multi.del('pads:' + pad)
					multi.del('activite:' + pad)
					multi.srem('pads-crees:' + identifiant, pad)
					multi.smembers('utilisateurs-pads:' + pad, function (err, utilisateurs) {
						if (err) { res.send('erreur_suppression') }
						for (let j = 0; j < utilisateurs.length; j++) {
							db.srem('pads-rejoints:' + utilisateurs[j], pad)
							db.srem('pads-utilisateurs:' + utilisateurs[j], pad)
							db.hdel('couleurs:' + utilisateurs[j], 'pad' + pad)
						}
					})
					multi.del('utilisateurs-pads:' + pad)
					multi.exec(function () {
						const chemin = path.join(__dirname, '..', '/static/fichiers/' + pad)
						fs.removeSync(chemin)
						res.send('pad_supprime')
					})
				})
			} else {
				db.srem('pads-rejoints:' + identifiant, pad, function () {
					res.send('pad_supprime')
				})
			}
		})
	} else {
		res.send('non_connecte')
	}
})

app.post('/api/modifier-nom', function (req, res) {
	const identifiant = req.body.identifiant
	if (req.session.identifiant && req.session.identifiant === identifiant) {
		const nom = req.body.nom
		db.hmset('utilisateurs:' + identifiant, 'nom', nom)
		req.session.nom = nom
		res.send('utilisateur_modifie')
	} else {
		res.send('non_connecte')
	}
})

app.post('/api/modifier-mot-de-passe', function (req, res) {
	const identifiant = req.body.identifiant
	if (req.session.identifiant && req.session.identifiant === identifiant) {
		db.hgetall('utilisateurs:' + identifiant, function (err, donnees) {
			if (err) { res.send('erreur') }
			if (bcrypt.compareSync(req.body.motdepasse, donnees.motdepasse)) {
				const hash = bcrypt.hashSync(req.body.nouveaumotdepasse, 10)
				db.hmset('utilisateurs:' + identifiant, 'motdepasse', hash)
				res.send('motdepasse_modifie')
			} else {
				res.send('motdepasse_incorrect')
			}
		})
	} else {
		res.send('non_connecte')
	}
})

app.post('/api/supprimer-compte', function (req, res) {
	const identifiant = req.body.identifiant
	if (req.session.identifiant && req.session.identifiant === identifiant) {
		db.smembers('pads-crees:' + identifiant, function (err, pads) {
			if (err) { res.send('erreur') }
			const donneesPads = []
			for (const pad of pads) {
				const donneesPad = new Promise(function (resolve) {
					db.zrange('blocs:' + pad, 0, -1, function (err, blocs) {
						if (err) { resolve() }
						const multi = db.multi()
						for (let i = 0; i < blocs.length; i++) {
							multi.del('commentaires:' + blocs[i])
							multi.del('evaluations:' + blocs[i])
							multi.del('pad-' + pad + ':' + blocs[i])
						}
						multi.del('blocs:' + pad)
						multi.del('pads:' + pad)
						multi.del('activite:' + pad)
						multi.smembers('utilisateurs-pads:' + pad, function (err, utilisateurs) {
							if (err) { resolve() }
							for (let j = 0; j < utilisateurs.length; j++) {
								db.srem('pads-rejoints:' + utilisateurs[j], pad)
								db.srem('pads-utilisateurs:' + utilisateurs[j], pad)
								db.hdel('couleurs:' + utilisateurs[j], 'pad' + pad)
							}
						})
						multi.del('utilisateurs-pads:' + pad)
						multi.exec(function () {
							const chemin = path.join(__dirname, '..', '/static/fichiers/' + pad)
							fs.removeSync(chemin)
							resolve(pad)
						})
					})
				})
				donneesPads.push(donneesPad)
			}
			Promise.all(donneesPads).then(function () {
				db.smembers('pads-utilisateurs:' + identifiant, function (err, pads) {
					if (err) { res.send('erreur') }
					const donneesBlocs = []
					const donneesActivites = []
					const donneesCommentaires = []
					const donneesEvaluations = []
					for (const pad of pads) {
						const donneesBloc = new Promise(function (resolve) {
							db.zrange('blocs:' + pad, 0, -1, function (err, blocs) {
								if (err) { resolve() }
								for (let i = 0; i < blocs.length; i++) {
									db.hgetall('pad-' + pad + ':' + blocs[i], function (err, donnees) {
										if (err) { resolve() }
										if (donnees.identifiant === identifiant) {
											if (donnees.media !== '') {
												supprimerFichier(pad, donnees.media)
											}
											if (donnees.vignette !== '' && donnees.vignette.substring(1, 9) === 'fichiers') {
												supprimerVignette(donnees.vignette)
											}
											const multi = db.multi()
											multi.del('pad-' + pad + ':' + blocs[i])
											multi.zrem('blocs:' + pad, blocs[i])
											multi.del('commentaires:' + blocs[i])
											multi.del('evaluations:' + blocs[i])
											multi.exec(function () {
												resolve(blocs[i])
											})
										} else {
											resolve(blocs[i])
										}
									})
								}
							})
						})
						donneesBlocs.push(donneesBloc)
						const donneesActivite = new Promise(function (resolve) {
							db.zrange('activite:' + pad, 0, -1, function (err, entrees) {
								if (err) { resolve() }
								for (let i = 0; i < entrees.length; i++) {
									const entree = JSON.parse(entrees[i])
									if (entree.identifiant === identifiant) {
										db.zremrangebyscore('activite:' + pad, entree.id, entree.id, function () {
											resolve(entree.id)
										})
									} else {
										resolve(entree.id)
									}
								}
							})
						})
						donneesActivites.push(donneesActivite)
						const donneesCommentaire = new Promise(function (resolve) {
							db.zrange('blocs:' + pad, 0, -1, function (err, blocs) {
								if (err) { resolve() }
								for (let i = 0; i < blocs.length; i++) {
									db.zrange('commentaires:' + blocs[i], 0, -1, function (err, commentaires) {
										if (err) { resolve() }
										for (let j = 0; j < commentaires.length; j++) {
											const commentaire = JSON.parse(commentaires[j])
											if (commentaire.identifiant === identifiant) {
												db.zremrangebyscore('commentaires:' + blocs[i], commentaire.id, commentaire.id, function () {
													resolve(commentaire.id)
												})
											} else {
												resolve(commentaire.id)
											}
										}
									})
								}
							})
						})
						donneesCommentaires.push(donneesCommentaire)
						const donneesEvaluation = new Promise(function (resolve) {
							db.zrange('blocs:' + pad, 0, -1, function (err, blocs) {
								if (err) { resolve() }
								for (let i = 0; i < blocs.length; i++) {
									db.zrange('evaluations:' + blocs[i], 0, -1, function (err, evaluations) {
										if (err) { resolve() }
										for (let j = 0; j < evaluations.length; j++) {
											const evaluation = JSON.parse(evaluations[j])
											if (evaluation.identifiant === identifiant) {
												db.zremrangebyscore('evaluations:' + blocs[i], evaluation.id, evaluation.id, function () {
													resolve(evaluation.id)
												})
											} else {
												resolve(evaluation.id)
											}
										}
									})
								}
							})
						})
						donneesEvaluations.push(donneesEvaluation)
					}
					Promise.all([donneesBlocs, donneesActivites, donneesCommentaires, donneesEvaluations]).then(function () {
						const multi = db.multi()
						multi.del('pads-crees:' + identifiant)
						multi.del('pads-rejoints:' + identifiant)
						multi.del('pads-utilisateurs:' + identifiant)
						multi.del('utilisateurs:' + identifiant)
						multi.del('couleurs:' + identifiant)
						multi.del('noms:' + identifiant)
						multi.exec(function () {
							req.session.identifiant = ''
							req.session.nom = ''
							req.session.langue = ''
							req.session.statut = ''
							req.session.destroy()
							res.send('compte_supprime')
						})
					})
				})
			})
		})
	} else {
		res.send('non_connecte')
	}
})

app.post('/api/verifier-mot-de-passe', function (req, res) {
	const pad = req.body.pad
	db.hgetall('pads:' + pad, function (err, donnees) {
		if (err) { res.send('erreur') }
		if (bcrypt.compareSync(req.body.motdepasse, donnees.motdepasse)) {
			res.send('motdepasse_correct')
		} else {
			res.send('motdepasse_incorrect')
		}
	})
})

app.post('/api/verifier-code-acces', function (req, res) {
	const pad = req.body.pad
	db.hgetall('pads:' + pad, function (err, donnees) {
		if (err) { res.send('erreur') }
		if (req.body.code === donnees.code) {
			if (!req.session.acces) {
				req.session.acces = []
			}
			if (!req.session.acces.includes(pad)) {
				req.session.acces.push(pad)
			}
			res.send('code_correct')
		} else {
			res.send('code_incorrect')
		}
	})
})

app.post('/api/modifier-langue', function (req, res) {
	const identifiant = req.body.identifiant
	if (req.session.identifiant && req.session.identifiant === identifiant) {
		const langue = req.body.langue
		db.hmset('utilisateurs:' + identifiant, 'langue', langue)
		req.session.langue = langue
		res.send('langue_modifiee')
	} else {
		res.send('non_connecte')
	}
})

app.post('/api/televerser-fichier', function (req, res) {
	const identifiant = req.session.identifiant
	if (!identifiant) {
		res.send('non_connecte')
	} else {
		televerser(req, res, function () {
			const fichier = req.file
			const pad = req.body.pad
			let mimetype = fichier.mimetype
			const chemin = path.join(__dirname, '..', '/static/fichiers/' + pad + '/' + fichier.filename)
			if (mimetype.split('/')[0] === 'image') {
				const extension = path.parse(fichier.filename).ext
				if (extension.toLowerCase() === '.jpg' || extension.toLowerCase() === '.jpeg') {
					sharp(chemin).withMetadata().rotate().jpeg().resize(1200, 1200, {
						kernel: sharp.kernel.nearest,
						fit: 'inside'
					}).toBuffer((err, buffer) => {
						if (err) { res.send('erreur_televersement') }
						fs.writeFile(chemin, buffer, function() {
							res.json({ fichier: fichier.filename, mimetype: mimetype })
						})
					})
				} else {
					sharp(chemin).withMetadata().resize(1200, 1200, {
						kernel: sharp.kernel.nearest,
						fit: 'inside'
					}).toBuffer((err, buffer) => {
						if (err) { res.send('erreur_televersement') }
						fs.writeFile(chemin, buffer, function() {
							res.json({ fichier: fichier.filename, mimetype: mimetype })
						})
					})
				}
			} else if (mimetype === 'application/pdf') {
				console.log('ok')
				const destination = path.join(__dirname, '..', '/static/fichiers/' + pad + '/' + path.parse(fichier.filename).name + '.jpg')
				gm(chemin + '[0]').setFormat('jpg').resize(450).quality(75).write(destination, function (erreur) {
					console.log(erreur)
					if (erreur) {
						res.json({ fichier: fichier.filename, mimetype: 'document' })
					} else {
						res.json({ fichier: fichier.filename, mimetype: 'pdf' })
					}
				})
			} else {
				if (mimetype === 'application/vnd.oasis.opendocument.presentation' || mimetype === 'application/vnd.oasis.opendocument.text' || mimetype === 'application/vnd.oasis.opendocument.spreadsheet') {
					mimetype = 'document'
				} else if (mimetype === 'application/msword' || mimetype === 'application/vnd.ms-powerpoint' || mimetype === 'application/vnd.ms-excel' || mimetype.includes('officedocument') === true) {
					mimetype = 'office'
				}
				res.json({ fichier: fichier.filename, mimetype: mimetype })
			}
		})
	}
})

app.post('/api/televerser-vignette', function (req, res) {
	const identifiant = req.session.identifiant
	if (!identifiant) {
		res.send('non_connecte')
	} else {
		televerser(req, res, function () {
			const fichier = req.file
			const pad = req.body.pad
			const chemin = path.join(__dirname, '..', '/static/fichiers/' + pad + '/' + fichier.filename)
			const extension = path.parse(fichier.filename).ext
			if (extension.toLowerCase() === '.jpg' || extension.toLowerCase() === '.jpeg') {
				sharp(chemin).withMetadata().rotate().jpeg().resize(400, 400, {
					kernel: sharp.kernel.nearest,
					fit: 'inside'
				}).toBuffer((err, buffer) => {
					if (err) { res.send('erreur_televersement') }
					fs.writeFile(chemin, buffer, function() {
						res.send('/fichiers/' + pad + '/' + fichier.filename)
					})
				})
			} else {
				sharp(chemin).withMetadata().resize(400, 400, {
					kernel: sharp.kernel.nearest,
					fit: 'inside'
				}).toBuffer((err, buffer) => {
					if (err) { res.send('erreur_televersement') }
					fs.writeFile(chemin, buffer, function() {
						res.send('/fichiers/' + pad + '/' + fichier.filename)
					})
				})
			}
		})
	}
})

app.post('/api/televerser-fond', function (req, res) {
	const identifiant = req.session.identifiant
	if (!identifiant) {
		res.send('non_connecte')
	} else {
		televerser(req, res, function () {
			const fichier = req.file
			const pad = req.body.pad
			const chemin = path.join(__dirname, '..', '/static/fichiers/' + pad + '/' + fichier.filename)
			const extension = path.parse(fichier.filename).ext
			if (extension.toLowerCase() === '.jpg' || extension.toLowerCase() === '.jpeg') {
				sharp(chemin).withMetadata().rotate().jpeg().resize(1200, 1200, {
					kernel: sharp.kernel.nearest,
					fit: 'inside'
				}).toBuffer((err, buffer) => {
					if (err) { res.send('erreur_televersement') }
					fs.writeFile(chemin, buffer, function() {
						res.send('/fichiers/' + pad + '/' + fichier.filename)
					})
				})
			} else {
				sharp(chemin).withMetadata().resize(1200, 1200, {
					kernel: sharp.kernel.nearest,
					fit: 'inside'
				}).toBuffer((err, buffer) => {
					if (err) { res.send('erreur_televersement') }
					fs.writeFile(chemin, buffer, function() {
						res.send('/fichiers/' + pad + '/' + fichier.filename)
					})
				})
			}
		})
	}
})

app.use(nuxt.render)

server.listen(port, host)

io.on('connection', function (socket) {
	socket.on('connexion', function (donnees) {
		const pad = donnees.pad
		const identifiant = donnees.identifiant
		const nom = donnees.nom
		const room = 'pad-' + pad
		socket.join(room)
		socket.room = room
		socket.identifiant = identifiant
		socket.nom = nom
		const clients = Object.keys(io.sockets.adapter.rooms[room].sockets)
		const utilisateurs = []
		for (let client of clients) {
			client = io.sockets.connected[client]
			const donneesUtilisateur = new Promise(function (resolve) {
				db.hget('couleurs:' + client.identifiant, 'pad' + pad, function (err, couleur) {
					if (err || couleur === null) {
						couleur = choisirCouleur()
						db.hmset('couleurs:' + identifiant, 'pad' + pad, couleur, function () {
							resolve({ identifiant: client.identifiant, nom: client.nom, couleur: couleur })
						})
					} else {
						resolve({ identifiant: client.identifiant, nom: client.nom, couleur: couleur })
					}
				})
			})
			utilisateurs.push(donneesUtilisateur)
		}
		Promise.all(utilisateurs).then(function (resultat) {
			io.in(socket.room).emit('connexion', resultat)
		})
	})

	socket.on('sortie', function () {
		socket.to(socket.room).emit('deconnexion', socket.identifiant)
	})

	socket.on('deconnexion', function (identifiant) {
		socket.broadcast.emit('deconnexion', identifiant)
	})

	socket.on('ajouterbloc', function (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			const identifiant = socket.identifiant
			const nom = socket.nom
			db.hgetall('pads:' + pad, function (err, resultat) {
				if (err) { socket.emit('erreur'); return false }
				const id = parseInt(resultat.bloc) + 1
				db.hincrby('pads:' + pad, 'bloc', 1)
				if (resultat.id === pad && resultat.token === token) {
					const date = moment().format()
					const multi = db.multi()
					multi.hmset('pad-' + pad + ':' + bloc, 'id', id, 'bloc', bloc, 'titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'date', date, 'identifiant', identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', colonne)
					multi.zadd('blocs:' + pad, id, bloc)
					multi.exec(function () {
						io.in(socket.room).emit('ajouterbloc', { bloc: bloc, titre: titre, texte: texte, media: media, iframe: iframe, type: type, source: source, vignette: vignette, identifiant: identifiant, nom: nom, date: date, couleur: couleur, commentaires: 0, evaluations: [], colonne: colonne })
						enregistrerActivite(pad, { bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-ajoute' })
						socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
						socket.handshake.session.save()
					})
				}
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifierbloc', function (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hgetall('pads:' + pad, function (err, donnees) {
				if (donnees.id === pad && donnees.token === token) {
					const proprietaire = donnees.identifiant
					db.exists('pad-' + pad + ':' + bloc, function (err, resultat) {
						if (err) { socket.emit('erreur'); return false }
						if (resultat === 1) {
							db.hgetall('pad-' + pad + ':' + bloc, function (err, objet) {
								if (err) { socket.emit('erreur'); return false }
								const identifiant = socket.identifiant
								const nom = socket.nom
								if (objet.identifiant === identifiant || proprietaire === identifiant) {
									const date = moment().format()
									db.hmset('pad-' + pad + ':' + bloc, 'titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'modifie', date)
									io.in(socket.room).emit('modifierbloc', { bloc: bloc, titre: titre, texte: texte, media: media, iframe: iframe, type: type, source: source, vignette: vignette, identifiant: identifiant, nom: nom, modifie: date, couleur: couleur, colonne: colonne })
									enregistrerActivite(pad, { bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-modifie' })
									socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
									socket.handshake.session.save()
								}
							})
						}
					})
				}
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('deplacerbloc', function (items, colonnes, pad, affichage) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			const donneesBlocs = []
			for (let i = 0; i < items.length; i++) {
				const donneeBloc = new Promise(function (resolve) {
					const multi = db.multi()
					multi.zrem('blocs:' + pad, items[i].bloc)
					multi.zadd('blocs:' + pad, (i + 1), items[i].bloc)
					if (affichage === 'colonnes') {
						multi.hmset('pad-' + pad + ':' + items[i].bloc, 'colonne', items[i].colonne)
					}
					multi.exec(function (err) {
						if (err) { resolve() }
						resolve(i)
					})
				})
				donneesBlocs.push(donneeBloc)
			}
			Promise.all(donneesBlocs).then(function () {
				const identifiant = socket.identifiant
				socket.to(socket.room).emit('deplacerbloc', { blocs: items, colonnes: colonnes, identifiant: identifiant })
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('supprimerbloc', function (bloc, pad, token, titre, couleur, colonne) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hgetall('pads:' + pad, function (err, donnees) {
				if (err) { socket.emit('erreur'); return false }
				if (donnees.id === pad && donnees.token === token) {
					const proprietaire = donnees.identifiant
					db.exists('pad-' + pad + ':' + bloc, function (err, resultat) {
						if (err) { socket.emit('erreur'); return false }
						if (resultat === 1) {
							db.hgetall('pad-' + pad + ':' + bloc, function (err, objet) {
								if (err) { socket.emit('erreur'); return false }
								if (objet.media !== '') {
									supprimerFichier(pad, objet.media)
								}
								if (objet.vignette !== '' && objet.vignette.substring(1, 9) === 'fichiers') {
									supprimerVignette(objet.vignette)
								}
								const etherpad = process.env.ETHERPAD
								const etherpadApi = process.env.ETHERPAD_API_KEY
								let etherpadId, url
								if (objet.iframe !== '' && objet.iframe.includes(etherpad)) {
									etherpadId = objet.iframe.replace(etherpad + '/p/', '')
									url = etherpad + '/api/1/deletePad?apikey=' + etherpadApi + '&padID=' + etherpadId
									axios.get(url)
								}
								if (objet.media !== '' && objet.media.includes(etherpad)) {
									etherpadId = objet.media.replace(etherpad + '/p/', '')
									url = etherpad + '/api/1/deletePad?apikey=' + etherpadApi + '&padID=' + etherpadId
									axios.get(url)
								}
								const identifiant = socket.identifiant
								const nom = socket.nom
								if (objet.bloc === bloc && (objet.identifiant === identifiant || proprietaire === identifiant)) {
									const multi = db.multi()
									multi.del('pad-' + pad + ':' + bloc)
									multi.zrem('blocs:' + pad, bloc)
									multi.del('commentaires:' + bloc)
									multi.del('evaluations:' + bloc)
									multi.exec(function () {
										const date = moment().format()
										io.in(socket.room).emit('supprimerbloc', { bloc: bloc, identifiant: identifiant, nom: nom, titre: titre, date: date, couleur: couleur, colonne: colonne })
										enregistrerActivite(pad, { bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-supprime' })
										socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
										socket.handshake.session.save()
									})
								}
							})
						}
					})
				}
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('commenterbloc', function (bloc, pad, titre, texte, couleur) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hgetall('pad-' + pad + ':' + bloc, function (err, donnees) {
				const identifiant = socket.identifiant
				const nom = socket.nom
				const date = moment().format()
				const id = parseInt(donnees.commentaires) + 1
				const multi = db.multi()
				const commentaire = { id: id, identifiant: identifiant, date: date, texte: texte }
				multi.hincrby('pad-' + pad + ':' + bloc, 'commentaires', 1)
				multi.zadd('commentaires:' + bloc, id, JSON.stringify(commentaire))
				multi.exec(function () {
					db.zcard('commentaires:' + bloc, function (err, commentaires) {
						if (err) { socket.emit('erreur'); return false }
						io.in(socket.room).emit('commenterbloc', { id: id, bloc: bloc, identifiant: identifiant, nom: nom, texte: texte, titre: titre, date: date, couleur: couleur, commentaires: commentaires })
						enregistrerActivite(pad, { bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-commente' })
						socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
						socket.handshake.session.save()
					})
				})
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifiercommentaire', function (bloc, id, texte) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.zrangebyscore('commentaires:' + bloc, id, id, function (err, donnees) {
				if (err) { socket.emit('erreur'); return false }
				const dateModification = moment().format()
				const identifiant = socket.identifiant
				const date = JSON.parse(donnees).date
				const commentaire = { id: id, identifiant: identifiant, date: date, modifie: dateModification, texte: texte }
				const multi = db.multi()
				multi.zremrangebyscore('commentaires:' + bloc, id, id)
				multi.zadd('commentaires:' + bloc, id, JSON.stringify(commentaire))
				multi.exec(function () {
					io.in(socket.room).emit('modifiercommentaire', { id: id, texte: texte })
					socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
					socket.handshake.session.save()
				})
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('supprimercommentaire', function (bloc, id) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.zremrangebyscore('commentaires:' + bloc, id, id)
			db.zcard('commentaires:' + bloc, function (err, commentaires) {
				if (err) { socket.emit('erreur'); return false }
				io.in(socket.room).emit('supprimercommentaire', { id: id, bloc: bloc, commentaires: commentaires })
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('commentaires', function (bloc, type) {
		const donneesCommentaires = []
		db.zrange('commentaires:' + bloc, 0, -1, function (err, commentaires) {
			if (err) { socket.emit('erreur'); return false }
			for (let commentaire of commentaires) {
				commentaire = JSON.parse(commentaire)
				const donneeCommentaire = new Promise(function (resolve) {
					const identifiant = commentaire.identifiant
					db.exists('utilisateurs:' + identifiant, function (err, resultat) {
						if (err) { resolve() }
						if (resultat === 1) {
							db.hgetall('utilisateurs:' + identifiant, function (err, utilisateur) {
								if (err) { resolve() }
								commentaire.nom = utilisateur.nom
								resolve(commentaire)
							})
						} else {
							db.hget('noms:' + identifiant, 'nom', function (err, nom) {
								if (err) { resolve() }
								commentaire.nom = nom
								resolve(commentaire)
							})
						}
					})
				})
				donneesCommentaires.push(donneeCommentaire)
			}
			Promise.all(donneesCommentaires).then(function (resultat) {
				socket.emit('commentaires', { commentaires: resultat.reverse(), type: type })
			})
		})
	})

	socket.on('evaluerbloc', function (bloc, pad, titre, etoiles, couleur) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hgetall('pad-' + pad + ':' + bloc, function (err, donnees) {
				if (err) { socket.emit('erreur'); return false }
				const identifiant = socket.identifiant
				const nom = socket.nom
				const date = moment().format()
				const id = parseInt(donnees.evaluations) + 1
				const multi = db.multi()
				const evaluation = { id: id, identifiant: identifiant, date: date, etoiles: etoiles }
				multi.hincrby('pad-' + pad + ':' + bloc, 'evaluations', 1)
				multi.zadd('evaluations:' + bloc, id, JSON.stringify(evaluation))
				multi.exec(function () {
					io.in(socket.room).emit('evaluerbloc', { id: id, bloc: bloc, identifiant: identifiant, nom: nom, titre: titre, date: date, couleur: couleur, evaluation: evaluation })
					enregistrerActivite(pad, { bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-evalue' })
					socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
					socket.handshake.session.save()
				})
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifierevaluation', function (bloc, id, etoiles) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.zrangebyscore('evaluations:' + bloc, id, id, function (err) {
				if (err) { socket.emit('erreur'); return false }
				const date = moment().format()
				const identifiant = socket.identifiant
				const evaluation = { id: id, identifiant: identifiant, date: date, etoiles: etoiles }
				const multi = db.multi()
				multi.zremrangebyscore('evaluations:' + bloc, id, id)
				multi.zadd('evaluations:' + bloc, id, JSON.stringify(evaluation))
				multi.exec(function () {
					io.in(socket.room).emit('modifierevaluation', { id: id, bloc: bloc, date: date, etoiles: etoiles })
					socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
					socket.handshake.session.save()
				})
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('supprimerevaluation', function (bloc, id) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.zremrangebyscore('evaluations:' + bloc, id, id, function (err) {
				if (err) { socket.emit('erreur'); return false }
				io.in(socket.room).emit('supprimerevaluation', { id: id, bloc: bloc })
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifiernom', function (nom, statut) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			const identifiant = socket.identifiant
			if (statut === 'invite') {
				db.hmset('noms:' + identifiant, 'nom', nom, function (err) {
					if (err) { socket.emit('erreur'); return false }
					io.in(socket.room).emit('modifiernom', { identifiant: identifiant, nom: nom })
					socket.nom = nom
					socket.handshake.session.nom = nom
					socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
					socket.handshake.session.save()
				})
			} else if (statut === 'auteur') {
				db.hmset('utilisateurs:' + identifiant, 'nom', nom, function (err) {
					if (err) { socket.emit('erreur'); return false }
					io.in(socket.room).emit('modifiernom', { identifiant: identifiant, nom: nom })
					socket.nom = nom
					socket.handshake.session.nom = nom
					socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
					socket.handshake.session.save()
				})
			}
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifiercouleur', function (pad, couleur) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			const identifiant = socket.identifiant
			db.hmset('couleurs:' + identifiant, 'pad' + pad, couleur, function (err) {
				if (err) { socket.emit('erreur'); return false }
				io.in(socket.room).emit('modifiercouleur', { identifiant: identifiant, couleur: couleur })
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifiertitre', function (pad, titre) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hmset('pads:' + pad, 'titre', titre, function (err) {
				if (err) { socket.emit('erreur'); return false }
				io.in(socket.room).emit('modifiertitre', titre)
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifieracces', function (pad, acces) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hgetall('pads:' + pad, function (err, donnees) {
				if (err) { socket.emit('erreur'); return false }
				let code = ''
				if (donnees.code && donnees.code !== '') {
					code = donnees.code
				} else {
					code = Math.floor(1000 + Math.random() * 9000)
				}
				db.hmset('pads:' + pad, 'acces', acces, 'code', code, function (err) {
					if (err) { socket.emit('erreur'); return false }
					io.in(socket.room).emit('modifieracces', { acces: acces, code: code })
					socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
					socket.handshake.session.save()
				})
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifiercontributions', function (pad, contributions) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hmset('pads:' + pad, 'contributions', contributions, function (err) {
				if (err) { socket.emit('erreur'); return false }
				io.in(socket.room).emit('modifiercontributions', contributions)
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifieraffichage', function (pad, affichage) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hmset('pads:' + pad, 'affichage', affichage, function (err) {
				if (err) { socket.emit('erreur'); return false }
				io.in(socket.room).emit('modifieraffichage', affichage)
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifierfond', function (pad, fond, ancienfond) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hmset('pads:' + pad, 'fond', fond, function (err) {
				if (err) { socket.emit('erreur'); return false }
				io.in(socket.room).emit('modifierfond', fond)
				if (ancienfond.substring(1, 9) === 'fichiers') {
					const chemin = path.join(__dirname, '..', '/static' + ancienfond)
					fs.removeSync(chemin)
				}
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifieractivite', function (pad, statut) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hmset('pads:' + pad, 'registreActivite', statut, function () {
				io.in(socket.room).emit('modifieractivite', statut)
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifierconversation', function (pad, statut) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hmset('pads:' + pad, 'conversation', statut, function () {
				io.in(socket.room).emit('modifierconversation', statut)
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifierfichiers', function (pad, statut) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hmset('pads:' + pad, 'fichiers', statut, function () {
				io.in(socket.room).emit('modifierfichiers', statut)
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifierliens', function (pad, statut) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hmset('pads:' + pad, 'liens', statut, function () {
				io.in(socket.room).emit('modifierliens', statut)
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifierdocuments', function (pad, statut) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hmset('pads:' + pad, 'documents', statut, function () {
				io.in(socket.room).emit('modifierdocuments', statut)
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifiercommentaires', function (pad, statut) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hmset('pads:' + pad, 'commentaires', statut, function () {
				io.in(socket.room).emit('modifiercommentaires', statut)
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifierevaluations', function (pad, statut) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hmset('pads:' + pad, 'evaluations', statut, function () {
				io.in(socket.room).emit('modifierevaluations', statut)
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('message', function (texte) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			const identifiant = socket.identifiant
			const nom = socket.nom
			const date = moment().format()
			io.in(socket.room).emit('message', { texte: texte, identifiant: identifiant, nom: nom, date: date })
			socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
			socket.handshake.session.save()
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('reinitialisermessages', function () {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			io.in(socket.room).emit('reinitialisermessages')
			socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
			socket.handshake.session.save()
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('reinitialiseractivite', function (pad) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.del('activite:' + pad, function () {
				io.in(socket.room).emit('reinitialiseractivite')
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('ajoutercolonne', function (pad, titre, colonnes, couleur) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			const identifiant = socket.identifiant
			const nom = socket.nom
			const date = moment().format()
			db.hmset('pads:' + pad, 'colonnes', JSON.stringify(colonnes), function () {
				io.in(socket.room).emit('ajoutercolonne', { identifiant: identifiant, nom: nom, titre: titre, colonnes: colonnes, date: date, couleur: couleur })
				enregistrerActivite(pad, { identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'colonne-ajoutee' })
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('modifiercolonne', function (pad, colonnes) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hmset('pads:' + pad, 'colonnes', JSON.stringify(colonnes), function () {
				io.in(socket.room).emit('modifiercolonne', colonnes)
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('supprimercolonne', function (pad, titre, colonne, colonnes, blocsSupprimes, items, couleur) {
		if (socket.identifiant !== '' && socket.identifiant !== undefined) {
			db.hmset('pads:' + pad, 'colonnes', JSON.stringify(colonnes), function () {
				const donneesBlocsSupprimes = []
				for (const blocSupprime of blocsSupprimes) {
					const donneesBlocSupprime = new Promise(function (resolve) {
						db.exists('pad-' + pad + ':' + blocSupprime, function (err, resultat) {
							if (err) { resolve() }
							if (resultat === 1) {
								db.hgetall('pad-' + pad + ':' + blocSupprime, function (err, objet) {
									if (err) { resolve() }
									if (objet.media !== '') {
										supprimerFichier(pad, objet.media)
									}
									if (objet.bloc === blocSupprime) {
										const multi = db.multi()
										multi.del('pad-' + pad + ':' + blocSupprime)
										multi.zrem('blocs:' + pad, blocSupprime)
										multi.del('commentaires:' + blocSupprime)
										multi.del('evaluations:' + blocSupprime)
										multi.exec(function (err) {
											if (err) { resolve() }
											resolve('supprime')
										})
									} else {
										resolve()
									}
								})
							}
						})
					})
					donneesBlocsSupprimes.push(donneesBlocSupprime)
				}
				const donneesBlocs = []
				for (let i = 0; i < items.length; i++) {
					const donneeBloc = new Promise(function (resolve) {
						db.hmset('pad-' + pad + ':' + items[i].bloc, 'colonne', items[i].colonne, function (err) {
							if (err) { resolve() }
							resolve(i)
						})
					})
					donneesBlocs.push(donneeBloc)
				}
				Promise.all([donneesBlocsSupprimes, donneesBlocs]).then(function () {
					const identifiant = socket.identifiant
					const nom = socket.nom
					const date = moment().format()
					io.in(socket.room).emit('supprimercolonne', { identifiant: identifiant, nom: nom, titre: titre, colonne: colonne, colonnes: colonnes, blocs: items, date: date, couleur: couleur })
					enregistrerActivite(pad, { identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'colonne-supprimee' })
					socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
					socket.handshake.session.save()
				})
			})
		} else {
			socket.emit('deconnecte')
		}
	})

	socket.on('debloquerpad', function (pad, identifiant) {
		db.hgetall('utilisateurs:' + identifiant, function (err, utilisateur) {
			if (err) { socket.emit('erreur'); return false }
			db.hget('couleurs:' + identifiant, 'pad' + pad, function (err, couleur) {
				if (err) { socket.emit('erreur'); return false }
				socket.identifiant = identifiant
				socket.handshake.session.identifiant = identifiant
				socket.nom = utilisateur.nom
				socket.handshake.session.nom = utilisateur.nom
				socket.handshake.session.statut = 'auteur'
				socket.handshake.session.langue = utilisateur.langue
				socket.handshake.session.cookie.expires = new Date(Date.now() + (3600 * 24 * 7 * 1000))
				socket.handshake.session.save()
				socket.emit('debloquerpad', { identifiant: identifiant, nom: utilisateur.nom, langue: utilisateur.langue, couleur: couleur })
			})
		})
	})

	socket.on('supprimerfichier', function (donnees) {
		supprimerFichier(donnees.pad, donnees.fichier)
		if (donnees.vignette && donnees.vignette.substring(1, 9) === 'fichiers') {
			supprimerVignette(donnees.vignette)
		}
	})

	socket.on('supprimerfichiers', function (donnees) {
		for (let i = 0; i < donnees.fichiers.length; i++) {
			supprimerFichier(donnees.pad, donnees.fichiers[i])
		}
	})

	socket.on('supprimervignettes', function (vignettes) {
		for (let i = 0; i < vignettes.length; i++) {
			if (vignettes[i].substring(1, 9) === 'fichiers') {
				supprimerVignette(vignettes[i])
			}
		}
	})

	socket.on('supprimervignette', function (vignette) {
		if (vignette.substring(1, 9) === 'fichiers') {
			supprimerVignette(vignette)
		}
	})
})

function recupererDonnees (identifiant) {
	// Pads créés
	const donneesPadsCrees = new Promise(function (resolveMain) {
		db.smembers('pads-crees:' + identifiant, function (err, pads) {
			const donneesPads = []
			if (err) { resolveMain(donneesPads) }
			for (const pad of pads) {
				const donneePad = new Promise(function (resolve) {
					db.hgetall('pads:' + pad, function (err, donnees) {
						if (err) { resolve() }
						db.hgetall('utilisateurs:' + donnees.identifiant, function (err, utilisateur) {
							if (err) { resolve() }
							if (utilisateur.nom === '') {
								donnees.nom = donnees.identifiant
							} else {
								donnees.nom = utilisateur.nom
							}
							resolve(donnees)
						})
					})
				})
				donneesPads.push(donneePad)
			}
			Promise.all(donneesPads).then(function (resultat) {
				resolveMain(resultat)
			})
		})
	})
	// Pads rejoints
	const donneesPadsRejoints = new Promise(function (resolveMain) {
		db.smembers('pads-rejoints:' + identifiant, function (err, pads) {
			const donneesPads = []
			if (err) { resolveMain(donneesPads) }
			for (const pad of pads) {
				const donneePad = new Promise(function (resolve) {
					db.hgetall('pads:' + pad, function (err, donnees) {
						if (err) { resolve() }
						db.hgetall('utilisateurs:' + donnees.identifiant, function (err, utilisateur) {
							if (err) { resolve() }
							if (utilisateur.nom === '') {
								donnees.nom = donnees.identifiant
							} else {
								donnees.nom = utilisateur.nom
							}
							resolve(donnees)
						})
					})
				})
				donneesPads.push(donneePad)
			}
			Promise.all(donneesPads).then(function (resultat) {
				resolveMain(resultat)
			})
		})
	})
	return Promise.all([donneesPadsCrees, donneesPadsRejoints])
}

function enregistrerActivite (pad, donnees) {
	db.hgetall('pads:' + pad, function (err, resultat) {
		if (err) { return false }
		const id = parseInt(resultat.activite) + 1
		donnees.id = id
		const multi = db.multi()
		multi.hincrby('pads:' + pad, 'activite', 1)
		multi.zadd('activite:' + pad, id, JSON.stringify(donnees))
		multi.exec()
	})
}

function choisirCouleur () {
	const couleurs = ['#fdcc33', '#048eca', '#00a885', '#f39c12', '#9b59b6', '#4a69bd', '#7f8fa6', '#e32f6c', '#6e6363', '#f8a5c2', '#ff5e57', '#4b6584', '#79b95e', '#25b3c2', '#be9d6b']
	const couleur = couleurs[Math.floor(Math.random() * couleurs.length)]
	return couleur
}

function choisirNom () {
	const noms = ['Chimpanzé', 'Hippopotame', 'Gnou', 'Yack', 'Aigle', 'Éléphant', 'Crocodile', 'Papillon', 'Humanoïde', 'Buffle', 'Hibou', 'Pingouin', 'Phoque', 'Pinson', 'Rhinocéros', 'Zèbre']
	const nom = noms[Math.floor(Math.random() * noms.length)]
	return nom
}

function choisirAdjectif () {
	const adjectifs = ['hilare', 'extraordinaire', 'fantastique', 'pétillant', 'magnifique', 'fabuleux', 'joyeux', 'sympathique', 'courageux', 'créatif', 'astucieux', 'vaillant', 'sage']
	const adjectif = adjectifs[Math.floor(Math.random() * adjectifs.length)]
	return adjectif
}

const televerser = multer({
	storage: multer.diskStorage({
		destination: function (req, fichier, callback) {
			const pad = req.body.pad
			const chemin = path.join(__dirname, '..', '/static/fichiers/' + pad + '/')
			callback(null, chemin)
		},
		filename: function (req, fichier, callback) {
			const info = path.parse(fichier.originalname)
			const extension = info.ext.toLowerCase()
			let nom = v.latinise(info.name.toLowerCase())
			nom = v.replaceAll(nom, ' ', '-')
			nom = v.replaceAll(nom, '\'', '')
			nom = v.replaceAll(nom, '#', '')
			nom = v.replaceAll(nom, '.', '') + '_' + Math.random().toString(36).substring(2) + extension
			callback(null, nom)
		}
	})
}).single('fichier')

function supprimerFichier (pad, fichier) {
	const chemin = path.join(__dirname, '..', '/static/fichiers/' + pad + '/' + fichier)
	fs.removeSync(chemin)
}

function supprimerVignette (vignette) {
	const chemin = path.join(__dirname, '..', '/static' + vignette)
	fs.removeSync(chemin)
}
