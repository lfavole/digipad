import 'dotenv/config'
import path from 'path'
import fs from 'fs-extra'
import onHeaders from 'on-headers'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import compression from 'compression'
import axios from 'axios'
import cors from 'cors'
import redis from 'redis'
import bodyParser from 'body-parser'
import helmet from 'helmet'
import v from 'voca'
import multer from 'multer'
import sharp from 'sharp'
import gm from 'gm'
import archiver from 'archiver'
import extract from 'extract-zip'
import dayjs from 'dayjs'
import 'dayjs/locale/es.js'
import 'dayjs/locale/fr.js'
import 'dayjs/locale/de.js'
import 'dayjs/locale/hr.js'
import 'dayjs/locale/it.js'
import localizedFormat from 'dayjs/plugin/localizedFormat.js'
import bcrypt from 'bcrypt'
import cron from 'node-cron'
import nodemailer from 'nodemailer'
import { URL, fileURLToPath } from 'url'
import * as cheerio from 'cheerio'
import libre from 'libreoffice-convert'
import util from 'util'
libre.convertAsync = util.promisify(libre.convert)
import connectRedis from 'connect-redis'
import session from 'express-session'
import events from 'events'
import base64 from 'base-64'
import checkDiskSpace from 'check-disk-space'
import { renderPage } from 'vike/server'

const production = process.env.NODE_ENV === 'production'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = `${__dirname}/..`

demarrerServeur()

async function demarrerServeur () {
	const app = express()
	app.use(compression())
	const httpServer = createServer(app)
	const RedisStore = connectRedis(session)

	let hote = 'http://localhost:3000'
	if (process.env.PORT) {
		hote = 'http://localhost:' + process.env.PORT
	}
	if (production) {
		hote = process.env.DOMAIN
	}
	let db
	let db_port = 6379
	if (process.env.DB_PORT) {
		db_port = process.env.DB_PORT
	}
	if (production) {
		db = redis.createClient({ host: process.env.DB_HOST, port: db_port, password: process.env.DB_PWD })
	} else {
		db = redis.createClient({ port: db_port })
	}
	let storeOptions, cookie, dureeSession, dateCron, domainesAutorises, minimumEspaceDisque
	let maintenance = false
	if (production) {
		storeOptions = {
			host: process.env.DB_HOST,
			port: db_port,
			pass: process.env.DB_PWD,
			client: db,
			prefix: 'sessions:'
		}
		cookie = {
			sameSite: 'None',
			secure: true
		}
	} else {
		storeOptions = {
			host: 'localhost',
			port: db_port,
			client: db,
			prefix: 'sessions:'
		}
		cookie = {
			secure: false
		}
	}
	const sessionOptions = {
		secret: process.env.SESSION_KEY,
		store: new RedisStore(storeOptions),
		name: 'digipad',
		resave: false,
		rolling: true,
		saveUninitialized: false,
		cookie: cookie
	}
	if (process.env.SESSION_DURATION) {
		dureeSession = parseInt(process.env.SESSION_DURATION)
	} else {
		dureeSession = 864000000 //3600 * 24 * 10 * 1000
	}
	const sessionMiddleware = session(sessionOptions)

	if (production && process.env.AUTHORIZED_DOMAINS) {
		domainesAutorises = process.env.AUTHORIZED_DOMAINS.split(',')
	} else {
		domainesAutorises = '*'
	}

	const transporter = nodemailer.createTransport({
		host: process.env.EMAIL_HOST,
		port: process.env.EMAIL_PORT,
		secure: process.env.EMAIL_SECURE,
		auth: {
			user: process.env.EMAIL_ADDRESS,
			pass: process.env.EMAIL_PASSWORD
		}
	})

	if (process.env.CRON_TASK_DATE) {
		dateCron = process.env.CRON_TASK_DATE
	} else {
		dateCron = '59 23 * * Saturday' // tous les samedis à 23h59
	}
	cron.schedule(dateCron, async function () {
		await fs.emptyDir(path.join(__dirname, '..', '/static/temp'))
	})

	minimumEspaceDisque = 10
	if (process.env.ALERT_AVAILABLE_SPACE) {
		minimumEspaceDisque = process.env.ALERT_AVAILABLE_SPACE
	}

	// Charger plugin dayjs
	dayjs.extend(localizedFormat)

	const etherpad = process.env.VITE_ETHERPAD
	const etherpadApi = process.env.VITE_ETHERPAD_API_KEY

	// Augmenter nombre de tâches asynchrones par défaut
	events.EventEmitter.defaultMaxListeners = 50

	app.set('trust proxy', true)
	app.use(
		helmet.contentSecurityPolicy({
			directives: {
				"default-src": ["'self'", "https:", "ws:"],
				"script-src": ["'self'", process.env.VITE_MATOMO, "'unsafe-inline'", "'unsafe-eval'"],
				"media-src": ["'self'", "data:", "blob:"],
				"img-src": ["'self'", "https:", "data:"],
				"frame-ancestors": ["*"],
				"frame-src": ["*", "blob:"]
			}
		})
	)
	app.use(function (req, res, next) {
		onHeaders(res, function () {
			res.removeHeader('Accept-Ranges')
		})
		next()
	})
	app.use(bodyParser.json({ limit: '200mb' }))
	app.use(sessionMiddleware)
	app.use(cors({ 'origin': domainesAutorises }))
	app.use('/fichiers', express.static('static/fichiers'))
	app.use('/pdfjs', express.static('static/pdfjs'))
	app.use('/temp', express.static('static/temp'))
	if (process.env.VITE_NFS_FOLDER && process.env.VITE_NFS_FOLDER !== '') {
		app.use('/' + process.env.VITE_NFS_FOLDER, express.static('static/' + process.env.VITE_NFS_FOLDER))
	}
	if (process.env.VITE_NFS2_FOLDER && process.env.VITE_NFS2_FOLDER !== '') {
		app.use('/' + process.env.VITE_NFS2_FOLDER, express.static('static/' + process.env.VITE_NFS2_FOLDER))
	}
	if (process.env.VITE_NFS3_FOLDER && process.env.VITE_NFS3_FOLDER !== '') {
		app.use('/' + process.env.VITE_NFS3_FOLDER, express.static('static/' + process.env.VITE_NFS3_FOLDER))
	}
	if (process.env.VITE_NFS4_FOLDER && process.env.VITE_NFS4_FOLDER !== '') {
		app.use('/' + process.env.VITE_NFS4_FOLDER, express.static('static/' + process.env.VITE_NFS4_FOLDER))
	}
	if (process.env.VITE_NFS5_FOLDER && process.env.VITE_NFS5_FOLDER !== '') {
		app.use('/' + process.env.VITE_NFS5_FOLDER, express.static('static/' + process.env.VITE_NFS5_FOLDER))
	}
	if (process.env.VITE_NFS6_FOLDER && process.env.VITE_NFS6_FOLDER !== '') {
		app.use('/' + process.env.VITE_NFS6_FOLDER, express.static('static/' + process.env.VITE_NFS6_FOLDER))
	}

	if (production) {
		const sirv = (await import('sirv')).default
		app.use(sirv(`${root}/dist/client`))
	} else {
		const vite = await import('vite')
    	const viteDevMiddleware = (
      		await vite.createServer({
        		root,
        		server: { middlewareMode: true }
			})
    	).middlewares
    	app.use(viteDevMiddleware)
  	}

	app.get('/', async function (req, res, next) {
		if (maintenance === true) {
			res.redirect('/maintenance')
		} else if (req.session.identifiant && req.session.statut === 'utilisateur') {
			res.redirect('/u/' + req.session.identifiant)
		} else {
			let langue = 'fr'
			if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
				langue = req.session.langue
			}
			const pageContextInit = {
				urlOriginal: req.originalUrl,
				params: req.query,
				hote: hote,
				langues: ['fr', 'es', 'it', 'de', 'hr', 'en'],
				langue: langue
			}
			const pageContext = await renderPage(pageContextInit)
			const { httpResponse } = pageContext
			if (!httpResponse) {
				return next()
			}
			const { body, statusCode, headers, earlyHints } = httpResponse
			if (res.writeEarlyHints) {
				res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) })
			}
			if (headers) {
				headers.forEach(([name, value]) => res.setHeader(name, value))
			}
			res.status(statusCode).send(body)
		}
  	})

	app.get('/u/:utilisateur', async function (req, res, next) {
		const identifiant = req.params.utilisateur
		if (maintenance === true) {
			res.redirect('/maintenance')
		} else if (identifiant === req.session.identifiant && req.session.statut === 'utilisateur') {
			recupererDonneesUtilisateur(identifiant).then(function (pads) {
				let padsCrees = pads[0].filter(function (element) {
					return element !== '' && Object.keys(element).length > 0
				})
				let padsRejoints = pads[1].filter(function (element) {
					return element !== '' && Object.keys(element).length > 0
				})
				let padsAdmins = pads[2].filter(function (element) {
					return element !== '' && Object.keys(element).length > 0
				})
				let padsFavoris = pads[3].filter(function (element) {
					return element !== '' && Object.keys(element).length > 0
				})
				// Vérification des données des pads
				padsCrees.forEach(function (pad, indexPad) {
					if (!pad.hasOwnProperty('id') || !pad.hasOwnProperty('token') || !pad.hasOwnProperty('identifiant') || !pad.hasOwnProperty('titre') || !pad.hasOwnProperty('fond') || !pad.hasOwnProperty('date')) {
						padsCrees.splice(indexPad, 1)
					} else {
						padsCrees[indexPad].id = parseInt(pad.id)
					}
				})
				padsRejoints.forEach(function (pad, indexPad) {
					if (!pad.hasOwnProperty('id') || !pad.hasOwnProperty('token') || !pad.hasOwnProperty('identifiant') || !pad.hasOwnProperty('titre') || !pad.hasOwnProperty('fond') || !pad.hasOwnProperty('date')) {
						padsRejoints.splice(indexPad, 1)
					} else {
						padsRejoints[indexPad].id = parseInt(pad.id)
					}
				})
				padsAdmins.forEach(function (pad, indexPad) {
					if (!pad.hasOwnProperty('id') || !pad.hasOwnProperty('token') || !pad.hasOwnProperty('identifiant') || !pad.hasOwnProperty('titre') || !pad.hasOwnProperty('fond') || !pad.hasOwnProperty('date')) {
						padsAdmins.splice(indexPad, 1)
					} else {
						padsAdmins[indexPad].id = parseInt(pad.id)
					}
				})
				padsFavoris.forEach(function (pad, indexPad) {
					if (!pad.hasOwnProperty('id') || !pad.hasOwnProperty('token') || !pad.hasOwnProperty('identifiant') || !pad.hasOwnProperty('titre') || !pad.hasOwnProperty('fond') || !pad.hasOwnProperty('date')) {
						padsFavoris.splice(indexPad, 1)
					} else {
						padsFavoris[indexPad].id = parseInt(pad.id)
					}
				})
				// Suppresion redondances pads rejoints et pads administrés
				padsRejoints.forEach(function (pad, indexPad) {
					padsAdmins.forEach(function (padAdmin) {
						if (pad.id === padAdmin.id) {
							padsRejoints.splice(indexPad, 1)
						}
					})
				})
				// Supprimer doublons
				padsCrees = padsCrees.filter((valeur, index, self) =>
					index === self.findIndex((t) => (
						t.id === valeur.id && t.token === valeur.token
					))
				)
				padsRejoints = padsRejoints.filter((valeur, index, self) =>
					index === self.findIndex((t) => (
						t.id === valeur.id && t.token === valeur.token
					))
				)
				padsAdmins = padsAdmins.filter((valeur, index, self) =>
					index === self.findIndex((t) => (
						t.id === valeur.id && t.token === valeur.token
					))
				)
				padsFavoris = padsFavoris.filter((valeur, index, self) =>
					index === self.findIndex((t) => (
						t.id === valeur.id && t.token === valeur.token
					))
				)
				// Récupération et vérification des dossiers utilisateur
				db.hgetall('utilisateurs:' + identifiant, async function (err, donnees) {
					if (err || !donnees || donnees === null) {
						const pageContextInit = {
							urlOriginal: req.originalUrl,
							params: req.query,
							hote: hote,
							langues: ['fr', 'es', 'it', 'de', 'hr', 'en'],
							identifiant: req.session.identifiant,
							nom: req.session.nom,
							email: req.session.email,
							langue: req.session.langue,
							statut: req.session.statut,
							affichage: 'liste',
							classement: 'date-asc',
							padsCrees: padsCrees,
							padsRejoints: padsRejoints,
							padsAdmins: padsAdmins,
							padsFavoris: padsFavoris,
							dossiers: []
						}
						const pageContext = await renderPage(pageContextInit)
						const { httpResponse } = pageContext
						if (!httpResponse) {
							return next()
						}
						const { body, statusCode, headers, earlyHints } = httpResponse
						if (res.writeEarlyHints) {
							res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) })
						}
						if (headers) {
							headers.forEach(([name, value]) => res.setHeader(name, value))
						}
						res.status(statusCode).send(body)
					} else {
						let dossiers = []
						if (donnees.hasOwnProperty('dossiers')) {
							try {
								dossiers = JSON.parse(donnees.dossiers)
							} catch (err) {
								dossiers = []
							}
						}
						const listePadsDossiers = []
						dossiers.forEach(function (dossier, indexDossier) {
							dossier.pads.forEach(function (pad, indexPad) {
								dossiers[indexDossier].pads[indexPad] = parseInt(pad)
								if (!listePadsDossiers.includes(parseInt(pad))) {
									listePadsDossiers.push(parseInt(pad))
								}
							})
						})
						const donneesPadsDossiers = []
						for (const pad of listePadsDossiers) {
							const donneePadsDossiers = new Promise(function (resolve) {
								db.exists('pads:' + pad, async function (err, resultat) {
									if (err) { resolve(); return false }
									if (resultat === 1) {
										resolve()
									} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
										resolve()
									} else {
										resolve(parseInt(pad))
									}
								})
							})
							donneesPadsDossiers.push(donneePadsDossiers)
						}
						Promise.all(donneesPadsDossiers).then(function (padsSupprimes) {
							padsSupprimes.forEach(function (padSupprime) {
								if (padSupprime !== '' || padSupprime !== null) {
									dossiers.forEach(function (dossier, indexDossier) {
										if (dossier.pads.includes(padSupprime)) {
											const indexPad = dossier.pads.indexOf(padSupprime)
											dossiers[indexDossier].pads.splice(indexPad, 1)
										}
									})
								}
							})
							// Supprimer doublons dans dossiers
							dossiers.forEach(function (dossier, indexDossier) {
								const pads = []
								dossier.pads.forEach(function (pad, indexPad) {
									if (!pads.includes(pad)) {
										pads.push(pad)
									} else {
										dossiers[indexDossier].pads.splice(indexPad, 1)
									}
								})
							})
							db.hset('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers), async function () {
								const pageContextInit = {
									urlOriginal: req.originalUrl,
									params: req.query,
									hote: hote,
									langues: ['fr', 'es', 'it', 'de', 'hr', 'en'],
									identifiant: req.session.identifiant,
									nom: req.session.nom,
									email: req.session.email,
									langue: req.session.langue,
									statut: req.session.statut,
									affichage: donnees.affichage,
									classement: donnees.classement,
									padsCrees: padsCrees,
									padsRejoints: padsRejoints,
									padsAdmins: padsAdmins,
									padsFavoris: padsFavoris,
									dossiers: dossiers
								}
								const pageContext = await renderPage(pageContextInit)
								const { httpResponse } = pageContext
								if (!httpResponse) {
									return next()
								}
								const { body, statusCode, headers, earlyHints } = httpResponse
								if (res.writeEarlyHints) {
									res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) })
								}
								if (headers) {
									headers.forEach(([name, value]) => res.setHeader(name, value))
								}
								res.status(statusCode).send(body)
							})
						})
					}
				})
			})
		} else {
			res.redirect('/')
		}
  	})

	app.get('/p/:id/:token', async function (req, res, next) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		const userAgent = req.headers['user-agent']
		if (req.query.id && req.query.id !== '' && req.query.mdp && req.query.mdp !== '') {
			const id = req.query.id
			const mdp = base64.decode(req.query.mdp)
			await verifierAcces(req, req.params.id, id, mdp)
		}
		if (!req.query.id && !req.query.mdp && (req.session.identifiant === '' || req.session.identifiant === undefined)) {
			const identifiant = 'u' + Math.random().toString(16).slice(3)
			req.session.identifiant = identifiant
			req.session.nom = identifiant.slice(0, 8).toUpperCase()
			req.session.email = ''
			req.session.langue = 'fr'
			req.session.statut = 'invite'
			req.session.acces = []
			req.session.pads = []
			req.session.digidrive = []
			req.session.cookie.expires = new Date(Date.now() + dureeSession)
		}
		if (!req.query.id && !req.query.mdp && !req.session.hasOwnProperty('acces')) {
			req.session.acces = []
		}
		if (!req.query.id && !req.query.mdp && !req.session.hasOwnProperty('pads')) {
			req.session.pads = []
		}
		if (!req.query.id && !req.query.mdp && !req.session.hasOwnProperty('digidrive')) {
			req.session.digidrive = []
		}
		const pageContextInit = {
			urlOriginal: req.originalUrl,
			params: req.query,
			hote: hote,
			userAgent: userAgent,
			langues: ['fr', 'es', 'it', 'de', 'hr', 'en'],
			identifiant: req.session.identifiant,
			nom: req.session.nom,
			email: req.session.email,
			langue: req.session.langue,
			statut: req.session.statut,
			pads: req.session.pads,
			digidrive: req.session.digidrive
		}
		const pageContext = await renderPage(pageContextInit)
		const { httpResponse } = pageContext
		if (!httpResponse) {
			return next()
		}
		const { body, statusCode, headers, earlyHints } = httpResponse
		if (res.writeEarlyHints) {
			res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) })
		}
		if (headers) {
			headers.forEach(([name, value]) => res.setHeader(name, value))
		}
		res.status(statusCode).send(body)
  	})

	app.get('/maintenance', async function (req, res, next) {
		if (maintenance === false) {
			res.redirect('/')
			return false
		}
		let langue = 'fr'
		if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
			langue = req.session.langue
		}
		const pageContextInit = {
			urlOriginal: req.originalUrl,
			langue: langue
		}
		const pageContext = await renderPage(pageContextInit)
		const { httpResponse } = pageContext
		if (!httpResponse) {
			return next()
		}
		const { body, statusCode, headers, earlyHints } = httpResponse
		if (res.writeEarlyHints) {
			res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) })
		}
		if (headers) {
			headers.forEach(([name, value]) => res.setHeader(name, value))
		}
		res.status(statusCode).send(body)
  	})
	
	app.get('/admin', async function (req, res, next) {
		let langue = 'fr'
		if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
			langue = req.session.langue
		}
		const pageContextInit = {
			urlOriginal: req.originalUrl,
			hote: hote,
			langue: langue
		}
		const pageContext = await renderPage(pageContextInit)
		const { httpResponse } = pageContext
		if (!httpResponse) {
			return next()
		}
		const { body, statusCode, headers, earlyHints } = httpResponse
		if (res.writeEarlyHints) {
			res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) })
		}
		if (headers) {
			headers.forEach(([name, value]) => res.setHeader(name, value))
		}
		res.status(statusCode).send(body)
  	})

	app.post('/api/inscription', function (req, res) {
		const identifiant = req.body.identifiant
		const motdepasse = req.body.motdepasse
		const email = req.body.email
		db.exists('utilisateurs:' + identifiant, async function (err, reponse) {
			if (err) { res.send('erreur'); return false  }
			if (reponse === 0) {
				const hash = await bcrypt.hash(motdepasse, 10)
				const date = dayjs().format()
				let langue = 'fr'
				if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
					langue = req.session.langue
				}
				const multi = db.multi()
				multi.hmset('utilisateurs:' + identifiant, 'id', identifiant, 'motdepasse', hash, 'date', date, 'nom', '', 'email', email, 'langue', langue, 'affichage', 'liste', 'classement', 'date-asc')
				multi.exec(function () {
					req.session.identifiant = identifiant
					req.session.nom = ''
					req.session.email = email
					req.session.langue = langue
					req.session.statut = 'utilisateur'
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					res.json({ identifiant: identifiant })
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
			if (err) { res.send('erreur_connexion'); return false }
			if (reponse === 1) {
				db.hgetall('utilisateurs:' + identifiant, async function (err, donnees) {
					if (err) { res.send('erreur_connexion'); return false }
					let comparaison = false
					if (motdepasse.trim() !== '' && donnees.hasOwnProperty('motdepasse') && donnees.motdepasse.trim() !== '') {
						comparaison = await bcrypt.compare(motdepasse, donnees.motdepasse)
					}
					let comparaisonTemp = false
					if (donnees.hasOwnProperty('motdepassetemp') && donnees.motdepassetemp.trim() !== '' && motdepasse.trim() !== '') {
						comparaisonTemp = await bcrypt.compare(motdepasse, donnees.motdepassetemp)
					}
					if (comparaison === true || comparaisonTemp === true) {
						if (comparaisonTemp === true) {
							const hash = await bcrypt.hash(motdepasse, 10)
							db.hset('utilisateurs:' + identifiant, 'motdepasse', hash)
							db.hdel('utilisateurs:' + identifiant, 'motdepassetemp')
						}
						const nom = donnees.nom
						const langue = donnees.langue
						req.session.identifiant = identifiant
						req.session.nom = nom
						req.session.langue = langue
						req.session.statut = 'utilisateur'
						let email = ''
						if (donnees.hasOwnProperty('email')) {
							email = donnees.email
						}
						req.session.email = email
						req.session.cookie.expires = new Date(Date.now() + dureeSession)
						res.json({ identifiant: identifiant })
					} else {
						res.send('erreur_connexion')
					}
				})
			} else {
				res.send('erreur_connexion')
			}
		})
	})

	app.post('/api/mot-de-passe-oublie', function (req, res) {
		const identifiant = req.body.identifiant
		let email = req.body.email.trim()
		db.exists('utilisateurs:' + identifiant, function (err, reponse) {
			if (err) { res.send('erreur'); return false }
			if (reponse === 1) {
				db.hgetall('utilisateurs:' + identifiant, function (err, donnees) {
					if ((donnees.hasOwnProperty('email') && donnees.email === email) || (verifierEmail(identifiant) === true)) {
						if (!donnees.hasOwnProperty('email') || (donnees.hasOwnProperty('email') && donnees.email === '')) {
							email = identifiant
						}
						const motdepasse = genererMotDePasse(7)
						const message = {
							from: '"La Digitale" <' + process.env.EMAIL_ADDRESS + '>',
							to: '"Moi" <' + email + '>',
							subject: 'Mot de passe Digipad',
							html: '<p>Votre nouveau mot de passe : ' + motdepasse + '</p>'
						}
						transporter.sendMail(message, async function (err) {
							if (err) {
								res.send('erreur')
							} else {
								const hash = await bcrypt.hash(motdepasse, 10)
								db.hset('utilisateurs:' + identifiant, 'motdepassetemp', hash)
								res.send('message_envoye')
							}
						})
					} else {
						res.send('email_invalide')
					}
				})
			} else {
				res.send('identifiant_invalide')
			}
		})
	})

	app.post('/api/deconnexion', function (req, res) {
		req.session.identifiant = ''
		req.session.nom = ''
		req.session.email = ''
		req.session.langue = ''
		req.session.statut = ''
		req.session.destroy()
		res.send('deconnecte')
	})

	app.post('/api/recuperer-donnees-auteur', function (req, res) {
		const identifiant = req.body.identifiant
		const pad = req.body.pad
		db.hgetall('pads:' + pad, function (err, donnees) {
			if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { res.send('erreur'); return false }
			const proprietaire = donnees.identifiant
			let admins = []
			if (donnees.hasOwnProperty('admins')) {
				admins = donnees.admins
			}
			if ((admins.includes(identifiant) || proprietaire === identifiant) && req.session.identifiant === identifiant) {
				recupererDonneesAuteur(identifiant).then(function (pads) {
					let padsCrees = pads[0].filter(function (element) {
						return element !== '' && Object.keys(element).length > 0
					})
					let padsAdmins = pads[1].filter(function (element) {
						return element !== '' && Object.keys(element).length > 0
					})
					// Vérification des données des pads
					padsCrees.forEach(function (pad, indexPad) {
						if (!pad.hasOwnProperty('id') || !pad.hasOwnProperty('token') || !pad.hasOwnProperty('identifiant') || !pad.hasOwnProperty('titre') || !pad.hasOwnProperty('fond') || !pad.hasOwnProperty('date')) {
							padsCrees.splice(indexPad, 1)
						} else {
							padsCrees[indexPad].id = parseInt(pad.id)
						}
					})
					padsAdmins.forEach(function (pad, indexPad) {
						if (!pad.hasOwnProperty('id') || !pad.hasOwnProperty('token') || !pad.hasOwnProperty('identifiant') || !pad.hasOwnProperty('titre') || !pad.hasOwnProperty('fond') || !pad.hasOwnProperty('date')) {
							padsAdmins.splice(indexPad, 1)
						} else {
							padsAdmins[indexPad].id = parseInt(pad.id)
						}
					})
					// Supprimer doublons
					padsCrees = padsCrees.filter((valeur, index, self) =>
						index === self.findIndex((t) => (
							t.id === valeur.id && t.token === valeur.token
						))
					)
					padsAdmins = padsAdmins.filter((valeur, index, self) =>
						index === self.findIndex((t) => (
							t.id === valeur.id && t.token === valeur.token
						))
					)
					res.json({ padsCrees: padsCrees, padsAdmins: padsAdmins })
				})
			} else {
				res.send('non_autorise')
			}
		})
	})

	app.post('/api/recuperer-donnees-pad', function (req, res) {
		const id = req.body.id
		const token = req.body.token
		const identifiant = req.body.identifiant
		const statut = req.body.statut
		db.exists('pads:' + id, function (err, resultat) {
			if (err) { res.send('erreur'); return false }
			db.hgetall('pads:' + id, async function (err, pad) {
				if (err) { res.send('erreur'); return false }
				if (resultat === 1 && pad !== null) {
					recupererDonneesPad(id, token, identifiant, statut, res)
				} else if ((resultat !== 1 || pad === null) && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + id + '.json'))) {
					const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + id + '.json'))
					if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite')) {
						await ajouterPadDansDb(id, donnees)
						recupererDonneesPad(id, token, identifiant, statut, res)
					} else {
						res.send('erreur')
					}
				} else {
					res.send('erreur')
				}
			})
		})
	})

	app.post('/api/creer-pad', function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const titre = req.body.titre
			const token = Math.random().toString(16).slice(2)
			const date = dayjs().format()
			const couleur = choisirCouleur()
			db.exists('pad', async function (err, resultat) {
				if (err) { res.send('erreur_creation'); return false }
				if (resultat === 1) {
					db.get('pad', async function (err, resultat) {
						if (err) { res.send('erreur_creation'); return false }
						const id = parseInt(resultat) + 1
						const creation = await creerPad(id, token, titre, date, identifiant, couleur)
						if (creation === true) {
							const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id)
							await fs.mkdirs(chemin)
							res.json({ id: id, token: token, titre: titre, identifiant: identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desactivee', listeUtilisateurs: 'activee', editionNom: 'desactivee', fichiers: 'actives', enregistrements: 'desactives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', copieBloc: 'desactivee', ordre: 'croissant', largeur: 'normale', date: date, colonnes: [], affichageColonnes: [], bloc: 0, activite: 0, admins: [] })
						} else {
							res.send('erreur_creation')
						}
					})
				} else {
					const creation = await creerPad(1, token, titre, date, identifiant, couleur)
					if (creation === true) {
						const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(1) + '/1')
						await fs.mkdirs(chemin)
						res.json({ id: 1, token: token, titre: titre, identifiant: identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desactivee', listeUtilisateurs: 'activee', editionNom: 'desactivee', fichiers: 'actives', enregistrements: 'desactives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', copieBloc: 'desactivee', ordre: 'croissant', largeur: 'normale', date: date, colonnes: [], affichageColonnes: [], bloc: 0, activite: 0, admins: [] })
					} else {
						res.send('erreur_creation')
					}
				}
			})
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/creer-pad-sans-compte', async function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		let identifiant, nom
		if (req.session.identifiant === '' || req.session.identifiant === undefined || (req.session.identifiant.length !== 13 && req.session.identifiant.substring(0, 1) !== 'u')) {
			identifiant = 'u' + Math.random().toString(16).slice(3)
			nom = genererPseudo()
			req.session.identifiant = identifiant
			req.session.nom = nom
		} else {
			identifiant = req.session.identifiant
			nom = req.session.nom
		}
		if (!req.session.hasOwnProperty('acces')) {
			req.session.acces = []
		}
		if (!req.session.hasOwnProperty('pads')) {
			req.session.pads = []
		}
		if (!req.session.hasOwnProperty('digidrive')) {
			req.session.digidrive = []
		}
		const titre = req.body.titre
		const motdepasse = req.body.motdepasse
		const hash = await bcrypt.hash(motdepasse, 10)
		const token = Math.random().toString(16).slice(2)
		const date = dayjs().format()
		let langue = 'fr'
		if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
			langue = req.session.langue
		}
		db.exists('pad', async function (err, resultat) {
			if (err) { res.send('erreur_creation'); return false }
			if (resultat === 1) {
				db.get('pad', async function (err, resultat) {
					if (err) { res.send('erreur_creation'); return false }
					const id = parseInt(resultat) + 1
					const creation = await creerPadSansCompte(id, token, titre, hash, date, identifiant, nom, langue, '')
					if (creation === true) {
						const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id)
						await fs.mkdirs(chemin)
						req.session.langue = langue
						req.session.statut = 'auteur'
						req.session.cookie.expires = new Date(Date.now() + dureeSession)
						res.json({ id: id, token: token, titre: titre, identifiant: identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desactivee', listeUtilisateurs: 'activee', editionNom: 'desactivee', fichiers: 'actives', enregistrements: 'desactives', liens: 'actives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', copieBloc: 'desactivee', ordre: 'croissant', largeur: 'normale', date: date, colonnes: [], affichageColonnes: [], bloc: 0, activite: 0 })
					} else {
						res.send('erreur_creation')
					}
				})
			} else {
				const creation = await creerPadSansCompte(1, token, titre, hash, date, identifiant, nom, langue, '')
				if (creation === true) {
					const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(1) + '/1')
					await fs.mkdirs(chemin)
					req.session.langue = langue
					req.session.statut = 'auteur'
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					res.json({ id: 1, token: token, titre: titre, identifiant: identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desactivee', listeUtilisateurs: 'activee', editionNom: 'desactivee', fichiers: 'actives', enregistrements: 'desactives', liens: 'actives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', copieBloc: 'desactivee', ordre: 'croissant', largeur: 'normale', date: date, colonnes: [], affichageColonnes: [], bloc: 0, activite: 0 })
				} else {
					res.send('erreur_creation')
				}
			}
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
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant) {
			const pad = req.body.pad
			db.hgetall('pads:' + pad, async function (err, donnees) {
				if (err) { res.send('erreur'); return false }
				const motdepasse = req.body.motdepasse
				const nouveaumotdepasse = req.body.nouveaumotdepasse
				if (motdepasse.trim() !== '' && nouveaumotdepasse.trim() !== '' && donnees.hasOwnProperty('motdepasse') && donnees.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donnees.motdepasse)) {
					const hash = await bcrypt.hash(nouveaumotdepasse, 10)
					db.hset('pads:' + pad, 'motdepasse', hash)
					res.send('motdepasse_modifie')
				} else {
					res.send('motdepasse_incorrect')
				}
			})
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/ajouter-pad-favoris', function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const pad = req.body.padId
			db.sadd('pads-favoris:' + identifiant, pad, function (err) {
				if (err) { res.send('erreur_ajout_favori'); return false }
				res.send('pad_ajoute_favoris')
			})
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/supprimer-pad-favoris', function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const pad = req.body.padId
			db.srem('pads-favoris:' + identifiant, pad, function (err) {
				if (err) { res.send('erreur_suppression_favori'); return false }
				res.send('pad_supprime_favoris')
			})
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/deplacer-pad', function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const padId = req.body.padId
			const destination = req.body.destination
			db.hgetall('pads:' + padId, function (err, resultat) {
				if (err || !resultat || resultat === null) { res.send('erreur_deplacement'); return false }
				const proprietaire = resultat.identifiant
				if (proprietaire === identifiant) {
					db.hgetall('utilisateurs:' + identifiant, function (err, donnees) {
						if (err) { res.send('erreur_deplacement'); return false }
						const dossiers = JSON.parse(donnees.dossiers)
						dossiers.forEach(function (dossier, indexDossier) {
							if (dossier.pads.includes(padId)) {
								const indexPad = dossier.pads.indexOf(padId)
								dossiers[indexDossier].pads.splice(indexPad, 1)
							}
							if (dossier.id === destination) {
								dossiers[indexDossier].pads.push(padId)
							}
						})
						db.hset('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers), function (err) {
							if (err) { res.send('erreur_deplacement'); return false }
							res.send('pad_deplace')
						})
					})
				} else {
					res.send('non_autorise')
				}
			})
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/dupliquer-pad', function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const pad = req.body.padId
			db.get('pad', function (err, num) {
				if (err) { res.send('erreur_duplication'); return false }
				const id = parseInt(num) + 1
				const dossier = path.join(__dirname, '..', '/static/' + definirDossierFichiers(id))
				checkDiskSpace(dossier).then(async function (diskSpace) {
					const espace = Math.round((diskSpace.free / diskSpace.size) * 100)
					if (espace < minimumEspaceDisque) {
						res.send('erreur_espace_disque')
					} else {
						db.exists('pads:' + pad, async function (err, resultat) {
							if (err) { res.send('erreur_duplication'); return false }
							if (resultat === 1) {
								db.hgetall('pads:' + pad, function (err, donnees) {
									if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { res.send('erreur_duplication'); return false }
									const proprietaire = donnees.identifiant
									if (proprietaire === identifiant) {
										const donneesBlocs = []
										db.zrange('blocs:' + pad, 0, -1, function (err, blocs) {
											if (err) { res.send('erreur_duplication'); return false }
											for (const [indexBloc, bloc] of blocs.entries()) {
												const donneesBloc = new Promise(function (resolve) {
													db.hgetall('pad-' + pad + ':' + bloc, function (err, infos) {
														if (err || !infos || infos === null) { resolve({}); return false }
														const date = dayjs().format()
														if (infos.hasOwnProperty('vignette') && infos.vignette !== '' && !infos.vignette.includes('/img/') && !verifierURL(infos.vignette, ['https', 'http'])) {
															infos.vignette = '/' + definirDossierFichiers(id) + '/' + id + '/' + path.basename(infos.vignette)
														}
														let visibilite = 'visible'
														if (infos.hasOwnProperty('visibilite')) {
															visibilite = infos.visibilite
														}
														if (infos.hasOwnProperty('iframe') && infos.iframe !== '' && infos.iframe.includes(etherpad)) {
															const etherpadId = infos.iframe.replace(etherpad + '/p/', '')
															const destinationId = 'pad-' + id + '-' + Math.random().toString(16).slice(2)
															const url = etherpad + '/api/1.2.14/copyPad?apikey=' + etherpadApi + '&sourceID=' + etherpadId + '&destinationID=' + destinationId
															axios.get(url)
															infos.iframe = etherpad + '/p/' + destinationId
															infos.media = etherpad + '/p/' + destinationId
														}
														const multi = db.multi()
														const blocId = 'bloc-id-' + (new Date()).getTime() + Math.random().toString(16).slice(10)
														multi.hmset('pad-' + id + ':' + blocId, 'id', infos.id, 'bloc', blocId, 'titre', infos.titre, 'texte', infos.texte, 'media', infos.media, 'iframe', infos.iframe, 'type', infos.type, 'source', infos.source, 'vignette', infos.vignette, 'date', date, 'identifiant', infos.identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', infos.colonne, 'visibilite', visibilite)
														multi.zadd('blocs:' + id, indexBloc, blocId)
														multi.exec(function () {
															resolve(blocId)
														})
													})
												})
												donneesBlocs.push(donneesBloc)
											}
											Promise.all(donneesBlocs).then(function () {
												const token = Math.random().toString(16).slice(2)
												const date = dayjs().format()
												const couleur = choisirCouleur()
												const code = Math.floor(100000 + Math.random() * 900000)
												let registreActivite = 'active'
												let conversation = 'desactivee'
												let listeUtilisateurs = 'activee'
												let editionNom = 'desactivee'
												let ordre = 'croissant'
												let largeur = 'normale'
												let enregistrements = 'desactives'
												let copieBloc = 'desactivee'
												let affichageColonnes = []
												if (donnees.hasOwnProperty('registreActivite')) {
													registreActivite = donnees.registreActivite
												}
												if (donnees.hasOwnProperty('conversation')) {
													conversation = donnees.conversation
												}
												if (donnees.hasOwnProperty('listeUtilisateurs')) {
													listeUtilisateurs = donnees.listeUtilisateurs
												}
												if (donnees.hasOwnProperty('editionNom')) {
													editionNom = donnees.editionNom
												}
												if (donnees.hasOwnProperty('ordre')) {
													ordre = donnees.ordre
												}
												if (donnees.hasOwnProperty('largeur')) {
													largeur = donnees.largeur
												}
												if (donnees.hasOwnProperty('enregistrements')) {
													enregistrements = donnees.enregistrements
												}
												if (donnees.hasOwnProperty('copieBloc')) {
													copieBloc = donnees.copieBloc
												}
												if (donnees.hasOwnProperty('affichageColonnes')) {
													affichageColonnes = JSON.parse(donnees.affichageColonnes)
												} else {
													JSON.parse(donnees.colonnes).forEach(function () {
														affichageColonnes.push(true)
													})
												}
												if (!donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
													donnees.fond = '/' + definirDossierFichiers(id) + '/' + id + '/' + path.basename(donnees.fond)
												}
												const multi = db.multi()
												multi.incr('pad')
												if (donnees.hasOwnProperty('code')) {
													multi.hmset('pads:' + id, 'id', id, 'token', token, 'titre', 'Copie de ' + donnees.titre, 'identifiant', identifiant, 'fond', donnees.fond, 'acces', donnees.acces, 'code', code, 'contributions', donnees.contributions, 'affichage', donnees.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.fichiers, 'enregistrements', enregistrements, 'liens', donnees.liens, 'documents', donnees.documents, 'commentaires', donnees.commentaires, 'evaluations', donnees.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.bloc, 'activite', 0)
												} else {
													multi.hmset('pads:' + id, 'id', id, 'token', token, 'titre', 'Copie de ' + donnees.titre, 'identifiant', identifiant, 'fond', donnees.fond, 'acces', donnees.acces, 'contributions', donnees.contributions, 'affichage', donnees.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.fichiers, 'enregistrements', enregistrements, 'liens', donnees.liens, 'documents', donnees.documents, 'commentaires', donnees.commentaires, 'evaluations', donnees.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.bloc, 'activite', 0)
												}
												multi.sadd('pads-crees:' + identifiant, id)
												multi.sadd('utilisateurs-pads:' + id, identifiant)
												multi.hset('couleurs:' + identifiant, 'pad' + id, couleur)
												multi.exec(async function () {
													if (await fs.pathExists(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad))) {
														await fs.copy(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad), path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id))
													}
													res.json({ id: id, token: token, titre: 'Copie de ' + donnees.titre, identifiant: identifiant, fond: donnees.fond, acces: donnees.acces, code: code, contributions: donnees.contributions, affichage: donnees.affichage, registreActivite: registreActivite, conversation: conversation, listeUtilisateurs: listeUtilisateurs, editionNom: editionNom, fichiers: donnees.fichiers, enregistrements: enregistrements, liens: donnees.liens, documents: donnees.documents, commentaires: donnees.commentaires, evaluations: donnees.evaluations, copieBloc: copieBloc, ordre: ordre, largeur: largeur, date: date, colonnes: donnees.colonnes, affichageColonnes: affichageColonnes, bloc: donnees.bloc, activite: 0 })
												})
											})
										})
									} else {
										res.send('non_autorise')
									}
								})
							} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
								const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
								if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite')) {
									const proprietaire = donnees.identifiant
									if (proprietaire === identifiant) {
										const date = dayjs().format()
										const donneesBlocs = []
										for (const [indexBloc, bloc] of donnees.blocs.entries()) {
											const donneesBloc = new Promise(function (resolve) {
												if (Object.keys(bloc).length > 0) {
													if (bloc.hasOwnProperty('vignette') && bloc.vignette !== '' && !bloc.vignette.includes('/img/') && !verifierURL(bloc.vignette, ['https', 'http'])) {
														bloc.vignette = '/' + definirDossierFichiers(id) + '/' + id + '/' + path.basename(bloc.vignette)
													}
													let visibilite = 'visible'
													if (bloc.hasOwnProperty('visibilite')) {
														visibilite = bloc.visibilite
													}
													if (bloc.hasOwnProperty('iframe') && bloc.iframe !== '' && bloc.iframe.includes(etherpad)) {
														const etherpadId = bloc.iframe.replace(etherpad + '/p/', '')
														const destinationId = 'pad-' + id + '-' + Math.random().toString(16).slice(2)
														const url = etherpad + '/api/1.2.14/copyPad?apikey=' + etherpadApi + '&sourceID=' + etherpadId + '&destinationID=' + destinationId
														axios.get(url)
														bloc.iframe = etherpad + '/p/' + destinationId
														bloc.media = etherpad + '/p/' + destinationId
													}
													const multi = db.multi()
													const blocId = 'bloc-id-' + (new Date()).getTime() + Math.random().toString(16).slice(10)
													multi.hmset('pad-' + id + ':' + blocId, 'id', bloc.id, 'bloc', blocId, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', bloc.vignette, 'date', date, 'identifiant', bloc.identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', bloc.colonne, 'visibilite', visibilite)
													multi.zadd('blocs:' + id, indexBloc, blocId)
													multi.exec(function () {
														resolve(blocId)
													})
												} else {
													resolve({})
												}
											})
											donneesBlocs.push(donneesBloc)
										}
										Promise.all(donneesBlocs).then(function () {
											const token = Math.random().toString(16).slice(2)
											const couleur = choisirCouleur()
											const code = Math.floor(100000 + Math.random() * 900000)
											let registreActivite = 'active'
											let conversation = 'desactivee'
											let listeUtilisateurs = 'activee'
											let editionNom = 'desactivee'
											let ordre = 'croissant'
											let largeur = 'normale'
											let enregistrements = 'desactives'
											let copieBloc = 'desactivee'
											let affichageColonnes = []
											if (donnees.pad.hasOwnProperty('registreActivite')) {
												registreActivite = donnees.pad.registreActivite
											}
											if (donnees.pad.hasOwnProperty('conversation')) {
												conversation = donnees.pad.conversation
											}
											if (donnees.pad.hasOwnProperty('listeUtilisateurs')) {
												listeUtilisateurs = donnees.pad.listeUtilisateurs
											}
											if (donnees.pad.hasOwnProperty('editionNom')) {
												editionNom = donnees.pad.editionNom
											}
											if (donnees.pad.hasOwnProperty('ordre')) {
												ordre = donnees.pad.ordre
											}
											if (donnees.pad.hasOwnProperty('largeur')) {
												largeur = donnees.pad.largeur
											}
											if (donnees.pad.hasOwnProperty('enregistrements')) {
												enregistrements = donnees.pad.enregistrements
											}
											if (donnees.pad.hasOwnProperty('copieBloc')) {
												copieBloc = donnees.pad.copieBloc
											}
											if (donnees.pad.hasOwnProperty('affichageColonnes')) {
												affichageColonnes = JSON.parse(donnees.pad.affichageColonnes)
											} else {
												JSON.parse(donnees.pad.colonnes).forEach(function () {
													affichageColonnes.push(true)
												})
											}
											if (!donnees.pad.fond.includes('/img/') && donnees.pad.fond.substring(0, 1) !== '#' && donnees.pad.fond !== '') {
												donnees.pad.fond = '/' + definirDossierFichiers(id) + '/' + id + '/' + path.basename(donnees.pad.fond)
											}
											const multi = db.multi()
											multi.incr('pad')
											if (donnees.pad.hasOwnProperty('code')) {
												multi.hmset('pads:' + id, 'id', id, 'token', token, 'titre', 'Copie de ' + donnees.pad.titre, 'identifiant', identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'code', code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.pad.bloc, 'activite', 0)
											} else {
												multi.hmset('pads:' + id, 'id', id, 'token', token, 'titre', 'Copie de ' + donnees.pad.titre, 'identifiant', identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.pad.bloc, 'activite', 0)
											}
											multi.sadd('pads-crees:' + identifiant, id)
											multi.sadd('utilisateurs-pads:' + id, identifiant)
											multi.hset('couleurs:' + identifiant, 'pad' + id, couleur)
											multi.exec(async function () {
												if (await fs.pathExists(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad))) {
													await fs.copy(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad), path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id))
												}
												res.json({ id: id, token: token, titre: 'Copie de ' + donnees.pad.titre, identifiant: identifiant, fond: donnees.pad.fond, acces: donnees.pad.acces, code: code, contributions: donnees.pad.contributions, affichage: donnees.pad.affichage, registreActivite: registreActivite, conversation: conversation, listeUtilisateurs: listeUtilisateurs, editionNom: editionNom, fichiers: donnees.pad.fichiers, enregistrements: enregistrements, liens: donnees.pad.liens, documents: donnees.pad.documents, commentaires: donnees.pad.commentaires, evaluations: donnees.pad.evaluations, copieBloc: copieBloc, ordre: ordre, largeur: largeur, date: date, colonnes: donnees.pad.colonnes, affichageColonnes: affichageColonnes, bloc: donnees.pad.bloc, activite: 0 })
											})
										})
									} else {
										res.send('non_autorise')
									}
								} else {
									res.send('erreur_duplication')
								}
							}
						})
					}
				})
			})
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/exporter-pad', function (req, res) {
		const identifiant = req.body.identifiant
		const admin = req.body.admin
		const motdepasseAdmin = process.env.VITE_ADMIN_PASSWORD
		if ((req.session.identifiant && req.session.identifiant === identifiant) || (admin !== '' && admin === motdepasseAdmin)) {
			const id = req.body.padId
			db.exists('pads:' + id, async function (err, resultat) {
				if (err) { res.send('erreur_export'); return false }
				if (resultat === 1) {
					db.hgetall('pads:' + id, function (err, d) {
						if (err || !d || d === null) { res.send('erreur_export'); return false }
						const proprietaire = d.identifiant
						if (proprietaire === identifiant) {
							const donneesPad = new Promise(function (resolveMain) {
								db.hgetall('pads:' + id, function (err, resultats) {
									if (err) { resolveMain({}); return false }
									resolveMain(resultats)
								})
							})
							const blocsPad = new Promise(function (resolveMain) {
								const donneesBlocs = []
								db.zrange('blocs:' + id, 0, -1, function (err, blocs) {
									if (err) { resolveMain(donneesBlocs); return false }
									for (const bloc of blocs) {
										const donneesBloc = new Promise(function (resolve) {
											db.hgetall('pad-' + id + ':' + bloc, function (err, donnees) {
												if (err || !donnees || donnees === null) { resolve({}); return false }
												const donneesCommentaires = []
												db.zrange('commentaires:' + bloc, 0, -1, function (err, commentaires) {
													if (err || !commentaires || commentaires === null) { resolve(donnees); return false }
													for (let commentaire of commentaires) {
														donneesCommentaires.push(JSON.parse(commentaire))
													}
													donnees.commentaires = donneesCommentaires.length
													donnees.listeCommentaires = donneesCommentaires
													db.zrange('evaluations:' + bloc, 0, -1, function (err, evaluations) {
														if (err || !evaluations || evaluations === null) { resolve(donnees); return false }
														const donneesEvaluations = []
														evaluations.forEach(function (evaluation) {
															donneesEvaluations.push(JSON.parse(evaluation))
														})
														donnees.evaluations = donneesEvaluations.length
														donnees.listeEvaluations = donneesEvaluations
														db.exists('noms:' + donnees.identifiant, function (err, resultat) {
															if (err) { resolve(donnees); return false }
															if (resultat === 1) {
																db.hget('noms:' + donnees.identifiant, 'nom', function (err, nom) {
																	if (err) { resolve(donnees); return false }
																	donnees.nom = nom
																	donnees.info = formaterDate(donnees, req.session.langue)
																	resolve(donnees)
																})
															} else {
																donnees.nom = genererPseudo()
																donnees.info = formaterDate(donnees, req.session.langue)
																resolve(donnees)
															}
														})
													})
												})
											})
										})
										donneesBlocs.push(donneesBloc)
									}
									Promise.all(donneesBlocs).then(function (resultat) {
										resultat = resultat.filter(function (element) {
											return Object.keys(element).length > 0
										})
										resolveMain(resultat)
									})
								})
							})
							const activitePad = new Promise(function (resolveMain) {
								const donneesEntrees = []
								db.zrange('activite:' + id, 0, -1, function (err, entrees) {
									if (err || !entrees || entrees === null) { resolveMain(donneesEntrees); return false }
									for (let entree of entrees) {
										entree = JSON.parse(entree)
										const donneesEntree = new Promise(function (resolve) {
											db.exists('utilisateurs:' + entree.identifiant, function (err) {
												if (err) { resolve({}); return false }
												resolve(entree)
											})
										})
										donneesEntrees.push(donneesEntree)
									}
									Promise.all(donneesEntrees).then(function (resultat) {
										resultat = resultat.filter(function (element) {
											return Object.keys(element).length > 0
										})
										resolveMain(resultat)
									})
								})
							})
							Promise.all([donneesPad, blocsPad, activitePad]).then(async function (donnees) {
								if (donnees.length > 0 && donnees[0].hasOwnProperty('id')) {
									const parametres = {}
									parametres.pad = donnees[0]
									parametres.blocs = donnees[1]
									parametres.activite = donnees[2]
									const html = genererHTML(donnees[0], donnees[1])
									const chemin = path.join(__dirname, '..', '/static/temp')
									await fs.mkdirp(path.normalize(chemin + '/' + id))
									await fs.mkdirp(path.normalize(chemin + '/' + id + '/fichiers'))
									await fs.mkdirp(path.normalize(chemin + '/' + id + '/static'))
									await fs.writeFile(path.normalize(chemin + '/' + id + '/donnees.json'), JSON.stringify(parametres, '', 4), 'utf8')
									await fs.writeFile(path.normalize(chemin + '/' + id + '/index.html'), html, 'utf8')
									if (!parametres.pad.fond.includes('/img/') && parametres.pad.fond.substring(0, 1) !== '#' && parametres.pad.fond !== '') {
										const fichierFond = path.basename(parametres.pad.fond)
										if (await fs.pathExists(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + fichierFond))) {
											await fs.copy(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + fichierFond), path.normalize(chemin + '/' + id + '/fichiers/' + fichierFond, { overwrite: true }))
										}
									} else if (parametres.pad.fond.includes('/img/') && await fs.pathExists(path.join(__dirname, '..', '/public' + parametres.pad.fond))) {
										await fs.copy(path.join(__dirname, '..', '/public' + parametres.pad.fond), path.normalize(chemin + '/' + id + '/static' + parametres.pad.fond, { overwrite: true }))
									}
									if (await fs.pathExists(path.join(__dirname, '..', '/static/export/css'))) {
										await fs.copy(path.join(__dirname, '..', '/static/export/css'), path.normalize(chemin + '/' + id + '/static/css'))
									}
									if (await fs.pathExists(path.join(__dirname, '..', '/static/export/js'))) {
										await fs.copy(path.join(__dirname, '..', '/static/export/js'), path.normalize(chemin + '/' + id + '/static/js'))
									}
									await fs.copy(path.join(__dirname, '..', '/public/fonts/MaterialIcons-Regular.woff'), path.normalize(chemin + '/' + id + '/static/fonts/MaterialIcons-Regular.woff'))
									await fs.copy(path.join(__dirname, '..', '/public/fonts/MaterialIcons-Regular.woff2'), path.normalize(chemin + '/' + id + '/static/fonts/MaterialIcons-Regular.woff2'))
									await fs.copy(path.join(__dirname, '..', '/public/fonts/Roboto-Slab-Medium.woff'), path.normalize(chemin + '/' + id + '/static/fonts/Roboto-Slab-Medium.woff'))
									await fs.copy(path.join(__dirname, '..', '/public/fonts/Roboto-Slab-Medium.woff2'), path.normalize(chemin + '/' + id + '/static/fonts/Roboto-Slab-Medium.woff2'))
									await fs.copy(path.join(__dirname, '..', '/public/img/favicon.png'), path.normalize(chemin + '/' + id + '/static/img/favicon.png'))
									for (const bloc of parametres.blocs) {
										if (Object.keys(bloc).length > 0 && bloc.media !== '' && bloc.type !== 'embed' && await fs.pathExists(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + bloc.media))) {
											await fs.copy(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + bloc.media), path.normalize(chemin + '/' + id + '/fichiers/' + bloc.media, { overwrite: true }))
										}
										if (Object.keys(bloc).length > 0 && bloc.vignette && bloc.vignette !== '') {
											if (bloc.vignette.includes('/img/') && !verifierURL(bloc.vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/public' + bloc.vignette))) {
												await fs.copy(path.join(__dirname, '..', '/public' + bloc.vignette), path.normalize(chemin + '/' + id + '/static' + bloc.vignette, { overwrite: true }))
											} else if (!verifierURL(bloc.vignette, ['https', 'http'])) {
												const fichierVignette = path.basename(bloc.vignette)
												if (await fs.pathExists(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + fichierVignette))) {
													await fs.copy(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + fichierVignette), path.normalize(chemin + '/' + id + '/fichiers/' + fichierVignette, { overwrite: true }))
												}
											}
										}
									}
									const archiveId = Math.floor((Math.random() * 100000) + 1)
									const sortie = fs.createWriteStream(path.normalize(chemin + '/pad-' + id + '_' + archiveId + '.zip'))
									const archive = archiver('zip', {
										zlib: { level: 9 }
									})
									sortie.on('finish', async function () {
										await fs.remove(path.normalize(chemin + '/' + id))
										res.send('pad-' + id + '_' + archiveId + '.zip')
									})
									archive.pipe(sortie)
									archive.directory(path.normalize(chemin + '/' + id), false)
									archive.finalize()
								} else {
									res.send('erreur_export')
								}
							})
						} else {
							res.send('non_autorise')
						}
					})
				} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + id + '.json'))) {
					const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + id + '.json'))
					const proprietaire = donnees.identifiant
					if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite') && proprietaire === identifiant) {
						const html = genererHTML(donnees.pad, donnees.blocs)
						const chemin = path.join(__dirname, '..', '/static/temp')
						await fs.mkdirp(path.normalize(chemin + '/' + id))
						await fs.mkdirp(path.normalize(chemin + '/' + id + '/fichiers'))
						await fs.mkdirp(path.normalize(chemin + '/' + id + '/static'))
						await fs.writeFile(path.normalize(chemin + '/' + id + '/donnees.json'), JSON.stringify(donnees, '', 4), 'utf8')
						await fs.writeFile(path.normalize(chemin + '/' + id + '/index.html'), html, 'utf8')
						if (!donnees.pad.fond.includes('/img/') && donnees.pad.fond.substring(0, 1) !== '#' && donnees.pad.fond !== '') {
							const fichierFond = path.basename(donnees.pad.fond)
							if (await fs.pathExists(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + fichierFond))) {
								await fs.copy(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + fichierFond), path.normalize(chemin + '/' + id + '/fichiers/' + fichierFond, { overwrite: true }))
							}
						} else if (donnees.pad.fond.includes('/img/') && await fs.pathExists(path.join(__dirname, '..', '/public' + donnees.pad.fond))) {
							await fs.copy(path.join(__dirname, '..', '/public' + donnees.pad.fond), path.normalize(chemin + '/' + id + '/static' + donnees.pad.fond, { overwrite: true }))
						}
						if (await fs.pathExists(path.join(__dirname, '..', '/static/export/css'))) {
							await fs.copy(path.join(__dirname, '..', '/static/export/css'), path.normalize(chemin + '/' + id + '/static/css'))
						}
						if (await fs.pathExists(path.join(__dirname, '..', '/static/export/js'))) {
							await fs.copy(path.join(__dirname, '..', '/static/export/js'), path.normalize(chemin + '/' + id + '/static/js'))
						}
						await fs.copy(path.join(__dirname, '..', '/public/fonts/MaterialIcons-Regular.woff'), path.normalize(chemin + '/' + id + '/static/fonts/MaterialIcons-Regular.woff'))
						await fs.copy(path.join(__dirname, '..', '/public/fonts/MaterialIcons-Regular.woff2'), path.normalize(chemin + '/' + id + '/static/fonts/MaterialIcons-Regular.woff2'))
						await fs.copy(path.join(__dirname, '..', '/public/fonts/Roboto-Slab-Medium.woff'), path.normalize(chemin + '/' + id + '/static/fonts/Roboto-Slab-Medium.woff'))
						await fs.copy(path.join(__dirname, '..', '/public/fonts/Roboto-Slab-Medium.woff2'), path.normalize(chemin + '/' + id + '/static/fonts/Roboto-Slab-Medium.woff2'))
						await fs.copy(path.join(__dirname, '..', '/public/img/favicon.png'), path.normalize(chemin + '/' + id + '/static/img/favicon.png'))
						for (const bloc of donnees.blocs) {
							if (Object.keys(bloc).length > 0 && bloc.media !== '' && bloc.type !== 'embed' && await fs.pathExists(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + bloc.media))) {
								await fs.copy(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + bloc.media), path.normalize(chemin + '/' + id + '/fichiers/' + bloc.media, { overwrite: true }))
							}
							if (Object.keys(bloc).length > 0 && bloc.vignette && bloc.vignette !== '') {
								if (bloc.vignette.includes('/img/') && !verifierURL(bloc.vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/public' + bloc.vignette))) {
									await fs.copy(path.join(__dirname, '..', '/public' + bloc.vignette), path.normalize(chemin + '/' + id + '/static' + bloc.vignette, { overwrite: true }))
								} else if (!verifierURL(bloc.vignette, ['https', 'http'])) {
									const fichierVignette = path.basename(bloc.vignette)
									if (await fs.pathExists(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + fichierVignette))) {
										await fs.copy(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + fichierVignette), path.normalize(chemin + '/' + id + '/fichiers/' + fichierVignette, { overwrite: true }))
									}
								}
							}
						}
						const archiveId = Math.floor((Math.random() * 100000) + 1)
						const sortie = fs.createWriteStream(path.normalize(chemin + '/pad-' + id + '_' + archiveId + '.zip'))
						const archive = archiver('zip', {
							zlib: { level: 9 }
						})
						sortie.on('finish', async function () {
							await fs.remove(path.normalize(chemin + '/' + id))
							res.send('pad-' + id + '_' + archiveId + '.zip')
						})
						archive.pipe(sortie)
						archive.directory(path.normalize(chemin + '/' + id), false)
						archive.finalize()
					} else {
						res.send('erreur_export')
					}
				}
			})
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/importer-pad', function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		const identifiant = req.session.identifiant
		if (!identifiant) {
			res.send('non_connecte')
		} else {
			televerserTemp(req, res, async function (err) {
				if (err) { res.send('erreur_import'); return false }
				try {
					const source = path.join(__dirname, '..', '/static/temp/' + req.file.filename)
					const cible = path.join(__dirname, '..', '/static/temp/archive-' + Math.floor((Math.random() * 100000) + 1))
					await extract(source, { dir: cible })
					const donnees = await fs.readJson(path.normalize(cible + '/donnees.json'))
					const parametres = JSON.parse(req.body.parametres)
					// Vérification des clés des données
					if (donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite') && donnees.pad.hasOwnProperty('id') && donnees.pad.hasOwnProperty('token') && donnees.pad.hasOwnProperty('titre') && donnees.pad.hasOwnProperty('identifiant') && donnees.pad.hasOwnProperty('fond') && donnees.pad.hasOwnProperty('acces') && donnees.pad.hasOwnProperty('contributions') && donnees.pad.hasOwnProperty('affichage') && donnees.pad.hasOwnProperty('fichiers') && donnees.pad.hasOwnProperty('liens') && donnees.pad.hasOwnProperty('documents') && donnees.pad.hasOwnProperty('commentaires') && donnees.pad.hasOwnProperty('evaluations') && donnees.pad.hasOwnProperty('date') && donnees.pad.hasOwnProperty('colonnes') && donnees.pad.hasOwnProperty('bloc') && donnees.pad.hasOwnProperty('activite')) {
						db.get('pad', async function (err, resultat) {
							if (err) { res.send('erreur_import'); return false }
							const id = parseInt(resultat) + 1
							const dossier = path.join(__dirname, '..', '/static/' + definirDossierFichiers(id))
							checkDiskSpace(dossier).then(async function (diskSpace) {
								const espace = Math.round((diskSpace.free / diskSpace.size) * 100)
								if (espace < minimumEspaceDisque) {
									res.send('erreur_espace_disque')
								} else {
									const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id)
									const donneesBlocs = []
									await fs.mkdirp(chemin)
									for (const [indexBloc, bloc] of donnees.blocs.entries()) {
										const donneesBloc = new Promise(function (resolve) {
											if (bloc.hasOwnProperty('id') && bloc.hasOwnProperty('bloc') && bloc.hasOwnProperty('titre') && bloc.hasOwnProperty('texte') && bloc.hasOwnProperty('media') && bloc.hasOwnProperty('iframe') && bloc.hasOwnProperty('type') && bloc.hasOwnProperty('source') && bloc.hasOwnProperty('vignette') && bloc.hasOwnProperty('identifiant') && bloc.hasOwnProperty('commentaires') && bloc.hasOwnProperty('evaluations') && bloc.hasOwnProperty('colonne') && bloc.hasOwnProperty('listeCommentaires') && bloc.hasOwnProperty('listeEvaluations')) {
												const date = dayjs().format()
												let commentaires = 0
												let evaluations = 0
												if (parametres.commentaires === true) {
													commentaires = bloc.commentaires
												}
												if (parametres.evaluations === true) {
													evaluations = bloc.evaluations
												}
												if (bloc.vignette !== '' && !bloc.vignette.includes('/img/') && !verifierURL(bloc.vignette, ['https', 'http'])) {
													bloc.vignette = '/' + definirDossierFichiers(donnees.pad.id) + '/' + donnees.pad.id + '/' + path.basename(bloc.vignette)
												}
												let visibilite = 'visible'
												if (bloc.hasOwnProperty('visibilite')) {
													visibilite = bloc.visibilite
												}
												const multi = db.multi()
												const blocId = 'bloc-id-' + (new Date()).getTime() + Math.random().toString(16).slice(10)
												multi.hmset('pad-' + id + ':' + blocId, 'id', bloc.id, 'bloc', blocId, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', bloc.vignette, 'date', date, 'identifiant', bloc.identifiant, 'commentaires', commentaires, 'evaluations', evaluations, 'colonne', bloc.colonne, 'visibilite', visibilite)
												multi.zadd('blocs:' + id, indexBloc, blocId)
												if (parametres.commentaires === true) {
													for (const commentaire of bloc.listeCommentaires) {
														if (commentaire.hasOwnProperty('id') && commentaire.hasOwnProperty('identifiant') && commentaire.hasOwnProperty('date') && commentaire.hasOwnProperty('texte')) {
															multi.zadd('commentaires:' + blocId, commentaire.id, JSON.stringify(commentaire))
														}
													}
												}
												if (parametres.evaluations === true) {
													for (const evaluation of bloc.listeEvaluations) {
														if (evaluation.hasOwnProperty('id') && evaluation.hasOwnProperty('identifiant') && evaluation.hasOwnProperty('date') && evaluation.hasOwnProperty('etoiles')) {
															multi.zadd('evaluations:' + blocId, evaluation.id, JSON.stringify(evaluation))
														}
													}
												}
												multi.exec(async function () {
													if (bloc.hasOwnProperty('media') && bloc.media !== '' && bloc.type !== 'embed' && await fs.pathExists(path.normalize(cible + '/fichiers/' + bloc.media))) {
														await fs.copy(path.normalize(cible + '/fichiers/' + bloc.media), path.normalize(chemin + '/' + bloc.media, { overwrite: true }))
													}
													if (bloc.hasOwnProperty('vignette') && bloc.vignette !== '' && !bloc.vignette.includes('/img/') && !verifierURL(bloc.vignette, ['https', 'http']) && await fs.pathExists(path.normalize(cible + '/fichiers/' + path.basename(bloc.vignette)))) {
														await fs.copy(path.normalize(cible + '/fichiers/' + path.basename(bloc.vignette)), path.normalize(chemin + '/' + path.basename(bloc.vignette), { overwrite: true }))
													}
													resolve({ bloc: bloc.bloc, blocId: blocId })
												})
											} else {
												resolve({ bloc: 0, blocId: 0 })
											}
										})
										donneesBlocs.push(donneesBloc)
									}
									Promise.all(donneesBlocs).then(async function (blocs) {
										const token = Math.random().toString(16).slice(2)
										const date = dayjs().format()
										const couleur = choisirCouleur()
										const code = Math.floor(100000 + Math.random() * 900000)
										let registreActivite = 'active'
										let conversation = 'desactivee'
										let listeUtilisateurs = 'activee'
										let editionNom = 'desactivee'
										let ordre = 'croissant'
										let largeur = 'normale'
										let enregistrements = 'desactives'
										let copieBloc = 'desactivee'
										let affichageColonnes = []
										let activiteId = 0
										if (donnees.pad.hasOwnProperty('registreActivite')) {
											registreActivite = donnees.pad.registreActivite
										}
										if (donnees.pad.hasOwnProperty('conversation')) {
											conversation = donnees.pad.conversation
										}
										if (donnees.pad.hasOwnProperty('listeUtilisateurs')) {
											listeUtilisateurs = donnees.pad.listeUtilisateurs
										}
										if (donnees.pad.hasOwnProperty('editionNom')) {
											editionNom = donnees.pad.editionNom
										}
										if (donnees.pad.hasOwnProperty('ordre')) {
											ordre = donnees.pad.ordre
										}
										if (donnees.pad.hasOwnProperty('largeur')) {
											largeur = donnees.pad.largeur
										}
										if (donnees.pad.hasOwnProperty('enregistrements')) {
											enregistrements = donnees.pad.enregistrements
										}
										if (donnees.pad.hasOwnProperty('copieBloc')) {
											copieBloc = donnees.pad.copieBloc
										}
										if (donnees.pad.hasOwnProperty('affichageColonnes')) {
											affichageColonnes = JSON.parse(donnees.pad.affichageColonnes)
										} else {
											JSON.parse(donnees.pad.colonnes).forEach(function () {
												affichageColonnes.push(true)
											})
										}
										if (parametres.activite === true) {
											activiteId = donnees.pad.activite
										}
										if (!donnees.pad.fond.includes('/img/') && donnees.pad.fond.substring(0, 1) !== '#' && donnees.pad.fond !== '' && await fs.pathExists(path.normalize(cible + '/fichiers/' + path.basename(donnees.pad.fond)))) {
											await fs.copy(path.normalize(cible + '/fichiers/' + path.basename(donnees.pad.fond)), path.normalize(chemin + '/' + path.basename(donnees.pad.fond), { overwrite: true }))
										}
										const multi = db.multi()
										multi.incr('pad')
										multi.hmset('pads:' + id, 'id', id, 'token', token, 'titre', donnees.pad.titre, 'identifiant', identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'code', code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.pad.bloc, 'activite', activiteId, 'admins', JSON.stringify([]))
										multi.sadd('pads-crees:' + identifiant, id)
										multi.sadd('utilisateurs-pads:' + id, identifiant)
										multi.hset('couleurs:' + identifiant, 'pad' + id, couleur)
										if (parametres.activite === true) {
											if (parametres.commentaires === false) {
												donnees.activite = donnees.activite.filter(function (element) {
													return element.type !== 'bloc-commente'
												})
											}
											if (parametres.evaluations === false) {
												donnees.activite = donnees.activite.filter(function (element) {
													return element.type !== 'bloc-evalue'
												})
											}
											for (const activite of donnees.activite) {
												if (activite.hasOwnProperty('bloc') && activite.hasOwnProperty('identifiant') && activite.hasOwnProperty('titre') && activite.hasOwnProperty('date') && activite.hasOwnProperty('couleur') && activite.hasOwnProperty('type') && activite.hasOwnProperty('id')) {
													blocs.forEach(function (item) {
														if (activite.bloc === item.bloc) {
															activite.bloc = item.blocId
														}
													})
													multi.zadd('activite:' + id, activite.id, JSON.stringify(activite))
												}
											}
										}
										multi.exec(async function () {
											await fs.remove(source)
											await fs.remove(cible)
											res.json({ id: id, token: token, titre: donnees.pad.titre, identifiant: identifiant, fond: donnees.pad.fond, acces: donnees.pad.acces, code: code, contributions: donnees.pad.contributions, affichage: donnees.pad.affichage, registreActivite: registreActivite, conversation: conversation, listeUtilisateurs: listeUtilisateurs, editionNom: editionNom, fichiers: donnees.pad.fichiers, enregistrements: enregistrements, liens: donnees.pad.liens, documents: donnees.pad.documents, commentaires: donnees.pad.commentaires, evaluations: donnees.pad.evaluations, copieBloc: copieBloc, ordre: ordre, largeur: largeur, date: date, colonnes: donnees.pad.colonnes, affichageColonnes: affichageColonnes, bloc: donnees.pad.bloc, activite: activiteId, admins: [] })
										})
									})
								}
							})
						})
					} else {
						await fs.remove(source)
						await fs.remove(cible)
						res.send('donnees_corrompues')
					}
				} catch (err) {
					await fs.remove(path.join(__dirname, '..', '/static/temp/' + req.file.filename))
					res.send('erreur_import')
				}
			})
		}
	})

	app.post('/api/supprimer-pad', function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		const identifiant = req.body.identifiant
		const admin = req.body.admin
		const motdepasseAdmin = process.env.VITE_ADMIN_PASSWORD
		const pad = req.body.padId
		const type = req.body.type
		if ((req.session.identifiant && req.session.identifiant === identifiant) || (admin !== '' && admin === motdepasseAdmin)) {
			let suppressionFichiers = true
			if (req.body.hasOwnProperty('suppressionFichiers')) {
				suppressionFichiers = req.body.suppressionFichiers
			}
			db.exists('pads:' + pad, async function (err, resultat) {
				if (err) { res.send('erreur_suppression'); return false }
				if (resultat === 1) {
					db.hgetall('pads:' + pad, function (err, donneesPad) {
						if (err || !donneesPad || donneesPad === null) { res.send('erreur_suppression'); return false }
						if (donneesPad.identifiant === identifiant) {
							db.zrange('blocs:' + pad, 0, -1, function (err, blocs) {
								if (err) { res.send('erreur_suppression'); return false }
								const multi = db.multi()
								for (let i = 0; i < blocs.length; i++) {
									multi.del('commentaires:' + blocs[i])
									multi.del('evaluations:' + blocs[i])
									multi.del('pad-' + pad + ':' + blocs[i])
								}
								multi.del('blocs:' + pad)
								multi.del('pads:' + pad)
								multi.del('activite:' + pad)
								multi.del('dates-pads:' + pad)
								multi.srem('pads-crees:' + identifiant, pad)
								multi.smembers('utilisateurs-pads:' + pad, function (err, utilisateurs) {
									if (err) { res.send('erreur_suppression'); return false }
									for (let j = 0; j < utilisateurs.length; j++) {
										db.srem('pads-rejoints:' + utilisateurs[j], pad)
										db.srem('pads-utilisateurs:' + utilisateurs[j], pad)
										db.srem('pads-admins:' + utilisateurs[j], pad)
										db.srem('pads-favoris:' + utilisateurs[j], pad)
										db.hdel('couleurs:' + utilisateurs[j], 'pad' + pad)
									}
								})
								multi.del('utilisateurs-pads:' + pad)
								multi.exec(async function () {
									const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad)
									if (suppressionFichiers === true) {
										await fs.remove(chemin)
									}
									res.send('pad_supprime')
								})
							})
						} else {
							db.hgetall('utilisateurs:' + identifiant, function (err, donnees) {
								if (err) { res.send('erreur_suppression'); return false }
								const multi = db.multi()
								if (donnees.hasOwnProperty('dossiers')) {
									const dossiers = JSON.parse(donnees.dossiers)
									dossiers.forEach(function (dossier, indexDossier) {
										if (dossier.pads.includes(pad)) {
											const indexPad = dossier.pads.indexOf(pad)
											dossiers[indexDossier].pads.splice(indexPad, 1)
										}
									})
									multi.hset('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
								}
								if (type === 'pad-rejoint') {
									multi.srem('pads-rejoints:' + identifiant, pad)
								}
								if (type === 'pad-admin') {
									multi.srem('pads-rejoints:' + identifiant, pad)
									multi.srem('pads-admins:' + identifiant, pad)
								}
								multi.srem('pads-favoris:' + identifiant, pad)
								multi.exec(function () {
									// Suppression de l'utilisateur dans la liste des admins du pad
									if (type === 'pad-admin') {
										db.hgetall('pads:' + pad, function (err, donnees) {
											let listeAdmins = []
											if (donnees.hasOwnProperty('admins')) {
												listeAdmins = JSON.parse(donnees.admins)
											}
											const index = listeAdmins.indexOf(identifiant)
											if (index > -1) {
												listeAdmins.splice(index, 1)
											}
											db.hset('pads:' + pad, 'admins', JSON.stringify(listeAdmins), function () {
												res.send('pad_supprime')
											})
										})
									} else {
										res.send('pad_supprime')
									}
								})
							})
						}
					})
				} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
					const donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
					if (typeof donneesPad === 'object' && donneesPad !== null) {
						const multi = db.multi()
						if (donneesPad.identifiant === identifiant) {
							multi.srem('pads-crees:' + identifiant, pad)
							multi.smembers('utilisateurs-pads:' + pad, function (err, utilisateurs) {
								if (err) { res.send('erreur_suppression'); return false }
								for (let j = 0; j < utilisateurs.length; j++) {
									db.srem('pads-rejoints:' + utilisateurs[j], pad)
									db.srem('pads-utilisateurs:' + utilisateurs[j], pad)
									db.srem('pads-admins:' + utilisateurs[j], pad)
									db.srem('pads-favoris:' + utilisateurs[j], pad)
									db.hdel('couleurs:' + utilisateurs[j], 'pad' + pad)
								}
							})
							multi.del('utilisateurs-pads:' + pad)
							multi.exec(async function () {
								if (suppressionFichiers === true) {
									await fs.remove(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad))
								}
								await fs.remove(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
								await fs.remove(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
								res.send('pad_supprime')
							})
						} else {
							db.hgetall('utilisateurs:' + identifiant, function (err, donnees) {
								if (err) { res.send('erreur_suppression'); return false }
								if (donnees.hasOwnProperty('dossiers')) {
									const dossiers = JSON.parse(donnees.dossiers)
									dossiers.forEach(function (dossier, indexDossier) {
										if (dossier.pads.includes(pad)) {
											const indexPad = dossier.pads.indexOf(pad)
											dossiers[indexDossier].pads.splice(indexPad, 1)
										}
									})
									multi.hset('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
								}
								if (type === 'pad-rejoint') {
									multi.srem('pads-rejoints:' + identifiant, pad)
								}
								if (type === 'pad-admin') {
									multi.srem('pads-rejoints:' + identifiant, pad)
									multi.srem('pads-admins:' + identifiant, pad)
								}
								multi.srem('pads-favoris:' + identifiant, pad)
								multi.exec(function () {
									// Suppression de l'utilisateur dans la liste des admins du pad
									if (type === 'pad-admin') {
										db.hgetall('pads:' + pad, function (err, donnees) {
											if (!err && donnees) {
												let listeAdmins = []
												if (donnees.hasOwnProperty('admins')) {
													listeAdmins = JSON.parse(donnees.admins)
												}
												const index = listeAdmins.indexOf(identifiant)
												if (index > -1) {
													listeAdmins.splice(index, 1)
												}
												db.hset('pads:' + pad, 'admins', JSON.stringify(listeAdmins), function () {
													res.send('pad_supprime')
												})
											} else {
												res.send('pad_supprime')
											}
										})
									} else {
										res.send('pad_supprime')
									}
								})
							})
						}
					} else {
						res.send('erreur_suppression')
					}
				}
			})
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/modifier-informations', function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const nom = req.body.nom
			const email = req.body.email
			db.hmset('utilisateurs:' + identifiant, 'nom', nom, 'email', email)
			req.session.nom = nom
			req.session.email = email
			res.send('utilisateur_modifie')
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/modifier-mot-de-passe', function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant) {
			db.hgetall('utilisateurs:' + identifiant, async function (err, donnees) {
				if (err) { res.send('erreur'); return false }
				const motdepasse = req.body.motdepasse
				const nouveaumotdepasse = req.body.nouveaumotdepasse
				if (motdepasse.trim() !== '' && nouveaumotdepasse.trim() !== '' && donnees.hasOwnProperty('motdepasse') && donnees.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donnees.motdepasse)) {
					const hash = await bcrypt.hash(nouveaumotdepasse, 10)
					db.hset('utilisateurs:' + identifiant, 'motdepasse', hash)
					res.send('motdepasse_modifie')
				} else {
					res.send('motdepasse_incorrect')
				}
			})
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/verifier-mot-de-passe-admin', function (req, res) {
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.VITE_ADMIN_PASSWORD) {
			res.send('acces_verifie')
		} else {
			res.send('acces_invalide')
		}
	})

	app.post('/api/modifier-mot-de-passe-admin', function (req, res) {
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.VITE_ADMIN_PASSWORD) {
			const identifiant = req.body.identifiant
			const email = req.body.email
			if (identifiant !== '') {
				db.exists('utilisateurs:' + identifiant, async function (err, resultat) {
					if (err) { res.send('erreur'); return false }
					if (resultat === 1) {
						const hash = await bcrypt.hash(req.body.motdepasse, 10)
						db.hset('utilisateurs:' + identifiant, 'motdepasse', hash)
						res.send('motdepasse_modifie')
					} else {
						res.send('identifiant_non_valide')
					}
				})
			} else if (email !== '') {
				db.keys('utilisateurs:*', function (err, utilisateurs) {
					if (utilisateurs !== null) {
						const donneesUtilisateurs = []
						utilisateurs.forEach(function (utilisateur) {
							const donneesUtilisateur = new Promise(function (resolve) {
								db.hgetall('utilisateurs:' + utilisateur.substring(13), function (err, donnees) {
									if (err) { resolve({}); return false }
									if (donnees.hasOwnProperty('email')) {
										resolve({ identifiant: utilisateur.substring(13), email: donnees.email })
									} else {
										resolve({})
									}
								})
							})
							donneesUtilisateurs.push(donneesUtilisateur)
						})
						Promise.all(donneesUtilisateurs).then(async function (donnees) {
							let utilisateurId = ''
							donnees.forEach(function (utilisateur) {
								if (utilisateur.hasOwnProperty('email') && utilisateur.email.toLowerCase() === email.toLowerCase()) {
									utilisateurId = utilisateur.identifiant
								}
							})
							if (utilisateurId !== '') {
								const hash = await bcrypt.hash(req.body.motdepasse, 10)
								db.hset('utilisateurs:' + utilisateurId, 'motdepasse', hash)
								res.send(utilisateurId)
							} else {
								res.send('email_non_valide')
							}
						})
					}
				})
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/recuperer-donnees-pad-admin', function (req, res) {
		const pad = req.body.padId
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.VITE_ADMIN_PASSWORD) {
			db.exists('pads:' + pad, async function (err, resultat) {
				if (err) { res.send('erreur'); return false }
				if (resultat === 1) {
					db.hgetall('pads:' + pad, function (err, donneesPad) {
						if (err) { res.send('erreur'); return false }
						res.json(donneesPad)
					})
				} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
					const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
					if (typeof donnees === 'object' && donnees !== null) {
						res.json(donnees)
					} else {
						res.send('erreur')
					}
				} else {
					res.send('pad_inexistant')
				}
			})
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/modifier-donnees-pad-admin', function (req, res) {
		const pad = req.body.padId
		const champ = req.body.champ
		const valeur = req.body.valeur
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.VITE_ADMIN_PASSWORD) {
			db.exists('pads:' + pad, async function (err, resultat) {
				if (err) { res.send('erreur'); return false }
				if (resultat === 1) {
					if (champ === 'motdepasse') {
						const hash = await bcrypt.hash(valeur, 10)
						db.hset('pads:' + pad, champ, hash)
					} else {
						db.hset('pads:' + pad, champ, valeur)
					}
					res.send('donnees_modifiees')
				} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
					const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
					if (typeof donnees === 'object' && donnees !== null) {
						await ajouterPadDansDb(pad, donnees)
						if (champ === 'motdepasse') {
							const hash = await bcrypt.hash(valeur, 10)
							db.hset('pads:' + pad, champ, hash)
						} else {
							db.hset('pads:' + pad, champ, valeur)
						}
						res.send('donnees_modifiees')
					} else {
						res.send('erreur')
					}
				} else {
					res.send('pad_inexistant')
				}
			})
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/rattacher-pad', function (req, res) {
		const pad = req.body.padId
		const identifiant = req.body.identifiant
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.VITE_ADMIN_PASSWORD) {
			db.exists('utilisateurs:' + identifiant, function (err, reponse) {
				if (err) { res.send('erreur'); return false  }
				if (reponse === 1) {
					db.exists('pads:' + pad, async function (err, resultat) {
						if (err) { res.send('erreur'); return false  }
						if (resultat === 1) {
							db.hgetall('pads:' + pad, function (err, donnees) {
								if (err || !donnees || donnees === null) { res.send('erreur'); return false }
								if (donnees.hasOwnProperty('motdepasse')) {
									const multi = db.multi()
									multi.sadd('pads-crees:' + identifiant, pad)
									multi.sadd('utilisateurs-pads:' + pad, identifiant)
									multi.hset('pads:' + pad, 'identifiant', identifiant)
									multi.hdel('pads:' + pad, 'motdepasse')
									multi.srem('pads-rejoints:' + identifiant, pad)
									multi.srem('pads-utilisateurs:' + identifiant, pad)
									multi.exec(function () {
										res.send('pad_transfere')
									})
								} else {
									res.send('pad_cree_avec_compte')
								}
							})
						} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
							const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
							if (typeof donnees === 'object' && donnees !== null) {
								if (donnees.hasOwnProperty('motdepasse')) {
									await ajouterPadDansDb(pad, donnees)
									const multi = db.multi()
									multi.sadd('pads-crees:' + identifiant, pad)
									multi.sadd('utilisateurs-pads:' + pad, identifiant)
									multi.hset('pads:' + pad, 'identifiant', identifiant)
									multi.hdel('pads:' + pad, 'motdepasse')
									multi.srem('pads-rejoints:' + identifiant, pad)
									multi.srem('pads-utilisateurs:' + identifiant, pad)
									multi.exec(function () {
										res.send('pad_transfere')
									})
								} else {
									res.send('pad_cree_avec_compte')
								}
							} else {
								res.send('erreur')
							}
						} else {
							res.send('pad_inexistant')
						}
					})
				} else {
					res.send('utilisateur_inexistant')
				}
			})
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/transferer-compte', function (req, res) {
		const identifiant = req.body.identifiant
		const nouvelIdentifiant = req.body.nouvelIdentifiant
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.VITE_ADMIN_PASSWORD) {
			db.exists('utilisateurs:' + identifiant, function (err, reponse) {
				if (err) { res.send('erreur'); return false  }
				if (reponse === 1) {
					db.exists('utilisateurs:' + nouvelIdentifiant, function (err, resultat) {
						if (err) { res.send('erreur'); return false  }
						if (resultat === 1) {
							db.smembers('pads-crees:' + identifiant, function (err, pads) {
								if (err) { res.send('erreur'); return false }
								const donneesPads = []
								for (const pad of pads) {
									const donneesPad = new Promise(function (resolve) {
										db.exists('pads:' + pad, async function (err, resultat) {
											if (err) { resolve('erreur'); return false  }
											if (resultat === 1) {
												const multi = db.multi()
												multi.sadd('pads-crees:' + nouvelIdentifiant, pad)
												multi.srem('pads-crees:' + identifiant, pad)
												multi.sadd('utilisateurs-pads:' + pad, nouvelIdentifiant)
												multi.srem('utilisateurs-pads:' + pad, identifiant)
												multi.hset('pads:' + pad, 'identifiant', nouvelIdentifiant)
												multi.srem('pads-admins:' + nouvelIdentifiant, pad)
												multi.srem('pads-rejoints:' + nouvelIdentifiant, pad)
												multi.srem('pads-utilisateurs:' + nouvelIdentifiant, pad)
												multi.exec(function () {
													resolve('pad_transfere')
												})
											} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
												const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
												if (typeof donnees === 'object' && donnees !== null) {
													await ajouterPadDansDb(pad, donnees)
													const multi = db.multi()
													multi.sadd('pads-crees:' + nouvelIdentifiant, pad)
													multi.srem('pads-crees:' + identifiant, pad)
													multi.sadd('utilisateurs-pads:' + pad, nouvelIdentifiant)
													multi.srem('utilisateurs-pads:' + pad, identifiant)
													multi.hset('pads:' + pad, 'identifiant', nouvelIdentifiant)
													multi.srem('pads-admins:' + nouvelIdentifiant, pad)
													multi.srem('pads-rejoints:' + nouvelIdentifiant, pad)
													multi.srem('pads-utilisateurs:' + nouvelIdentifiant, pad)
													multi.exec(function () {
														resolve('pad_transfere')
													})
												} else {
													resolve('erreur')
												}
											} else {
												resolve('mur_inexistant')
											}
										})
									})
									donneesPads.push(donneesPad)
								}
								Promise.all(donneesPads).then(function () {
									res.send('compte_transfere')
								})
							})
						} else {
							res.send('utilisateur_inexistant')
						}
					})
				} else {
					res.send('utilisateur_inexistant')
				}
			})
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/supprimer-compte', function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		const identifiant = req.body.identifiant
		const admin = req.body.admin
		const motdepasseAdmin = process.env.VITE_ADMIN_PASSWORD
		let type = 'utilisateur'
		if ((req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') || (admin !== '' && admin === motdepasseAdmin)) {
			if (admin === motdepasseAdmin) {
				type === 'admin'
			}
			db.smembers('pads-crees:' + identifiant, function (err, pads) {
				if (err) { res.send('erreur'); return false }
				const donneesPads = []
				for (const pad of pads) {
					const donneesPad = new Promise(function (resolve) {
						db.exists('pads:' + pad, async function (err, resultat) {
							if (err) { resolve(); return false }
							if (resultat === 1) {
								db.zrange('blocs:' + pad, 0, -1, function (err, blocs) {
									if (err) { resolve(); return false }
									const multi = db.multi()
									for (let i = 0; i < blocs.length; i++) {
										multi.del('commentaires:' + blocs[i])
										multi.del('evaluations:' + blocs[i])
										multi.del('pad-' + pad + ':' + blocs[i])
									}
									multi.del('blocs:' + pad)
									multi.del('pads:' + pad)
									multi.del('activite:' + pad)
									multi.del('dates-pads:' + pad)
									multi.smembers('utilisateurs-pads:' + pad, function (err, utilisateurs) {
										if (err) { resolve(); return false }
										for (let j = 0; j < utilisateurs.length; j++) {
											db.srem('pads-rejoints:' + utilisateurs[j], pad)
											db.srem('pads-utilisateurs:' + utilisateurs[j], pad)
											db.srem('pads-admins:' + utilisateurs[j], pad)
											db.srem('pads-favoris:' + utilisateurs[j], pad)
											db.hdel('couleurs:' + utilisateurs[j], 'pad' + pad)
										}
									})
									multi.del('utilisateurs-pads:' + pad)
									multi.exec(async function () {
										const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad)
										await fs.remove(chemin)
										resolve(pad)
									})
								})
							} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
								const multi = db.multi()
								multi.smembers('utilisateurs-pads:' + pad, function (err, utilisateurs) {
									if (err) { resolve(); return false }
									for (let j = 0; j < utilisateurs.length; j++) {
										db.srem('pads-rejoints:' + utilisateurs[j], pad)
										db.srem('pads-utilisateurs:' + utilisateurs[j], pad)
										db.srem('pads-admins:' + utilisateurs[j], pad)
										db.srem('pads-favoris:' + utilisateurs[j], pad)
										db.hdel('couleurs:' + utilisateurs[j], 'pad' + pad)
									}
								})
								multi.del('utilisateurs-pads:' + pad)
								multi.exec(async function () {
									await fs.remove(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad))
									await fs.remove(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
									await fs.remove(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
									resolve(pad)
								})
							} else {
								resolve()
							}
						})
					})
					donneesPads.push(donneesPad)
				}
				Promise.all(donneesPads).then(function () {
					db.smembers('pads-utilisateurs:' + identifiant, function (err, pads) {
						if (err) { res.send('erreur'); return false }
						const donneesBlocs = []
						const donneesActivites = []
						const donneesCommentaires = []
						const donneesEvaluations = []
						for (const pad of pads) {
							db.exists('pads:' + pad, async function (err, resultat) {
								if (resultat === 1) {
									const donneesBloc = new Promise(function (resolve) {
										db.zrange('blocs:' + pad, 0, -1, function (err, blocs) {
											if (err) { resolve(); return false }
											for (let i = 0; i < blocs.length; i++) {
												db.hgetall('pad-' + pad + ':' + blocs[i], function (err, donnees) {
													if (err) { resolve(); return false }
													if (donnees.hasOwnProperty('identifiant') && donnees.identifiant === identifiant) {
														if (donnees.hasOwnProperty('media') && donnees.media !== '' && donnees.type !== 'embed') {
															supprimerFichier(pad, donnees.media)
														}
														if (donnees.hasOwnProperty('vignette') && donnees.vignette !== '' && !donnees.vignette.includes('/img/') && !verifierURL(donnees.vignette, ['https', 'http'])) {
															supprimerFichier(pad, path.basename(donnees.vignette))
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
											if (err) { resolve(); return false }
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
													if (err) { resolve(); return false }
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
											if (err) { resolve(); return false }
											for (let i = 0; i < blocs.length; i++) {
												db.zrange('evaluations:' + blocs[i], 0, -1, function (err, evaluations) {
													if (err) { resolve(); return false }
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
								} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
									const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
									if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite')) {
										const blocs = donnees.blocs
										const entrees = donnees.activite
										const donneesBloc = new Promise(function (resolve) {
											for (let i = 0; i < blocs.length; i++) {
												if (blocs[i].identifiant === identifiant) {
													if (blocs[i].hasOwnProperty('media') && blocs[i].media !== '' && blocs[i].type !== 'embed') {
														supprimerFichier(pad, blocs[i].media)
													}
													if (blocs[i].hasOwnProperty('vignette') && blocs[i].vignette !== '' && !blocs[i].vignette.includes('/img/') && !verifierURL(blocs[i].vignette, ['https', 'http'])) {
														supprimerFichier(pad, path.basename(blocs[i].vignette))
													}
													const multi = db.multi()
													multi.del('pad-' + pad + ':' + blocs[i].bloc)
													multi.zrem('blocs:' + pad, blocs[i].bloc)
													multi.del('commentaires:' + blocs[i].bloc)
													multi.del('evaluations:' + blocs[i].bloc)
													multi.exec(function () {
														resolve(blocs[i].bloc)
													})
												} else {
													resolve(blocs[i].bloc)
												}
											}
										})
										donneesBlocs.push(donneesBloc)
										const donneesActivite = new Promise(function (resolve) {
											for (let i = 0; i < entrees.length; i++) {
												if (entrees[i].identifiant === identifiant) {
													db.zremrangebyscore('activite:' + pad, entrees[i].id, entrees[i].id, function () {
														resolve(entrees[i].id)
													})
												} else {
													resolve(entrees[i].id)
												}
											}
										})
										donneesActivites.push(donneesActivite)
										const donneesCommentaire = new Promise(function (resolve) {
											for (let i = 0; i < blocs.length; i++) {
												db.zrange('commentaires:' + blocs[i].bloc, 0, -1, function (err, commentaires) {
													if (err) { resolve(); return false }
													for (let j = 0; j < commentaires.length; j++) {
														const commentaire = JSON.parse(commentaires[j])
														if (commentaire.identifiant === identifiant) {
															db.zremrangebyscore('commentaires:' + blocs[i].bloc, commentaire.id, commentaire.id, function () {
																resolve(commentaire.id)
															})
														} else {
															resolve(commentaire.id)
														}
													}
												})
											}
										})
										donneesCommentaires.push(donneesCommentaire)
										const donneesEvaluation = new Promise(function (resolve) {
											for (let i = 0; i < blocs.length; i++) {
												db.zrange('evaluations:' + blocs[i].bloc, 0, -1, function (err, evaluations) {
													if (err) { resolve(); return false }
													for (let j = 0; j < evaluations.length; j++) {
														const evaluation = JSON.parse(evaluations[j])
														if (evaluation.identifiant === identifiant) {
															db.zremrangebyscore('evaluations:' + blocs[i].bloc, evaluation.id, evaluation.id, function () {
																resolve(evaluation.id)
															})
														} else {
															resolve(evaluation.id)
														}
													}
												})
											}
										})
										donneesEvaluations.push(donneesEvaluation)
									}
								}
							})
						}
						Promise.all([donneesBlocs, donneesActivites, donneesCommentaires, donneesEvaluations]).then(function () {
							const multi = db.multi()
							multi.del('pads-crees:' + identifiant)
							multi.del('pads-rejoints:' + identifiant)
							multi.del('pads-favoris:' + identifiant)
							multi.del('pads-admins:' + identifiant)
							multi.del('pads-utilisateurs:' + identifiant)
							multi.del('utilisateurs:' + identifiant)
							multi.del('couleurs:' + identifiant)
							multi.del('noms:' + identifiant)
							multi.exec(function () {
								if (type === 'utilisateur') {
									req.session.identifiant = ''
									req.session.nom = ''
									req.session.email = ''
									req.session.langue = ''
									req.session.statut = ''
									req.session.destroy()
									res.send('compte_supprime')
								} else {
									db.keys('sessions:*', function (err, sessions) {
										if (sessions !== null) {
											const donneesSessions = []
											sessions.forEach(function (session) {
												const donneesSession = new Promise(function (resolve) {
													db.get('sessions:' + session.substring(9), function (err, donnees) {
														if (err || !donnees || donnees === null) { resolve({}); return false }
														donnees = JSON.parse(donnees)
														if (donnees.hasOwnProperty('identifiant')) {
															resolve({ session: session.substring(9), identifiant: donnees.identifiant })
														} else {
															resolve({})
														}
													})
												})
												donneesSessions.push(donneesSession)
											})
											Promise.all(donneesSessions).then(function (donnees) {
												let sessionId = ''
												donnees.forEach(function (item) {
													if (item.hasOwnProperty('identifiant') && item.identifiant === identifiant) {
														sessionId = item.session
													}
												})
												if (sessionId !== '') {
													db.del('sessions:' + sessionId)
												}
												res.send('compte_supprime')
											})
										}
									})
								}
							})
						})
					})
				})
			})
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/verifier-identifiant', function (req, res) {
		const identifiant = req.body.identifiant
		db.exists('utilisateurs:' + identifiant, function (err, resultat) {
			if (err) { res.send('erreur'); return false }
			if (resultat === 1) {
				res.send('identifiant_valide')
			} else {
				res.send('identifiant_non_valide')
			}
		})
	})

	app.post('/api/verifier-mot-de-passe', function (req, res) {
		const pad = req.body.pad
		db.hgetall('pads:' + pad, async function (err, donnees) {
			if (err || !donnees || donnees === null || !donnees.hasOwnProperty('motdepasse')) { res.send('erreur'); return false }
			if (req.body.motdepasse.trim() !== '' && donnees.hasOwnProperty('motdepasse') && donnees.motdepasse.trim() !== '' && await bcrypt.compare(req.body.motdepasse, donnees.motdepasse)) {
				res.send('motdepasse_correct')
			} else {
				res.send('motdepasse_incorrect')
			}
		})
	})

	app.post('/api/verifier-code-acces', function (req, res) {
		const pad = req.body.pad
		const identifiant = req.body.identifiant
		const code = req.body.code
		db.hgetall('pads:' + pad, async function (err, donnees) {
			if (err || !donnees || donnees === null || !donnees.hasOwnProperty('code')) { res.send('erreur'); return false }
			if (code === donnees.code) {
				const donneesPad = await recupererDonneesPadProtege(donnees, pad, identifiant)
				if (!req.session.hasOwnProperty('acces')) {
					req.session.acces = []
				}
				let padAcces = false
				req.session.acces.forEach(function (acces) {
					if (acces.pad === pad) {
						padAcces = true
					}
				})
				if (padAcces) {
					req.session.acces.forEach(function (acces, index) {
						if (acces.pad === pad) {
							req.session.acces[index].code = code
						}
					})
				} else {
					req.session.acces.push({ code: code, pad: pad })
				}
				res.send({ pad: donneesPad.pad, blocs: donneesPad.blocs, activite: donneesPad.activite.reverse() })
			} else {
				res.send('code_incorrect')
			}
		})
	})

	app.post('/api/modifier-langue', function (req, res) {
		const identifiant = req.body.identifiant
		const langue = req.body.langue
		if (req.session.identifiant && req.session.identifiant === identifiant) {
			db.hset('utilisateurs:' + identifiant, 'langue', langue)
			req.session.langue = langue
		} else {
			req.session.langue = langue
		}
		res.send('langue_modifiee')
	})

	app.post('/api/modifier-affichage', function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const affichage = req.body.affichage
			db.hset('utilisateurs:' + identifiant, 'affichage', affichage)
			res.send('affichage_modifie')
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/modifier-classement', function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const classement = req.body.classement
			db.hset('utilisateurs:' + identifiant, 'classement', classement)
			req.session.classement = classement
			res.send('classement_modifie')
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/ajouter-dossier', function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const nom = req.body.dossier
			db.hgetall('utilisateurs:' + identifiant, function (err, donnees) {
				if (err) { res.send('erreur_ajout_dossier'); return false }
				let dossiers = []
				if (donnees.hasOwnProperty('dossiers')) {
					dossiers = JSON.parse(donnees.dossiers)
				}
				const id = Math.random().toString(36).substring(2)
				dossiers.push({ id: id, nom: nom, pads: [] })
				db.hset('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers), function (err) {
					if (err) { res.send('erreur_ajout_dossier'); return false }
					res.json({ id: id, nom: nom, pads: [] })
				})
			})
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/modifier-dossier', function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const nom = req.body.dossier
			const dossierId = req.body.dossierId
			db.hgetall('utilisateurs:' + identifiant, function (err, donnees) {
				if (err) { res.send('erreur_modification_dossier'); return false }
				const dossiers = JSON.parse(donnees.dossiers)
				dossiers.forEach(function (dossier, index) {
					if (dossier.id === dossierId) {
						dossiers[index].nom = nom
					}
				})
				db.hset('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers), function (err) {
					if (err) { res.send('erreur_modification_dossier'); return false }
					res.send('dossier_modifie')
				})
			})
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/supprimer-dossier', function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const dossierId = req.body.dossierId
			db.hgetall('utilisateurs:' + identifiant, function (err, donnees) {
				if (err) { res.send('erreur_suppression_dossier'); return false }
				const dossiers = JSON.parse(donnees.dossiers)
				dossiers.forEach(function (dossier, index) {
					if (dossier.id === dossierId) {
						dossiers.splice(index, 1)
					}
				})
				db.hset('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers), function (err) {
					if (err) { res.send('erreur_suppression_dossier'); return false }
					res.send('dossier_supprime')
				})
			})
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/televerser-fichier', function (req, res) {
		const identifiant = req.session.identifiant
		if (!identifiant) {
			res.send('non_connecte')
		} else {
			televerserTemp(req, res, async function (err) {
				if (err === 'erreur_espace_disque') { res.send('erreur_espace_disque'); return false }
				else if (err) { res.send('erreur_televersement'); return false }
				const fichier = req.file
				if (fichier.hasOwnProperty('mimetype') && fichier.hasOwnProperty('filename')) {
					let mimetype = fichier.mimetype
					const chemin = path.join(__dirname, '..', '/static/temp/' + fichier.filename)
					const destination = path.join(__dirname, '..', '/static/temp/' + path.parse(fichier.filename).name + '.jpg')
					const destinationPDF = path.join(__dirname, '..', '/static/temp/' + path.parse(fichier.filename).name + '.pdf')
					if (mimetype.split('/')[0] === 'image') {
						const extension = path.parse(fichier.filename).ext
						if (extension.toLowerCase() === '.jpg' || extension.toLowerCase() === '.jpeg') {
							sharp(chemin).withMetadata().rotate().jpeg().resize(1200, 1200, {
								fit: sharp.fit.inside,
								withoutEnlargement: true
							}).toBuffer((err, buffer) => {
								if (err) { res.send('erreur_televersement'); return false }
								fs.writeFile(chemin, buffer, function() {
									res.json({ fichier: fichier.filename, mimetype: mimetype })
								})
							})
						} else if (extension.toLowerCase() !== '.gif') {
							sharp(chemin).withMetadata().resize(1200, 1200, {
								fit: sharp.fit.inside,
								withoutEnlargement: true
							}).toBuffer((err, buffer) => {
								if (err) { res.send('erreur_televersement'); return false }
								fs.writeFile(chemin, buffer, function() {
									res.json({ fichier: fichier.filename, mimetype: mimetype })
								})
							})
						} else {
							res.json({ fichier: fichier.filename, mimetype: mimetype })
						}
					} else if (mimetype === 'application/pdf') {
						gm(chemin + '[0]').setFormat('jpg').resize(450).quality(80).write(destination, function (erreur) {
							if (erreur) {
								res.json({ fichier: fichier.filename, mimetype: 'pdf', vignetteGeneree: false })
							} else {
								res.json({ fichier: fichier.filename, mimetype: 'pdf', vignetteGeneree: true })
							}
						})
					} else if (mimetype === 'application/vnd.oasis.opendocument.presentation' || mimetype === 'application/vnd.oasis.opendocument.text' || mimetype === 'application/vnd.oasis.opendocument.spreadsheet') {
						mimetype = 'document'
						const docBuffer = await fs.readFile(chemin)
						let pdfBuffer
						try {
							pdfBuffer = await libre.convertAsync(docBuffer, '.pdf', undefined)
						} catch (err) {
							pdfBuffer = 'erreur'
						}
						if (pdfBuffer && pdfBuffer !== 'erreur') {
							await fs.writeFile(destinationPDF, pdfBuffer)
							if (await fs.pathExists(destinationPDF)) {
								gm(destinationPDF + '[0]').setFormat('jpg').resize(450).quality(80).write(destination, async function (erreur) {
									await fs.remove(destinationPDF)
									if (erreur) {
										res.json({ fichier: fichier.filename, mimetype: mimetype, vignetteGeneree: false })
									} else {
										res.json({ fichier: fichier.filename, mimetype: mimetype, vignetteGeneree: true })
									}
								})
							} else {
								res.json({ fichier: fichier.filename, mimetype: mimetype, vignetteGeneree: false })
							}
						} else {
							res.json({ fichier: fichier.filename, mimetype: mimetype, vignetteGeneree: false })
						}
					} else if (mimetype === 'application/msword' || mimetype === 'application/vnd.ms-powerpoint' || mimetype === 'application/vnd.ms-excel' || mimetype.includes('officedocument') === true) {
						mimetype = 'office'
						const docBuffer = await fs.readFile(chemin)
						let pdfBuffer
						try {
							pdfBuffer = await libre.convertAsync(docBuffer, '.pdf', undefined)
						} catch (err) {
							pdfBuffer = 'erreur'
						}
						if (pdfBuffer && pdfBuffer !== 'erreur') {
							await fs.writeFile(destinationPDF, pdfBuffer)
							if (await fs.pathExists(destinationPDF)) {
								gm(destinationPDF + '[0]').setFormat('jpg').resize(450).quality(80).write(destination, async function (erreur) {
									await fs.remove(destinationPDF)
									if (erreur) {
										res.json({ fichier: fichier.filename, mimetype: mimetype, vignetteGeneree: false })
									} else {
										res.json({ fichier: fichier.filename, mimetype: mimetype, vignetteGeneree: true })
									}
								})
							} else {
								res.json({ fichier: fichier.filename, mimetype: mimetype, vignetteGeneree: false })
							}
						} else {
							res.json({ fichier: fichier.filename, mimetype: mimetype, vignetteGeneree: false })
						}
					} else {
						res.json({ fichier: fichier.filename, mimetype: mimetype })
					}
				} else {
					res.send('erreur_televersement')
				}
			})
		}
	})

	app.post('/api/televerser-audio', function (req, res) {
		const identifiant = req.session.identifiant
		if (!identifiant) {
			res.send('non_connecte')
		} else {
			televerser(req, res, function (err) {
				if (err === 'erreur_espace_disque') { res.send('erreur_espace_disque'); return false }
				else if (err) { res.send('erreur_televersement'); return false }
				const fichier = req.file
				res.send(fichier.filename)
			})
		}
	})

	app.post('/api/televerser-vignette', function (req, res) {
		const identifiant = req.session.identifiant
		if (!identifiant) {
			res.send('non_connecte')
		} else {
			televerserTemp(req, res, function (err) {
				if (err === 'erreur_espace_disque') { res.send('erreur_espace_disque'); return false }
				else if (err) { res.send('erreur_televersement'); return false }
				const fichier = req.file
				const chemin = path.join(__dirname, '..', '/static/temp/' + fichier.filename)
				const extension = path.parse(fichier.filename).ext
				if (extension.toLowerCase() === '.jpg' || extension.toLowerCase() === '.jpeg') {
					sharp(chemin).withMetadata().rotate().jpeg().resize(400, 400, {
						fit: sharp.fit.inside,
						withoutEnlargement: true
					}).toBuffer((err, buffer) => {
						if (err) { res.send('erreur_televersement'); return false }
						fs.writeFile(chemin, buffer, function() {
							res.send('/temp/' + fichier.filename)
						})
					})
				} else {
					sharp(chemin).withMetadata().resize(400, 400, {
						fit: sharp.fit.inside,
						withoutEnlargement: true
					}).toBuffer((err, buffer) => {
						if (err) { res.send('erreur_televersement'); return false }
						fs.writeFile(chemin, buffer, function() {
							res.send('/temp/' + fichier.filename)
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
			televerser(req, res, function (err) {
				if (err === 'erreur_espace_disque') { res.send('erreur_espace_disque'); return false }
				else if (err) { res.send('erreur_televersement'); return false }
				const fichier = req.file
				const pad = req.body.pad
				const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad + '/' + fichier.filename)
				const extension = path.parse(fichier.filename).ext
				if (extension.toLowerCase() === '.jpg' || extension.toLowerCase() === '.jpeg') {
					sharp(chemin).withMetadata().rotate().jpeg().resize(1200, 1200, {
						fit: sharp.fit.inside,
						withoutEnlargement: true
					}).toBuffer((err, buffer) => {
						if (err) { res.send('erreur_televersement'); return false }
						fs.writeFile(chemin, buffer, function() {
							res.send('/' + definirDossierFichiers(pad) + '/' + pad + '/' + fichier.filename)
						})
					})
				} else {
					sharp(chemin).withMetadata().resize(1200, 1200, {
						fit: sharp.fit.inside,
						withoutEnlargement: true
					}).toBuffer((err, buffer) => {
						if (err) { res.send('erreur_televersement'); return false }
						fs.writeFile(chemin, buffer, function() {
							res.send('/' + definirDossierFichiers(pad) + '/' + pad + '/' + fichier.filename)
						})
					})
				}
			})
		}
	})

	app.post('/api/recuperer-icone', async function (req, res) {
		const identifiant = req.session.identifiant
		if (!identifiant) {
			res.send('erreur')
		} else {
			let favicon = ''
			const domaine = req.body.domaine
			const protocole = req.body.protocole
			axios.get(protocole + '//' + domaine, { 
				responseType: 'document'
			}).then(function (reponse) {
				if (reponse && reponse.hasOwnProperty('data')) {
					const $ = cheerio.load(reponse.data)
					const recupererTaille = function (el) {
						return (el.attribs.sizes && parseInt(el.attribs.sizes, 10)) || 0
					}
					let favicons = [
						...$('meta[property="og:image"]')
					]
					if (favicons.length > 0 && favicons[0].hasOwnProperty('attribs')) {
						favicon = favicons[0].attribs.content
					} else {
						favicons = [
							...$('link[rel="shortcut icon"], link[rel="icon"], link[rel="apple-touch-icon"]')
						].sort((a, b) => {
							return recupererTaille(b) - recupererTaille(a)
						})
						if (favicons.length > 0 && favicons[0].hasOwnProperty('attribs')) {
							favicon = favicons[0].attribs.href
						}
					}
					if (favicon !== '' && verifierURL(favicon, ['https', 'http']) === true) {
						res.send(favicon)
					} else if (favicon !== '' && favicon.substring(0, 2) === './') {
						res.send(protocole + '//' + domaine + favicon.substring(1))
					} else if (favicon !== '' && favicon.substring(0, 1) === '/') {
						res.send(protocole + '//' + domaine + favicon)
					} else if (favicon !== '') {
						res.send(protocole + '//' + domaine + '/' + favicon)
					} else {
						res.send(favicon)
					}
				} else {
					res.send(favicon)
				}
			}).catch(function () {
				res.send('erreur')
			})
		}
	})

	app.post('/api/ladigitale', function (req, res) {
		const tokenApi = req.body.token
		const domaine = req.headers.host
		const lien = req.body.lien
		const params = new URLSearchParams()
		params.append('token', tokenApi)
		params.append('domaine', domaine)
		axios.post(lien, params).then(async function (reponse) {
			if (reponse.data === 'non_autorise' || reponse.data === 'erreur') {
				res.send('erreur_token')
			} else if (reponse.data === 'token_autorise' && req.body.action && req.body.action === 'creer') {
				const identifiant = req.body.identifiant
				let nom = req.body.nomUtilisateur
				if (nom === '') {
					nom = genererPseudo()
				}
				const titre = req.body.nom
				const motdepasse = req.body.motdepasse
				const hash = await bcrypt.hash(motdepasse, 10)
				const token = Math.random().toString(16).slice(2)
				const date = dayjs().format()
				let langue = 'fr'
				if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
					langue = req.session.langue
				}
				db.exists('pad', async function (err, resultat) {
					if (err) { res.send('erreur'); return false }
					if (resultat === 1) {
						db.get('pad', async function (err, resultat) {
							if (err) { res.send('erreur'); return false }
							const id = parseInt(resultat) + 1
							const creation = await creerPadSansCompte(id, token, titre, hash, date, identifiant, nom, langue, 'api')
							if (creation === true) {
								const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id)
								await fs.mkdirs(chemin)
								res.send(id + '/' + token)
							} else {
								res.send('erreur_creation')
							}
						})
					} else {
						const creation = await creerPadSansCompte(1, token, titre, hash, date, identifiant, nom, langue, 'api')
						if (creation === true) {
							const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(1) + '/1')
							await fs.mkdirs(chemin)
							res.send('1/' + token)
						} else {
							res.send('erreur_creation')
						}
					}
				})
			} else if (reponse.data === 'token_autorise' && req.body.action && req.body.action === 'modifier-titre') {
				const pad = req.body.id
				const titre = req.body.titre
				db.hset('pads:' + pad, 'titre', titre, function (err) {
					if (err) { res.send('erreur'); return false }
					res.send('contenu_modifie')
				})
			} else if (reponse.data === 'token_autorise' && req.body.action && req.body.action === 'ajouter') {
				const identifiant = req.body.identifiant
				const pad = req.body.id
				const token = req.body.tokenContenu
				const motdepasse = req.body.motdepasse
				const nom = req.body.nomUtilisateur
				db.exists('pads:' + pad, async function (err, resultat) {
					if (err) { res.send('erreur'); return false }
					if (resultat === 1) {
						db.hgetall('pads:' + pad, async function (err, donneesPad) {
							if (err) { res.send('erreur'); return false }
							if (motdepasse.trim() !== '' && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donneesPad.motdepasse) && token === donneesPad.token) {
								const date = dayjs().format()
								let langue = 'fr'
								if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
									langue = req.session.langue
								}
								const multi = db.multi()
								multi.hmset('utilisateurs:' + identifiant, 'id', identifiant, 'date', date, 'nom', nom, 'langue', langue)
								multi.hset('pads:' + pad, 'identifiant', identifiant)
								multi.exec(function (err) {
									if (err) { res.send('erreur'); return false }
									res.json({ titre: donneesPad.titre, identifiant: identifiant })
								})
							} else if (!donneesPad.hasOwnProperty('motdepasse') && token === donneesPad.token) {
								db.exists('utilisateurs:' + donneesPad.identifiant, function (err, resultat) {
									if (err) { res.send('erreur'); return false }
									if (resultat === 1) {
										db.hgetall('utilisateurs:' + donneesPad.identifiant, async function (err, utilisateur) {
											if (err) { res.send('erreur'); return false }
											if (motdepasse.trim() !== '' && utilisateur.hasOwnProperty('motdepasse') && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
												res.json({ titre: donneesPad.titre, identifiant: donneesPad.identifiant })
											} else {
												res.send('non_autorise')
											}
										})
									} else {
										res.send('erreur')
									}
								})
							} else {
								res.send('non_autorise')
							}
						})
					} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
						const donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
						if (typeof donneesPad === 'object' && donneesPad !== null) {
							if (motdepasse.trim() !== '' && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donneesPad.motdepasse) && token === donneesPad.token) {
								const date = dayjs().format()
								let langue = 'fr'
								if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
									langue = req.session.langue
								}
								db.hmset('utilisateurs:' + identifiant, 'id', identifiant, 'date', date, 'nom', nom, 'langue', langue, async function (err) {
									if (err) { res.send('erreur'); return false }
									const chemin = path.join(__dirname, '..', '/static/pads')
									const donneesPadJSON = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
									if (typeof donneesPadJSON === 'object' && donneesPadJSON !== null && donneesPadJSON.hasOwnProperty('pad') && donneesPadJSON.hasOwnProperty('blocs') && donneesPadJSON.hasOwnProperty('activite')) {
										donneesPadJSON.pad.identifiant = identifiant
										fs.writeFile(path.normalize(chemin + '/' + pad + '.json'), JSON.stringify(donneesPadJSON, '', 4), 'utf8', function (err) {
											if (err) { res.send('erreur'); return false }
											donneesPad.identifiant = identifiant
											fs.writeFile(path.normalize(chemin + '/pad-' + pad + '.json'), JSON.stringify(donneesPad, '', 4), 'utf8', function (err) {
												if (err) { res.send('erreur'); return false }
												res.json({ titre: donneesPad.titre, identifiant: identifiant })
											})
										})
									} else {
										res.send('erreur')
									}
								})
							} else if (!donneesPad.hasOwnProperty('motdepasse') && token === donneesPad.token) {
								db.exists('utilisateurs:' + donneesPad.identifiant, function (err, resultat) {
									if (err) { res.send('erreur'); return false }
									if (resultat === 1) {
										db.hgetall('utilisateurs:' + donneesPad.identifiant, async function (err, utilisateur) {
											if (err) { res.send('erreur'); return false }
											if (motdepasse.trim() !== '' && utilisateur.hasOwnProperty('motdepasse') && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
												res.json({ titre: donneesPad.titre, identifiant: donneesPad.identifiant })
											} else {
												res.send('non_autorise')
											}
										})
									} else {
										res.send('erreur')
									}
								})
							} else {
								res.send('non_autorise')
							}
						} else {
							res.send('erreur')
						}
					} else {
						res.send('contenu_inexistant')
					}
				})
			} else if (reponse.data === 'token_autorise' && req.body.action && req.body.action === 'supprimer') {
				const identifiant = req.body.identifiant
				const pad = req.body.id
				const motdepasse = req.body.motdepasse
				db.exists('pads:' + pad, async function (err, resultat) {
					if (err) { res.send('erreur'); return false }
					if (resultat === 1) {
						db.hgetall('pads:' + pad, async function (err, donneesPad) {
							if (err) { res.send('erreur'); return false }
							if (motdepasse.trim() !== '' && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && donneesPad.identifiant === identifiant && await bcrypt.compare(motdepasse, donneesPad.motdepasse)) {
								db.zrange('blocs:' + pad, 0, -1, function (err, blocs) {
									if (err) { res.send('erreur'); return false }
									const multi = db.multi()
									for (let i = 0; i < blocs.length; i++) {
										multi.del('commentaires:' + blocs[i])
										multi.del('evaluations:' + blocs[i])
										multi.del('pad-' + pad + ':' + blocs[i])
									}
									multi.del('blocs:' + pad)
									multi.del('pads:' + pad)
									multi.del('activite:' + pad)
									multi.del('dates-pads:' + pad)
									multi.srem('pads-crees:' + identifiant, pad)
									multi.smembers('utilisateurs-pads:' + pad, function (err, utilisateurs) {
										if (err) { res.send('erreur'); return false }
										for (let j = 0; j < utilisateurs.length; j++) {
											db.srem('pads-rejoints:' + utilisateurs[j], pad)
											db.srem('pads-utilisateurs:' + utilisateurs[j], pad)
											db.srem('pads-admins:' + utilisateurs[j], pad)
											db.srem('pads-favoris:' + utilisateurs[j], pad)
											db.hdel('couleurs:' + utilisateurs[j], 'pad' + pad)
										}
									})
									multi.del('utilisateurs-pads:' + pad)
									multi.exec(async function () {
										const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad)
										await fs.remove(chemin)
										res.send('contenu_supprime')
									})
								})
							} else if (!donneesPad.hasOwnProperty('motdepasse') && donneesPad.identifiant === identifiant) {
								db.exists('utilisateurs:' + identifiant, function (err, resultat) {
									if (err) { res.send('erreur'); return false }
									if (resultat === 1) {
										db.hgetall('utilisateurs:' + identifiant, async function (err, utilisateur) {
											if (err) { res.send('erreur'); return false }
											if (motdepasse.trim() !== '' && utilisateur.hasOwnProperty('motdepasse') && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
												db.zrange('blocs:' + pad, 0, -1, function (err, blocs) {
													if (err) { res.send('erreur'); return false }
													const multi = db.multi()
													for (let i = 0; i < blocs.length; i++) {
														multi.del('commentaires:' + blocs[i])
														multi.del('evaluations:' + blocs[i])
														multi.del('pad-' + pad + ':' + blocs[i])
													}
													multi.del('blocs:' + pad)
													multi.del('pads:' + pad)
													multi.del('activite:' + pad)
													multi.del('dates-pads:' + pad)
													multi.srem('pads-crees:' + identifiant, pad)
													multi.smembers('utilisateurs-pads:' + pad, function (err, utilisateurs) {
														if (err) { res.send('erreur'); return false }
														for (let j = 0; j < utilisateurs.length; j++) {
															db.srem('pads-rejoints:' + utilisateurs[j], pad)
															db.srem('pads-utilisateurs:' + utilisateurs[j], pad)
															db.srem('pads-admins:' + utilisateurs[j], pad)
															db.srem('pads-favoris:' + utilisateurs[j], pad)
															db.hdel('couleurs:' + utilisateurs[j], 'pad' + pad)
														}
													})
													multi.del('utilisateurs-pads:' + pad)
													multi.exec(async function () {
														const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad)
														await fs.remove(chemin)
														res.send('contenu_supprime')
													})
												})
											} else {
												res.send('non_autorise')
											}
										})
									} else {
										res.send('erreur')
									}
								})
							} else {
								res.send('non_autorise')
							}
						})
					} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
						const donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
						if (typeof donneesPad === 'object' && donneesPad !== null) {
							if (motdepasse.trim() !== '' && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && donneesPad.identifiant === identifiant && await bcrypt.compare(motdepasse, donneesPad.motdepasse)) {
								const multi = db.multi()
								multi.srem('pads-crees:' + identifiant, pad)
								multi.smembers('utilisateurs-pads:' + pad, function (err, utilisateurs) {
									if (err) { res.send('erreur'); return false }
									for (let j = 0; j < utilisateurs.length; j++) {
										db.srem('pads-rejoints:' + utilisateurs[j], pad)
										db.srem('pads-utilisateurs:' + utilisateurs[j], pad)
										db.srem('pads-admins:' + utilisateurs[j], pad)
										db.srem('pads-favoris:' + utilisateurs[j], pad)
										db.hdel('couleurs:' + utilisateurs[j], 'pad' + pad)
									}
								})
								multi.del('utilisateurs-pads:' + pad)
								multi.exec(async function () {
									await fs.remove(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad))
									await fs.remove(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
									await fs.remove(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
									res.send('contenu_supprime')
								})
							} else if (!donneesPad.hasOwnProperty('motdepasse') && donneesPad.identifiant === identifiant) {
								db.exists('utilisateurs:' + identifiant, function (err, resultat) {
									if (err) { res.send('erreur'); return false }
									if (resultat === 1) {
										db.hgetall('utilisateurs:' + identifiant, async function (err, utilisateur) {
											if (err) { res.send('erreur'); return false }
											if (motdepasse.trim() !== '' && utilisateur.hasOwnProperty('motdepasse') && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
												const multi = db.multi()
												multi.srem('pads-crees:' + identifiant, pad)
												multi.smembers('utilisateurs-pads:' + pad, function (err, utilisateurs) {
													if (err) { res.send('erreur'); return false }
													for (let j = 0; j < utilisateurs.length; j++) {
														db.srem('pads-rejoints:' + utilisateurs[j], pad)
														db.srem('pads-utilisateurs:' + utilisateurs[j], pad)
														db.srem('pads-admins:' + utilisateurs[j], pad)
														db.srem('pads-favoris:' + utilisateurs[j], pad)
														db.hdel('couleurs:' + utilisateurs[j], 'pad' + pad)
													}
												})
												multi.del('utilisateurs-pads:' + pad)
												multi.exec(async function () {
													await fs.remove(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad))
													await fs.remove(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
													await fs.remove(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
													res.send('contenu_supprime')
												})
											} else {
												res.send('non_autorise')
											}
										})
									} else {
										res.send('erreur')
									}
								})
							} else {
								res.send('non_autorise')
							}
						} else {
							res.send('erreur')
						}
					} else {
						res.send('contenu_supprime')
					}
				})
			} else {
				res.send('erreur')
			}
		}).catch(function () {
			res.send('erreur')
		})
	})

	app.use(function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
		} else {
			res.redirect('/')
		}
	})

	const port = process.env.PORT || 3000
	httpServer.listen(port)

	const io = new Server(httpServer, { cookie: false })
	const wrap = middleware => (socket, next) => middleware(socket.request, {}, next)
	io.use(wrap(sessionMiddleware))

	io.on('connection', function (socket) {
		socket.on('connexion', async function (donnees) {
			const pad = donnees.pad
			const identifiant = donnees.identifiant
			const nom = donnees.nom
			const room = 'pad-' + pad
			socket.join(room)
			socket.identifiant = identifiant
			socket.nom = nom
			const clients = await io.in(room).fetchSockets()
			const utilisateurs = []
			for (let i = 0; i < clients.length; i++) {
				const donneesUtilisateur = new Promise(function (resolve) {
					db.hget('couleurs:' + clients[i].identifiant, 'pad' + pad, function (err, couleur) {
						if (err || couleur === null) {
							couleur = choisirCouleur()
							db.hset('couleurs:' + identifiant, 'pad' + pad, couleur, function () {
								resolve({ identifiant: clients[i].identifiant, nom: clients[i].nom, couleur: couleur })
							})
						} else {
							resolve({ identifiant: clients[i].identifiant, nom: clients[i].nom, couleur: couleur })
						}
					})
				})
				utilisateurs.push(donneesUtilisateur)
			}
			Promise.all(utilisateurs).then(function (resultats) {
				const utilisateursConnectes = resultats.filter((v, i, a) => a.findIndex(t => (t.identifiant === v.identifiant)) === i)
				io.in(room).emit('connexion', utilisateursConnectes)
			})
		})

		socket.on('sortie', function (pad, identifiant) {
			socket.leave('pad-' + pad)
			socket.to('pad-' + pad).emit('deconnexion', identifiant)
		})

		socket.on('disconnect', function () {
			if (socket.request.session.identifiant !== '') {
				socket.broadcast.emit('deconnexion', socket.request.session.identifiant)
			}
		})

		socket.on('deconnexion', function (identifiant) {
			if (socket.request.session.hasOwnProperty('identifiant')) {
				socket.request.session.identifiant = ''
				socket.request.session.nom = ''
				socket.request.session.email = ''
				socket.request.session.langue = ''
				socket.request.session.statut = ''
				socket.request.session.save()
			}
			if (identifiant !== '') {
				socket.broadcast.emit('deconnexion', identifiant)
			}
		})

		socket.on('verifieracces', function (donnees) {
			const pad = donnees.pad
			const identifiant = donnees.identifiant
			let code = ''
			if (donnees.code === '') {
				if (!socket.request.session.hasOwnProperty('acces')) {
					socket.request.session.acces = []
				}
				socket.request.session.acces.map(function (e) {
					if (e.hasOwnProperty('pad') && e.pad === pad) {
						code = e.code 
					}
				})
			} else {
				code = donnees.code
			}
			if (socket.request.session.identifiant === identifiant && code !== '') {
				db.hgetall('pads:' + pad, async function (err, resultat) {
					if (err || !resultat || resultat === null || !resultat.hasOwnProperty('code')) { socket.emit('erreur'); return false }
					if (code === resultat.code) {
						const donneesPad = await recupererDonneesPadProtege(resultat, pad, identifiant)
						socket.emit('verifieracces', { acces: true, pad: donneesPad.pad, blocs: donneesPad.blocs, activite: donneesPad.activite.reverse() })
					} else {
						socket.emit('verifieracces', { acces: false })
					}
				})
			} else {
				socket.emit('verifieracces', { acces: false })
			}
		})

		socket.on('ajouterbloc', function (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne, privee, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('token') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (donnees.id === pad && donnees.token === token && (donnees.contributions !== 'fermees' || admins.includes(identifiant) || proprietaire === identifiant)) {
						const id = parseInt(donnees.bloc) + 1
						db.hincrby('pads:' + pad, 'bloc', 1)
						const date = dayjs().format()
						const activiteId = parseInt(donnees.activite) + 1
						const multi = db.multi()
						let visibilite = 'visible'
						if ((admins.includes(identifiant) || proprietaire === identifiant) && privee === true) {
							visibilite = 'privee'
						} else if (!admins.includes(identifiant) && proprietaire !== identifiant && donnees.contributions === 'moderees') {
							visibilite = 'masquee'
						}
						if (vignette && vignette !== '' && !vignette.includes('/img/') && !verifierURL(vignette, ['https', 'http'])) {
							vignette = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(vignette)
						}
						multi.hmset('pad-' + pad + ':' + bloc, 'id', id, 'bloc', bloc, 'titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'date', date, 'identifiant', identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', colonne, 'visibilite', visibilite)
						multi.zadd('blocs:' + pad, id, bloc)
						multi.hset('dates-pads:' + pad, 'date', date)
						if (visibilite === 'visible') {
							// Enregistrer entrée du registre d'activité
							multi.hincrby('pads:' + pad, 'activite', 1)
							multi.zadd('activite:' + pad, activiteId, JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-ajoute' }))
						}
						multi.exec(async function () {
							if (media !== '' && type !== 'embed' && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + media))) {
								await fs.copy(path.join(__dirname, '..', '/static/temp/' + media), path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad + '/' + media))
								await fs.remove(path.join(__dirname, '..', '/static/temp/' + media))
							}
							if (vignette && vignette !== '' && !vignette.includes('/img/') && !verifierURL(vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))) {
								await fs.copy(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)), path.join(__dirname, '..', '/static' + vignette))
								await fs.remove(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))
							}
							io.in('pad-' + pad).emit('ajouterbloc', { bloc: bloc, titre: titre, texte: texte, media: media, iframe: iframe, type: type, source: source, vignette: vignette, identifiant: identifiant, nom: nom, date: date, couleur: couleur, commentaires: 0, evaluations: [], colonne: colonne, visibilite: visibilite, activiteId: activiteId })
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierbloc', function (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne, privee, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('token') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					if (donnees.id === pad && donnees.token === token) {
						db.exists('pad-' + pad + ':' + bloc, function (err, resultat) {
							if (err) { socket.emit('erreur'); return false }
							if (resultat === 1) {
								db.hgetall('pad-' + pad + ':' + bloc, async function (err, objet) {
									if (err) { socket.emit('erreur'); return false }
									const proprietaire = donnees.identifiant
									let admins = []
									if (donnees.hasOwnProperty('admins')) {
										admins = donnees.admins
									}
									if (objet.identifiant === identifiant || proprietaire === identifiant || admins.includes(identifiant) || donnees.contributions === 'modifiables') {
										let visibilite = 'visible'
										if (objet.hasOwnProperty('visibilite')) {
											visibilite = objet.visibilite
										}
										if (privee === true) {
											visibilite = 'privee'
										}
										const date = dayjs().format()
										if (objet.hasOwnProperty('vignette') && objet.vignette !== vignette && vignette !== '' && !vignette.includes('/img/') && !verifierURL(vignette, ['https', 'http'])) {
											vignette = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(vignette)
										}
										if (visibilite === 'visible') {
											// Enregistrer entrée du registre d'activité
											const activiteId = parseInt(donnees.activite) + 1
											const multi = db.multi()
											multi.hmset('pad-' + pad + ':' + bloc, 'titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'visibilite', 'visible', 'modifie', date)
											multi.hset('dates-pads:' + pad, 'date', date)
											multi.hincrby('pads:' + pad, 'activite', 1)
											multi.zadd('activite:' + pad, activiteId, JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-modifie' }))
											multi.exec(async function () {
												if (objet.hasOwnProperty('media') && objet.media !== media && media !== '' && type !== 'embed' && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + media))) {
													await fs.copy(path.join(__dirname, '..', '/static/temp/' + media), path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad + '/' + media))
													await fs.remove(path.join(__dirname, '..', '/static/temp/' + media))
												}
												if (objet.hasOwnProperty('media') && objet.media !== media && objet.media !== '' && objet.type !== 'embed') {
													supprimerFichier(pad, objet.media)
												}
												if (objet.hasOwnProperty('vignette') && objet.vignette !== vignette && vignette !== '' && !vignette.includes('/img/') && !verifierURL(vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))) {
													await fs.copy(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)), path.join(__dirname, '..', '/static' + vignette))
													await fs.remove(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))
												}
												if (objet.hasOwnProperty('vignette') && objet.vignette !== vignette && objet.vignette !== '' && !objet.vignette.includes('/img/') && !verifierURL(objet.vignette, ['https', 'http'])) {
													supprimerFichier(pad, path.basename(objet.vignette))
												}
												io.in('pad-' + pad).emit('modifierbloc', { bloc: bloc, titre: titre, texte: texte, media: media, iframe: iframe, type: type, source: source, vignette: vignette, identifiant: identifiant, nom: nom, modifie: date, couleur: couleur, colonne: colonne, visibilite: visibilite, activiteId: activiteId })
												socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
												socket.request.session.save()
											})
										} else if (visibilite === 'privee' || visibilite === 'masquee') {
											const multi = db.multi()
											multi.hmset('pad-' + pad + ':' + bloc, 'titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'visibilite', visibilite, 'modifie', date)
											multi.hset('dates-pads:' + pad, 'date', date)
											multi.exec(async function () {
												if (objet.hasOwnProperty('media') && objet.media !== media && media !== '' && type !== 'embed' && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + media))) {
													await fs.copy(path.join(__dirname, '..', '/static/temp/' + media), path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad + '/' + media))
													await fs.remove(path.join(__dirname, '..', '/static/temp/' + media))
												}
												if (objet.hasOwnProperty('media') && objet.media !== media && objet.media !== '' && objet.type !== 'embed') {
													supprimerFichier(pad, objet.media)
												}
												if (objet.hasOwnProperty('vignette') && objet.vignette !== vignette && vignette !== '' && !vignette.includes('/img/') && !verifierURL(vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))) {
													await fs.copy(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)), path.join(__dirname, '..', '/static' + vignette))
													await fs.remove(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))
												}
												if (objet.hasOwnProperty('vignette') && objet.vignette !== vignette && objet.vignette !== '' && !objet.vignette.includes('/img/') && !verifierURL(objet.vignette, ['https', 'http'])) {
													supprimerFichier(pad, path.basename(objet.vignette))
												}
												io.in('pad-' + pad).emit('modifierbloc', { bloc: bloc, titre: titre, texte: texte, media: media, iframe: iframe, type: type, source: source, vignette: vignette, identifiant: identifiant, nom: nom, modifie: date, couleur: couleur, colonne: colonne, visibilite: visibilite })
												socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
												socket.request.session.save()
											})
										} else {
											if (objet.hasOwnProperty('media') && objet.media !== media && media !== '' && type !== 'embed' && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + media))) {
												await fs.copy(path.join(__dirname, '..', '/static/temp/' + media), path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad + '/' + media))
												await fs.remove(path.join(__dirname, '..', '/static/temp/' + media))
											}
											if (objet.hasOwnProperty('media') && objet.media !== media && objet.media !== '' && objet.type !== 'embed') {
												supprimerFichier(pad, objet.media)
											}
											if (objet.hasOwnProperty('vignette') && objet.vignette !== vignette && vignette !== '' && !vignette.includes('/img/') && !verifierURL(vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))) {
												await fs.copy(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)), path.join(__dirname, '..', '/static' + vignette))
												await fs.remove(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))
											}
											if (objet.hasOwnProperty('vignette') && objet.vignette !== vignette && objet.vignette !== '' && !objet.vignette.includes('/img/') && !verifierURL(objet.vignette, ['https', 'http'])) {
												supprimerFichier(pad, path.basename(objet.vignette))
											}
											io.in('pad-' + pad).emit('modifierbloc', { bloc: bloc, titre: titre, texte: texte, media: media, iframe: iframe, type: type, source: source, vignette: vignette, identifiant: identifiant, nom: nom, modifie: date, couleur: couleur, colonne: colonne, visibilite: visibilite })
											socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
											socket.request.session.save()
										}
									} else {
										socket.emit('nonautorise')
									}
								})
							}
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('copierbloc', function (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne, visibilite, identifiant, nom, padOrigine) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('token') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (donnees.id === pad && donnees.token === token && (admins.includes(identifiant) || proprietaire === identifiant)) {
						const id = parseInt(donnees.bloc) + 1
						db.hincrby('pads:' + pad, 'bloc', 1)
						const date = dayjs().format()
						const activiteId = parseInt(donnees.activite) + 1
						const multi = db.multi()
						let vignetteOrigine = ''
						if (vignette && vignette !== '' && !vignette.includes('/img/') && !verifierURL(vignette, ['https', 'http'])) {
							vignette = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(vignette)
							vignetteOrigine = '/' + definirDossierFichiers(padOrigine) + '/' + padOrigine + '/' + path.basename(vignette)
						}
						multi.hmset('pad-' + pad + ':' + bloc, 'id', id, 'bloc', bloc, 'titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'date', date, 'identifiant', identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', colonne, 'visibilite', visibilite)
						multi.zadd('blocs:' + pad, id, bloc)
						multi.hset('dates-pads:' + pad, 'date', date)
						if (visibilite === 'visible') {
							// Enregistrer entrée du registre d'activité
							multi.hincrby('pads:' + pad, 'activite', 1)
							multi.zadd('activite:' + pad, activiteId, JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-ajoute' }))
						}
						multi.exec(async function () {
							if (media !== '' && type !== 'embed' && await fs.pathExists(path.join(__dirname, '..', '/static/' + definirDossierFichiers(padOrigine) + '/' + padOrigine + '/' + media))) {
								await fs.copy(path.join(__dirname, '..', '/static/' + definirDossierFichiers(padOrigine) + '/' + padOrigine + '/' + media), path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad + '/' + media))
							}
							if (vignette && vignette !== '' && !vignette.includes('/img/') && !verifierURL(vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/static' + vignetteOrigine))) {
								await fs.copy(path.join(__dirname, '..', '/static' + vignetteOrigine), path.join(__dirname, '..', '/static' + vignette))
							}
							io.in('pad-' + pad).emit('ajouterbloc', { bloc: bloc, titre: titre, texte: texte, media: media, iframe: iframe, type: type, source: source, vignette: vignette, identifiant: identifiant, nom: nom, date: date, couleur: couleur, commentaires: 0, evaluations: [], colonne: colonne, visibilite: visibilite, activiteId: activiteId })
							socket.emit('copierbloc')
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('autoriserbloc', function (pad, token, item, indexBloc, indexBlocColonne, moderation, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('token') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (donnees.id === pad && donnees.token === token && (admins.includes(identifiant) || proprietaire === identifiant)) {
						db.exists('pad-' + pad + ':' + item.bloc, function (err, resultat) {
							if (err) { socket.emit('erreur'); return false }
							if (resultat === 1) {
								const date = dayjs().format()
								const activiteId = parseInt(donnees.activite) + 1
								const multi = db.multi()
								if (item.hasOwnProperty('modifie')) {
									multi.hdel('pad-' + pad + ':' + item.bloc, 'modifie')
								}
								multi.hmset('pad-' + pad + ':' + item.bloc, 'visibilite', 'visible', 'date', date)
								multi.hset('dates-pads:' + pad, 'date', date)
								// Enregistrer entrée du registre d'activité
								multi.hincrby('pads:' + pad, 'activite', 1)
								multi.zadd('activite:' + pad, activiteId, JSON.stringify({ id: activiteId, bloc: item.bloc, identifiant: item.identifiant, titre: item.titre, date: date, couleur: item.couleur, type: 'bloc-ajoute' }))
								multi.exec(function () {
									io.in('pad-' + pad).emit('autoriserbloc', { bloc: item.bloc, titre: item.titre, texte: item.texte, media: item.media, iframe: item.iframe, type: item.type, source: item.source, vignette: item.vignette, identifiant: item.identifiant, nom: item.nom, date: date, couleur: item.couleur, commentaires: 0, evaluations: [], colonne: item.colonne, visibilite: 'visible', activiteId: activiteId, moderation: moderation, admin: identifiant, indexBloc: indexBloc, indexBlocColonne: indexBlocColonne })
									socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
									socket.request.session.save()
								})
							}
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('deplacerbloc', function (items, pad, affichage, ordre, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (donnees.id === pad && (admins.includes(identifiant) || proprietaire === identifiant)) {
						if (ordre === 'decroissant') {
							items.reverse()
						}
						const donneesBlocs = []
						for (let i = 0; i < items.length; i++) {
							const donneeBloc = new Promise(function (resolve) {
								db.exists('pad-' + pad + ':' + items[i].bloc, function (err, resultat) {
									if (err) { resolve('erreur'); return false }
									if (resultat === 1) {
										const multi = db.multi()
										multi.zrem('blocs:' + pad, items[i].bloc)
										multi.zadd('blocs:' + pad, (i + 1), items[i].bloc)
										if (affichage === 'colonnes') {
											multi.hset('pad-' + pad + ':' + items[i].bloc, 'colonne', items[i].colonne)
										}
										multi.exec(function (err) {
											if (err) { resolve('erreur'); return false }
											resolve(i)
										})
									} else {
										resolve('erreur')
									}
								})
							})
							donneesBlocs.push(donneeBloc)
						}
						Promise.all(donneesBlocs).then(function (blocs) {
							let erreurs = 0
							blocs.forEach(function (bloc) {
								if (bloc === 'erreur') {
									erreurs++
								}
							})
							if (erreurs === 0) {
								if (ordre === 'decroissant') {
									items.reverse()
								}
								io.in('pad-' + pad).emit('deplacerbloc', { blocs: items, identifiant: identifiant })
							} else {
								socket.emit('erreur')
							}
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('supprimerbloc', function (bloc, pad, token, titre, couleur, colonne, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('token') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					if (donnees.id === pad && donnees.token === token) {
						db.exists('pad-' + pad + ':' + bloc, function (err, resultat) {
							if (err) { socket.emit('erreur'); return false }
							if (resultat === 1) {
								db.hgetall('pad-' + pad + ':' + bloc, function (err, objet) {
									if (err) { socket.emit('erreur'); return false }
									const proprietaire = donnees.identifiant
									let admins = []
									if (donnees.hasOwnProperty('admins')) {
										admins = donnees.admins
									}
									if (objet.identifiant === identifiant || proprietaire === identifiant || admins.includes(identifiant)) {
										if (objet.hasOwnProperty('media') && objet.media !== '' && objet.type !== 'embed') {
											supprimerFichier(pad, objet.media)
										}
										if (objet.hasOwnProperty('vignette') && objet.vignette !== '' && !objet.vignette.includes('/img/') && !verifierURL(objet.vignette, ['https', 'http'])) {
											supprimerFichier(pad, path.basename(objet.vignette))
										}
										let etherpadId, url
										if (objet.hasOwnProperty('iframe') && objet.iframe !== '' && objet.iframe.includes(etherpad)) {
											etherpadId = objet.iframe.replace(etherpad + '/p/', '')
											url = etherpad + '/api/1/deletePad?apikey=' + etherpadApi + '&padID=' + etherpadId
											axios.get(url)
										}
										if (objet.hasOwnProperty('media') && objet.media !== '' && objet.media.includes(etherpad)) {
											etherpadId = objet.media.replace(etherpad + '/p/', '')
											url = etherpad + '/api/1/deletePad?apikey=' + etherpadApi + '&padID=' + etherpadId
											axios.get(url)
										}
										if (objet.hasOwnProperty('bloc') && objet.bloc === bloc) {
											const date = dayjs().format()
											const activiteId = parseInt(donnees.activite) + 1
											const multi = db.multi()
											multi.del('pad-' + pad + ':' + bloc)
											multi.zrem('blocs:' + pad, bloc)
											multi.del('commentaires:' + bloc)
											multi.del('evaluations:' + bloc)
											multi.hset('dates-pads:' + pad, 'date', date)
											// Enregistrer entrée du registre d'activité
											multi.hincrby('pads:' + pad, 'activite', 1)
											multi.zadd('activite:' + pad, activiteId, JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-supprime' }))
											multi.exec(function () {
												io.in('pad-' + pad).emit('supprimerbloc', { bloc: bloc, identifiant: identifiant, nom: nom, titre: titre, date: date, couleur: couleur, colonne: colonne, activiteId: activiteId })
												socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
												socket.request.session.save()
											})
										}
									} else {
										socket.emit('nonautorise')
									}
								})
							}
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('commenterbloc', function (bloc, pad, titre, texte, couleur, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, resultat) {
					if (err || !resultat || resultat === null || !resultat.hasOwnProperty('activite')) { socket.emit('erreur'); return false }
					db.hgetall('pad-' + pad + ':' + bloc, function (err, donnees) {
						if (err || !donnees || donnees === null || !donnees.hasOwnProperty('commentaires')) { socket.emit('erreur'); return false }
						db.zrange('commentaires:' + bloc, 0, -1, function (err, commentaires) {
							if (err) { socket.emit('erreur'); return false }
							const date = dayjs().format()
							const activiteId = parseInt(resultat.activite) + 1
							let commentaireId = parseInt(donnees.commentaires) + 1
							const listeCommentaires = []
							for (let commentaire of commentaires) {
								const commentaireJSON = verifierJSON(commentaire)
								if (commentaireJSON === false) {
									socket.emit('erreur'); return false
								} else {
									listeCommentaires.push(commentaireJSON)
								}
							}
							let maxCommentaireId = 0
							if (listeCommentaires.length > 0) {
								maxCommentaireId = listeCommentaires.reduce(function (p, c) {
									return (p && p.id > c.id) ? p : c
								})
							}
							if (commentaireId === maxCommentaireId.id || commentaireId < maxCommentaireId.id) {
								commentaireId = maxCommentaireId.id + 1
							}
							const multi = db.multi()
							const commentaire = { id: commentaireId, identifiant: identifiant, date: date, texte: texte }
							multi.hset('pad-' + pad + ':' + bloc, 'commentaires', commentaireId)
							multi.hset('dates-pads:' + pad, 'date', date)
							multi.zadd('commentaires:' + bloc, commentaireId, JSON.stringify(commentaire))
							// Enregistrer entrée du registre d'activité
							multi.hincrby('pads:' + pad, 'activite', 1)
							multi.zadd('activite:' + pad, activiteId, JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-commente' }))
							multi.exec(function () {
								io.in('pad-' + pad).emit('commenterbloc', { id: commentaireId, bloc: bloc, identifiant: identifiant, nom: nom, texte: texte, titre: titre, date: date, couleur: couleur, commentaires: commentaires.length + 1, activiteId: activiteId })
								socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
								socket.request.session.save()
							})
						})
					})
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercommentaire', function (bloc, pad, id, texte, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.zrangebyscore('commentaires:' + bloc, id, id, function (err, resultats) {
					if (err || !resultats || resultats === null) { socket.emit('erreur'); return false }
					const dateModification = dayjs().format()
					const resulatsJSON = verifierJSON(resultats)
					let donnees
					if (resulatsJSON === false) {
						socket.emit('erreur'); return false
					} else {
						donnees = resulatsJSON
					}
					const date = donnees.date
					const commentaire = { id: id, identifiant: donnees.identifiant, date: date, modifie: dateModification, texte: texte }
					const multi = db.multi()
					multi.zremrangebyscore('commentaires:' + bloc, id, id)
					multi.zadd('commentaires:' + bloc, id, JSON.stringify(commentaire))
					multi.hset('dates-pads:' + pad, 'date', dateModification)
					multi.exec(function () {
						io.in('pad-' + pad).emit('modifiercommentaire', { id: id, texte: texte })
						socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
						socket.request.session.save()
					})
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('supprimercommentaire', function (bloc, pad, id, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				const date = dayjs().format()
				const multi = db.multi()
				multi.zremrangebyscore('commentaires:' + bloc, id, id)
				multi.hset('dates-pads:' + pad, 'date', date)
				multi.exec(function () {
					db.zcard('commentaires:' + bloc, function (err, commentaires) {
						if (err) { socket.emit('erreur'); return false }
						io.in('pad-' + pad).emit('supprimercommentaire', { id: id, bloc: bloc, commentaires: commentaires })
						socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
						socket.request.session.save()
					})
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
					const commentaireJSON = verifierJSON(commentaire)
					if (commentaireJSON === false) {
						socket.emit('erreur'); return false
					} else {
						commentaire = commentaireJSON
					}
					const donneeCommentaire = new Promise(function (resolve) {
						const identifiant = commentaire.identifiant
						db.exists('utilisateurs:' + identifiant, function (err, resultat) {
							if (err) { resolve(); return false }
							if (resultat === 1) {
								db.hgetall('utilisateurs:' + identifiant, function (err, utilisateur) {
									if (err) { resolve(); return false }
									commentaire.nom = utilisateur.nom
									resolve(commentaire)
								})
							} else {
								db.exists('noms:' + identifiant, function (err, resultat) {
									if (err) { resolve(); return false }
									if (resultat === 1) {
										db.hget('noms:' + identifiant, 'nom', function (err, nom) {
											if (err) { resolve(); return false }
											commentaire.nom = nom
											resolve(commentaire)
										})
									} else {
										commentaire.nom = ''
										resolve(commentaire)
									}
								})
							}
						})
					})
					donneesCommentaires.push(donneeCommentaire)
				}
				Promise.all(donneesCommentaires).then(function (resultat) {
					socket.emit('commentaires', { commentaires: resultat, type: type })
				})
			})
		})

		socket.on('evaluerbloc', function (bloc, pad, titre, etoiles, couleur, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, resultat) {
					if (err || !resultat || resultat === null || !resultat.hasOwnProperty('activite')) { socket.emit('erreur'); return false }
					db.hgetall('pad-' + pad + ':' + bloc, function (err, donnees) {
						if (err || !donnees || donnees === null || !donnees.hasOwnProperty('evaluations')) { socket.emit('erreur'); return false }
						const date = dayjs().format()
						const activiteId = parseInt(resultat.activite) + 1
						const evaluationId = parseInt(donnees.evaluations) + 1
						const evaluation = { id: evaluationId, identifiant: identifiant, date: date, etoiles: etoiles }
						const multi = db.multi()
						multi.hincrby('pad-' + pad + ':' + bloc, 'evaluations', 1)
						multi.zadd('evaluations:' + bloc, evaluationId, JSON.stringify(evaluation))
						multi.hset('dates-pads:' + pad, 'date', date)
						// Enregistrer entrée du registre d'activité
						multi.hincrby('pads:' + pad, 'activite', 1)
						multi.zadd('activite:' + pad, activiteId, JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-evalue' }))
						multi.exec(function () {
							io.in('pad-' + pad).emit('evaluerbloc', { id: evaluationId, bloc: bloc, identifiant: identifiant, nom: nom, titre: titre, date: date, couleur: couleur, evaluation: evaluation, activiteId: activiteId })
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					})
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierevaluation', function (bloc, pad, id, etoiles, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.zrangebyscore('evaluations:' + bloc, id, id, function (err) {
					if (err) { socket.emit('erreur'); return false }
					const date = dayjs().format()
					const evaluation = { id: id, identifiant: identifiant, date: date, etoiles: etoiles }
					const multi = db.multi()
					multi.zremrangebyscore('evaluations:' + bloc, id, id)
					multi.zadd('evaluations:' + bloc, id, JSON.stringify(evaluation))
					multi.hset('dates-pads:' + pad, 'date', date)
					multi.exec(function () {
						io.in('pad-' + pad).emit('modifierevaluation', { id: id, bloc: bloc, date: date, etoiles: etoiles })
						socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
						socket.request.session.save()
					})
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('supprimerevaluation', function (bloc, pad, id, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				const date = dayjs().format()
				const multi = db.multi()
				multi.hset('dates-pads:' + pad, 'date', date)
				multi.zremrangebyscore('evaluations:' + bloc, id, id)
				multi.exec(function () {
					io.in('pad-' + pad).emit('supprimerevaluation', { id: id, bloc: bloc })
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiernom', function (pad, nom, statut, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				if (statut === 'invite') {
					db.hset('noms:' + identifiant, 'nom', nom, function (err) {
						if (err) { socket.emit('erreur'); return false }
						io.in('pad-' + pad).emit('modifiernom', { identifiant: identifiant, nom: nom })
						socket.request.session.nom = nom
						socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
						socket.request.session.save()
					})
				} else if (statut === 'auteur') {
					db.hset('utilisateurs:' + identifiant, 'nom', nom, function (err) {
						if (err) { socket.emit('erreur'); return false }
						io.in('pad-' + pad).emit('modifiernom', { identifiant: identifiant, nom: nom })
						socket.request.session.nom = nom
						socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
						socket.request.session.save()
					})
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercouleur', function (pad, couleur, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hset('couleurs:' + identifiant, 'pad' + pad, couleur, function (err) {
					if (err) { socket.emit('erreur'); return false }
					io.in('pad-' + pad).emit('modifiercouleur', { identifiant: identifiant, couleur: couleur })
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiertitre', function (pad, titre, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'titre', titre, function (err) {
							if (err) { socket.emit('erreur'); return false }
							io.in('pad-' + pad).emit('modifiertitre', titre)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercodeacces', function (pad, code, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'code', code, function (err) {
							if (err) { socket.emit('erreur'); return false }
							io.in('pad-' + pad).emit('modifiercodeacces', code)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifieradmins', function (pad, admins, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					let listeAdmins = []
					if (donnees.hasOwnProperty('admins') && donnees.admins.substring(0, 1) === '"') { // fix bug update 0.9.0
						listeAdmins = JSON.parse(JSON.parse(donnees.admins))
					} else if (donnees.hasOwnProperty('admins')) {
						listeAdmins = JSON.parse(donnees.admins)
					}
					const proprietaire = donnees.identifiant
					if (listeAdmins.includes(identifiant) || proprietaire === identifiant) {
						const multi = db.multi()
						multi.hset('pads:' + pad, 'admins', JSON.stringify(admins))
						admins.forEach(function (admin) {
							if (!listeAdmins.includes(admin)) {
								multi.sadd('pads-admins:' + admin, pad)
							}
						})
						listeAdmins.forEach(function (admin) {
							if (!admins.includes(admin)) {
								multi.srem('pads-admins:' + admin, pad)
							}
						})
						multi.exec(function () {
							io.in('pad-' + pad).emit('modifieradmins', admins)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifieracces', function (pad, acces, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						let code = ''
						if (donnees.hasOwnProperty('code') && donnees.code !== '') {
							code = donnees.code
						} else {
							code = Math.floor(100000 + Math.random() * 900000)
						}
						db.hmset('pads:' + pad, 'acces', acces, 'code', code, function (err) {
							if (err) { socket.emit('erreur'); return false }
							io.in('pad-' + pad).emit('modifieracces', { acces: acces, code: code })
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercontributions', function (pad, contributions, contributionsPrecedentes, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'contributions', contributions, function (err) {
							if (err) { socket.emit('erreur'); return false }
							io.in('pad-' + pad).emit('modifiercontributions', { contributions: contributions, contributionsPrecedentes: contributionsPrecedentes })
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifieraffichage', function (pad, affichage, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'affichage', affichage, function (err) {
							if (err) { socket.emit('erreur'); return false }
							io.in('pad-' + pad).emit('modifieraffichage', affichage)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierordre', function (pad, ordre, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'ordre', ordre, function (err) {
							if (err) { socket.emit('erreur'); return false }
							io.in('pad-' + pad).emit('modifierordre', ordre)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierlargeur', function (pad, largeur, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'largeur', largeur, function (err) {
							if (err) { socket.emit('erreur'); return false }
							io.in('pad-' + pad).emit('modifierlargeur', largeur)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierfond', function (pad, fond, ancienfond, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'fond', fond, function (err) {
							if (err) { socket.emit('erreur'); return false }
							io.in('pad-' + pad).emit('modifierfond', fond)
							if (!ancienfond.includes('/img/') && ancienfond.substring(0, 1) !== '#' && ancienfond !== '') {
								supprimerFichier(pad, path.basename(ancienfond))
							}
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercouleurfond', function (pad, fond, ancienfond, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'fond', fond, async function (err) {
							if (err) { socket.emit('erreur'); return false }
							io.in('pad-' + pad).emit('modifiercouleurfond', fond)
							if (!ancienfond.includes('/img/') && ancienfond.substring(0, 1) !== '#' && ancienfond !== '') {
								supprimerFichier(pad, path.basename(ancienfond))
							}
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifieractivite', function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'registreActivite', statut, function () {
							io.in('pad-' + pad).emit('modifieractivite', statut)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierconversation', function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'conversation', statut, function () {
							io.in('pad-' + pad).emit('modifierconversation', statut)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierlisteutilisateurs', function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'listeUtilisateurs', statut, function () {
							io.in('pad-' + pad).emit('modifierlisteutilisateurs', statut)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiereditionnom', function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'editionNom', statut, function () {
							io.in('pad-' + pad).emit('modifiereditionnom', statut)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierfichiers', function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'fichiers', statut, function () {
							io.in('pad-' + pad).emit('modifierfichiers', statut)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierenregistrements', function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'enregistrements', statut, function () {
							io.in('pad-' + pad).emit('modifierenregistrements', statut)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierliens', function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'liens', statut, function () {
							io.in('pad-' + pad).emit('modifierliens', statut)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierdocuments', function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'documents', statut, function () {
							io.in('pad-' + pad).emit('modifierdocuments', statut)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercommentaires', function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'commentaires', statut, function () {
							io.in('pad-' + pad).emit('modifiercommentaires', statut)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierevaluations', function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'evaluations', statut, function () {
							io.in('pad-' + pad).emit('modifierevaluations', statut)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercopiebloc', function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.hset('pads:' + pad, 'copieBloc', statut, function () {
							io.in('pad-' + pad).emit('modifiercopiebloc', statut)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('message', function (pad, texte, identifiant, nom) {
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				const date = dayjs().format()
				io.in('pad-' + pad).emit('message', { texte: texte, identifiant: identifiant, nom: nom, date: date })
				socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
				socket.request.session.save()
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('reinitialisermessages', function (pad, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						io.in('pad-' + pad).emit('reinitialisermessages')
						socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
						socket.request.session.save()
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('reinitialiseractivite', function (pad, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.del('activite:' + pad, function () {
							io.in('pad-' + pad).emit('reinitialiseractivite')
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('ajoutercolonne', function (pad, titre, colonnes, affichageColonnes, couleur, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, resultat) {
					if (err || !resultat || resultat === null || !resultat.hasOwnProperty('activite') || !resultat.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = resultat.identifiant
					let admins = []
					if (resultat.hasOwnProperty('admins')) {
						admins = resultat.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						const date = dayjs().format()
						const activiteId = parseInt(resultat.activite) + 1
						colonnes.push(titre)
						affichageColonnes.push(true)
						const multi = db.multi()
						multi.hmset('pads:' + pad, 'colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes))
						// Enregistrer entrée du registre d'activité
						multi.hincrby('pads:' + pad, 'activite', 1)
						multi.zadd('activite:' + pad, activiteId, JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'colonne-ajoutee' }))
						multi.exec(function () {
							io.in('pad-' + pad).emit('ajoutercolonne', { identifiant: identifiant, nom: nom, titre: titre, colonnes: colonnes, affichageColonnes: affichageColonnes, date: date, couleur: couleur, activiteId: activiteId })
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiertitrecolonne', function (pad, titre, index, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('colonnes') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						const colonnes = JSON.parse(donnees.colonnes)
						colonnes[index] = titre
						db.hset('pads:' + pad, 'colonnes', JSON.stringify(colonnes), function () {
							io.in('pad-' + pad).emit('modifiertitrecolonne', colonnes)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})
		
		socket.on('modifieraffichagecolonne', function (pad, valeur, index, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						let affichageColonnes = []
						if (donnees.hasOwnProperty('affichageColonnes')) {
							affichageColonnes = JSON.parse(donnees.affichageColonnes)
						} else {
							const colonnes = JSON.parse(donnees.colonnes)
							colonnes.forEach(function () {
								affichageColonnes.push(true)
							})
						}
						affichageColonnes[index] = valeur
						db.hset('pads:' + pad, 'affichageColonnes', JSON.stringify(affichageColonnes), function () {
							io.in('pad-' + pad).emit('modifieraffichagecolonne', affichageColonnes)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('supprimercolonne', function (pad, titre, colonne, couleur, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('colonnes') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						const colonnes = JSON.parse(donnees.colonnes)
						colonnes.splice(colonne, 1)
						let affichageColonnes = []
						if (donnees.hasOwnProperty('affichageColonnes')) {
							affichageColonnes = JSON.parse(donnees.affichageColonnes)
						} else {
							colonnes.forEach(function () {
								affichageColonnes.push(true)
							})
						}
						affichageColonnes.splice(colonne, 1)
						const donneesBlocs = []
						db.zrange('blocs:' + pad, 0, -1, function (err, blocs) {
							if (err) { socket.emit('erreur'); return false }
							for (const bloc of blocs) {
								const donneesBloc = new Promise(function (resolve) {
									db.hgetall('pad-' + pad + ':' + bloc, function (err, resultat) {
										if (err) { resolve({}); return false }
										resolve(resultat)
									})
								})
								donneesBlocs.push(donneesBloc)
							}
							Promise.all(donneesBlocs).then(function (blocs) {
								const blocsSupprimes = []
								const blocsRestants = []
								blocs.forEach(function (item) {
									if (item && item.hasOwnProperty('colonne') && parseInt(item.colonne) === parseInt(colonne)) {
										blocsSupprimes.push(item.bloc)
									} else if (item) {
										blocsRestants.push(item)
									}
								})
								const donneesBlocsSupprimes = []
								for (const blocSupprime of blocsSupprimes) {
									const donneesBlocSupprime = new Promise(function (resolve) {
										db.exists('pad-' + pad + ':' + blocSupprime, function (err, resultat) {
											if (err) { resolve(); return false }
											if (resultat === 1) {
												db.hgetall('pad-' + pad + ':' + blocSupprime, function (err, objet) {
													if (err) { resolve(); return false }
													if (objet.hasOwnProperty('media') && objet.media !== '' && objet.type !== 'embed') {
														supprimerFichier(pad, objet.media)
													}
													if (objet.hasOwnProperty('vignette') && objet.vignette !== '' && !objet.vignette.includes('/img/') && !verifierURL(objet.vignette, ['https', 'http'])) {
														supprimerFichier(pad, path.basename(objet.vignette))
													}
													if (objet.hasOwnProperty('bloc') && objet.bloc === blocSupprime) {
														const multi = db.multi()
														multi.del('pad-' + pad + ':' + blocSupprime)
														multi.zrem('blocs:' + pad, blocSupprime)
														multi.del('commentaires:' + blocSupprime)
														multi.del('evaluations:' + blocSupprime)
														multi.exec(function (err) {
															if (err) { resolve(); return false }
															resolve('supprime')
														})
													} else {
														resolve()
													}
												})
											} else {
												resolve()
											}
										})
									})
									donneesBlocsSupprimes.push(donneesBlocSupprime)
								}
								const donneesBlocsRestants = []
								for (let i = 0; i < blocsRestants.length; i++) {
									const donneeBloc = new Promise(function (resolve) {
										if (parseInt(blocsRestants[i].colonne) > parseInt(colonne)) {
											db.hset('pad-' + pad + ':' + blocsRestants[i].bloc, 'colonne', (parseInt(blocsRestants[i].colonne) - 1), function (err) {
												if (err) { resolve(); return false }
												resolve(i)
											})
										} else {
											resolve(i)
										}
									})
									donneesBlocsRestants.push(donneeBloc)
								}
								Promise.all([donneesBlocsSupprimes, donneesBlocsRestants]).then(function () {
									const date = dayjs().format()
									const activiteId = parseInt(donnees.activite) + 1
									const multi = db.multi()
									multi.hmset('pads:' + pad, 'colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes))
									// Enregistrer entrée du registre d'activité
									multi.hincrby('pads:' + pad, 'activite', 1)
									multi.zadd('activite:' + pad, activiteId, JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'colonne-supprimee' }))
									multi.exec(function () {
										io.in('pad-' + pad).emit('supprimercolonne', { identifiant: identifiant, nom: nom, titre: titre, colonne: colonne, colonnes: colonnes, affichageColonnes: affichageColonnes, date: date, couleur: couleur, activiteId: activiteId })
										socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
										socket.request.session.save()
									})
								})
							})
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('deplacercolonne', function (pad, titre, affichage, direction, colonne, couleur, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('colonnes') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						const colonnes = JSON.parse(donnees.colonnes)
						let affichageColonnes = []
						if (donnees.hasOwnProperty('affichageColonnes')) {
							affichageColonnes = JSON.parse(donnees.affichageColonnes)
						} else {
							colonnes.forEach(function () {
								affichageColonnes.push(true)
							})
						}
						if (direction === 'gauche') {
							colonnes.splice((parseInt(colonne) - 1), 0, titre)
							colonnes.splice((parseInt(colonne) + 1), 1)
							affichageColonnes.splice((parseInt(colonne) - 1), 0, affichage)
							affichageColonnes.splice((parseInt(colonne) + 1), 1)
						} else if (direction === 'droite') {
							const titreDeplace = colonnes[parseInt(colonne) + 1]
							colonnes.splice((parseInt(colonne) + 1), 0, titre)
							colonnes.splice(parseInt(colonne), 1, titreDeplace)
							colonnes.splice((parseInt(colonne) + 2), 1)
							const affichageDeplace = affichageColonnes[parseInt(colonne) + 1]
							affichageColonnes.splice((parseInt(colonne) + 1), 0, affichage)
							affichageColonnes.splice(parseInt(colonne), 1, affichageDeplace)
							affichageColonnes.splice((parseInt(colonne) + 2), 1)
						}
						const donneesBlocs = []
						db.zrange('blocs:' + pad, 0, -1, function (err, blocs) {
							if (err) { socket.emit('erreur'); return false }
							for (const bloc of blocs) {
								const donneesBloc = new Promise(function (resolve) {
									db.hgetall('pad-' + pad + ':' + bloc, function (err, resultat) {
										if (err) { resolve({}); return false }
										resolve(resultat)
									})
								})
								donneesBlocs.push(donneesBloc)
							}
							Promise.all(donneesBlocs).then(function (blocs) {
								const donneesBlocsDeplaces = []
								for (const item of blocs) {
									const donneesBlocDeplace = new Promise(function (resolve) {
										if (item && item.hasOwnProperty('bloc')) {
											db.exists('pad-' + pad + ':' + item.bloc, function (err, resultat) {
												if (err) { resolve(); return false }
												if (resultat === 1 && parseInt(item.colonne) === parseInt(colonne) && direction === 'gauche') {
													db.hset('pad-' + pad + ':' + item.bloc, 'colonne', (parseInt(colonne) - 1), function (err) {
														if (err) { resolve(); return false }
														resolve('deplace')
													})
												} else if (resultat === 1 && parseInt(item.colonne) === parseInt(colonne) && direction === 'droite') {
													db.hset('pad-' + pad + ':' + item.bloc, 'colonne', (parseInt(colonne) + 1), function (err) {
														if (err) { resolve(); return false }
														resolve('deplace')
													})
												} else if (resultat === 1 && parseInt(item.colonne) === (parseInt(colonne) - 1) && direction === 'gauche') {
													db.hset('pad-' + pad + ':' + item.bloc, 'colonne', parseInt(colonne), function (err) {
														if (err) { resolve(); return false }
														resolve('deplace')
													})
												} else if (resultat === 1 && parseInt(item.colonne) === (parseInt(colonne) + 1) && direction === 'droite') {
													db.hset('pad-' + pad + ':' + item.bloc, 'colonne', parseInt(colonne), function (err) {
														if (err) { resolve(); return false }
														resolve('deplace')
													})
												} else {
													resolve()
												}
											})
										} else {
											resolve()
										}
									})
									donneesBlocsDeplaces.push(donneesBlocDeplace)
								}
								Promise.all(donneesBlocsDeplaces).then(function () {
									const date = dayjs().format()
									const activiteId = parseInt(donnees.activite) + 1
									const multi = db.multi()
									multi.hmset('pads:' + pad, 'colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes))
									// Enregistrer entrée du registre d'activité
									multi.hincrby('pads:' + pad, 'activite', 1)
									multi.zadd('activite:' + pad, activiteId, JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'colonne-deplacee' }))
									multi.exec(function () {
										io.in('pad-' + pad).emit('deplacercolonne', { identifiant: identifiant, nom: nom, titre: titre, direction: direction, colonne: colonne, colonnes: colonnes, affichageColonnes: affichageColonnes, date: date, couleur: couleur, activiteId: activiteId })
										socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
										socket.request.session.save()
									})
								})
							})
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('debloquerpad', function (pad, identifiant, acces) {
			db.exists('utilisateurs:' + identifiant, function (err, resultat) {
				if (err) { socket.emit('erreur'); return false }
				if (resultat === 1) {
					let couleur = choisirCouleur()
					db.hgetall('utilisateurs:' + identifiant, function (err, utilisateur) {
						if (err) { socket.emit('erreur'); return false }
						db.hget('couleurs:' + identifiant, 'pad' + pad, function (err, col) {
							if (!err && col !== null) {
								couleur = col
							}
							socket.request.session.identifiant = identifiant
							socket.request.session.nom = utilisateur.nom
							socket.request.session.statut = 'auteur'
							socket.request.session.langue = utilisateur.langue
							if (!socket.request.session.hasOwnProperty('acces')) {
								socket.request.session.acces = []
							}
							if (!socket.request.session.hasOwnProperty('pads')) {
								socket.request.session.pads = []
							}
							if (!socket.request.session.pads.includes(pad)) {
								socket.request.session.pads.push(pad)
							}
							if (!socket.request.session.hasOwnProperty('digidrive')) {
								socket.request.session.digidrive = []
							}
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
							if (acces === true) {
								socket.emit('debloquerpad', { identifiant: identifiant, nom: utilisateur.nom, langue: utilisateur.langue, couleur: couleur })
							} else {
								db.hgetall('pads:' + pad, async function (err, donnees) {
									if (err || !donnees || donnees === null ) { socket.emit('erreur'); return false }
									const donneesPad = await recupererDonneesPadProtege(donnees, pad, identifiant)
									socket.emit('debloquerpad', { identifiant: identifiant, nom: utilisateur.nom, langue: utilisateur.langue, couleur: couleur, pad: donneesPad.pad, blocs: donneesPad.blocs, activite: donneesPad.activite.reverse() })
								})
							}
						})
					})
				} else {
					socket.emit('erreur')
				}
			})
		})

		socket.on('modifiernotification', function (pad, admins) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			db.hgetall('pads:' + pad, function () {
				db.hset('pads:' + pad, 'notification', JSON.stringify(admins), function () {
					io.in('pad-' + pad).emit('modifiernotification', admins)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				})
			})
		})

		socket.on('verifiermodifierbloc', function (pad, bloc, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				socket.to('pad-' + pad).emit('verifiermodifierbloc', { bloc: bloc, identifiant: identifiant })
				socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
				socket.request.session.save()
			}
		})

		socket.on('reponsemodifierbloc', function (pad, identifiant, reponse) {
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				socket.to('pad-' + pad).emit('reponsemodifierbloc', { identifiant: identifiant, reponse: reponse })
				socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
				socket.request.session.save()
			}
		})

		socket.on('supprimeractivite', function (pad, id, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				db.hgetall('pads:' + pad, function (err, donnees) {
					if (err || !donnees || donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
					const proprietaire = donnees.identifiant
					let admins = []
					if (donnees.hasOwnProperty('admins')) {
						admins = donnees.admins
					}
					if (admins.includes(identifiant) || proprietaire === identifiant) {
						db.zremrangebyscore('activite:' + pad, id, id, function () {
							io.in('pad-' + pad).emit('supprimeractivite', id)
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					} else {
						socket.emit('nonautorise')
					}
				})
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierlangue', function (langue) {
			socket.request.session.langue = langue
			socket.request.session.save()
		})

		socket.on('verifiermaintenance', function () {
			socket.emit('verifiermaintenance', maintenance)
		})

		socket.on('activermaintenance', function (admin) {
			if (admin !== '' && admin === process.env.VITE_ADMIN_PASSWORD) {
				maintenance = true
				socket.emit('verifiermaintenance', true)
			}
		})

		socket.on('desactivermaintenance', function (admin) {
			if (admin !== '' && admin === process.env.VITE_ADMIN_PASSWORD) {
				maintenance = false
				socket.emit('verifiermaintenance', false)
			}
		})
	})

	function creerPad (id, token, titre, date, identifiant, couleur) {
		return new Promise(function (resolve) {
			const multi = db.multi()
			if (id === 1) {
				multi.set('pad', 1)
			} else {
				multi.incr('pad')
			}
			multi.hmset('pads:' + id, 'id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'fond', '/img/fond1.png', 'acces', 'public', 'contributions', 'ouvertes', 'affichage', 'mur', 'registreActivite', 'active', 'conversation', 'desactivee', 'listeUtilisateurs', 'activee', 'editionNom', 'desactivee', 'fichiers', 'actives', 'enregistrements', 'desactives', 'liens', 'actives', 'documents', 'desactives', 'commentaires', 'desactives', 'evaluations', 'desactivees', 'copieBloc', 'desactivee', 'ordre', 'croissant', 'largeur', 'normale', 'date', date, 'colonnes', JSON.stringify([]), 'affichageColonnes', JSON.stringify([]), 'bloc', 0, 'activite', 0, 'admins', JSON.stringify([]))
			multi.sadd('pads-crees:' + identifiant, id)
			multi.sadd('utilisateurs-pads:' + id, identifiant)
			multi.hset('dates-pads:' + id, 'date', date)
			multi.hset('couleurs:' + identifiant, 'pad' + id, couleur)
			multi.exec(function (err) {
				if (err) {
					resolve(false)
				} else {
					resolve(true)
				}
			})
		})
	}

	function creerPadSansCompte (id, token, titre, hash, date, identifiant, nom, langue, type) {
		return new Promise(function (resolve) {
			const multi = db.multi()
			if (id === 1) {
				multi.set('pad', 1)
			} else {
				multi.incr('pad')
			}
			multi.hmset('pads:' + id, 'id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'motdepasse', hash, 'fond', '/img/fond1.png', 'acces', 'public', 'contributions', 'ouvertes', 'affichage', 'mur', 'registreActivite', 'active', 'conversation', 'desactivee', 'listeUtilisateurs', 'activee', 'editionNom', 'desactivee', 'fichiers', 'actives', 'enregistrements', 'desactives', 'liens', 'actives', 'documents', 'desactives', 'commentaires', 'desactives', 'evaluations', 'desactivees', 'copieBloc', 'desactivee', 'ordre', 'croissant', 'largeur', 'normale', 'date', date, 'colonnes', JSON.stringify([]), 'affichageColonnes', JSON.stringify([]), 'bloc', 0, 'activite', 0)
			if (type === 'api') {
				multi.sadd('pads-crees:' + identifiant, id)
			}
			multi.hmset('utilisateurs:' + identifiant, 'id', identifiant, 'date', date, 'nom', nom, 'langue', langue)
			multi.exec(function (err) {
				if (err) {
					resolve(false)
				} else {
					resolve(true)
				}
			})
		})
	}

	async function ajouterPadDansDb (id, donnees) {
		return new Promise(function (resolveMain) {
			const donneesBlocs = []
			for (const [indexBloc, bloc] of donnees.blocs.entries()) {
				const donneesBloc = new Promise(function (resolve) {
					if (bloc.hasOwnProperty('id') && bloc.hasOwnProperty('bloc') && bloc.hasOwnProperty('titre') && bloc.hasOwnProperty('texte') && bloc.hasOwnProperty('media') && bloc.hasOwnProperty('iframe') && bloc.hasOwnProperty('type') && bloc.hasOwnProperty('source') && bloc.hasOwnProperty('vignette') && bloc.hasOwnProperty('identifiant') && bloc.hasOwnProperty('commentaires') && bloc.hasOwnProperty('evaluations') && bloc.hasOwnProperty('colonne') && bloc.hasOwnProperty('listeCommentaires') && bloc.hasOwnProperty('listeEvaluations')) {
						let visibilite = 'visible'
						if (bloc.hasOwnProperty('visibilite')) {
							visibilite = bloc.visibilite
						}
						const multi = db.multi()
						multi.hmset('pad-' + id + ':' + bloc.bloc, 'id', bloc.id, 'bloc', bloc.bloc, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', bloc.vignette, 'date', bloc.date, 'identifiant', bloc.identifiant, 'commentaires', bloc.commentaires, 'evaluations', bloc.evaluations, 'colonne', bloc.colonne, 'visibilite', visibilite)
						multi.zadd('blocs:' + id, indexBloc, bloc.bloc)
						for (const commentaire of bloc.listeCommentaires) {
							if (commentaire.hasOwnProperty('id') && commentaire.hasOwnProperty('identifiant') && commentaire.hasOwnProperty('date') && commentaire.hasOwnProperty('texte')) {
								multi.zadd('commentaires:' + bloc.bloc, commentaire.id, JSON.stringify(commentaire))
							}
						}
						for (const evaluation of bloc.listeEvaluations) {
							if (evaluation.hasOwnProperty('id') && evaluation.hasOwnProperty('identifiant') && evaluation.hasOwnProperty('date') && evaluation.hasOwnProperty('etoiles')) {
								multi.zadd('evaluations:' + bloc.bloc, evaluation.id, JSON.stringify(evaluation))
							}
						}
						multi.exec(function () {
							resolve()
						})
					} else {
						resolve()
					}
				})
				donneesBlocs.push(donneesBloc)
			}
			Promise.all(donneesBlocs).then(function () {
				let registreActivite = 'active'
				let conversation = 'desactivee'
				let listeUtilisateurs = 'activee'
				let editionNom = 'desactivee'
				let ordre = 'croissant'
				let largeur = 'normale'
				let enregistrements = 'desactives'
				let copieBloc = 'desactivee'
				let admins = JSON.stringify([])
				let vues = 0
				let affichageColonnes = []
				if (donnees.pad.hasOwnProperty('registreActivite')) {
					registreActivite = donnees.pad.registreActivite
				}
				if (donnees.pad.hasOwnProperty('conversation')) {
					conversation = donnees.pad.conversation
				}
				if (donnees.pad.hasOwnProperty('listeUtilisateurs')) {
					listeUtilisateurs = donnees.pad.listeUtilisateurs
				}
				if (donnees.pad.hasOwnProperty('editionNom')) {
					editionNom = donnees.pad.editionNom
				}
				if (donnees.pad.hasOwnProperty('ordre')) {
					ordre = donnees.pad.ordre
				}
				if (donnees.pad.hasOwnProperty('largeur')) {
					largeur = donnees.pad.largeur
				}
				if (donnees.pad.hasOwnProperty('enregistrements')) {
					enregistrements = donnees.pad.enregistrements
				}
				if (donnees.pad.hasOwnProperty('copieBloc')) {
					copieBloc = donnees.pad.copieBloc
				}
				if (donnees.pad.hasOwnProperty('admins') && donnees.pad.admins.substring(0, 2) !== '"\\') { // fix bug update 0.9.0
					admins = donnees.pad.admins
				}
				if (donnees.pad.hasOwnProperty('vues')) {
					vues = donnees.pad.vues
				}
				if (donnees.pad.hasOwnProperty('affichageColonnes')) {
					affichageColonnes = donnees.pad.affichageColonnes
				} else if (donnees.pad.colonnes.length > 0) {
					const colonnes = JSON.parse(donnees.pad.colonnes)
					colonnes.forEach(function () {
						affichageColonnes.push(true)
					})
					affichageColonnes = JSON.stringify(affichageColonnes)
				} else {
					affichageColonnes = JSON.stringify(affichageColonnes)
				}
				const multi = db.multi()
				if (donnees.pad.hasOwnProperty('motdepasse') && donnees.pad.hasOwnProperty('code')) {
					multi.hmset('pads:' + id, 'id', id, 'token', donnees.pad.token, 'titre', donnees.pad.titre, 'identifiant', donnees.pad.identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'motdepasse', donnees.pad.motdepasse, 'code', donnees.pad.code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', donnees.pad.date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', affichageColonnes, 'bloc', donnees.pad.bloc, 'activite', donnees.pad.activite, 'admins', admins, 'vues', vues)
				} else if (donnees.pad.hasOwnProperty('motdepasse') && !donnees.pad.hasOwnProperty('code')) {
					multi.hmset('pads:' + id, 'id', id, 'token', donnees.pad.token, 'titre', donnees.pad.titre, 'identifiant', donnees.pad.identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'motdepasse', donnees.pad.motdepasse, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', donnees.pad.date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', affichageColonnes, 'bloc', donnees.pad.bloc, 'activite', donnees.pad.activite, 'admins', admins, 'vues', vues)
				} else if (donnees.pad.hasOwnProperty('code')) {
					multi.hmset('pads:' + id, 'id', id, 'token', donnees.pad.token, 'titre', donnees.pad.titre, 'identifiant', donnees.pad.identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'code', donnees.pad.code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', donnees.pad.date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', affichageColonnes, 'bloc', donnees.pad.bloc, 'activite', donnees.pad.activite, 'admins', admins, 'vues', vues)
				} else {
					multi.hmset('pads:' + id, 'id', id, 'token', donnees.pad.token, 'titre', donnees.pad.titre, 'identifiant', donnees.pad.identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', donnees.pad.date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', affichageColonnes, 'bloc', donnees.pad.bloc, 'activite', donnees.pad.activite, 'admins', admins, 'vues', vues)
				}
				for (const activite of donnees.activite) {
					if (activite.hasOwnProperty('bloc') && activite.hasOwnProperty('identifiant') && activite.hasOwnProperty('titre') && activite.hasOwnProperty('date') && activite.hasOwnProperty('couleur') && activite.hasOwnProperty('type') && activite.hasOwnProperty('id')) {
						multi.zadd('activite:' + id, activite.id, JSON.stringify(activite))
					}
				}
				multi.exec(async function () {
					await fs.remove(path.join(__dirname, '..', '/static/pads/' + id + '.json'))
					await fs.remove(path.join(__dirname, '..', '/static/pads/pad-' + id + '.json'))
					resolveMain('pad_ajoute_dans_db')
				})
			})
		})
	}

	function recupererDonneesUtilisateur (identifiant) {
		// Pads créés
		const donneesPadsCrees = new Promise(function (resolveMain) {
			db.smembers('pads-crees:' + identifiant, function (err, pads) {
				const donneesPads = []
				if (err) { resolveMain(donneesPads); return false }
				for (const pad of pads) {
					const donneePad = new Promise(function (resolve) {
						db.exists('pads:' + pad, async function (err, resultat) {
							if (err) { resolve({}); return false }
							if (resultat === 1) {
								db.hgetall('pads:' + pad, function (err, donnees) {
									if (err) { resolve({}); return false }
									// Pour résoudre le problème de chemin pour les fichiers déplacés
									if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
										donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
									}
									db.exists('utilisateurs:' + donnees.identifiant, function (err, resultat) {
										if (err) {
											donnees.nom = donnees.identifiant
											resolve(donnees)
											return false
										}
										if (resultat === 1) {
											db.hgetall('utilisateurs:' + donnees.identifiant, function (err, utilisateur) {
												if (err) {
													donnees.nom = donnees.identifiant
													resolve(donnees)
													return false
												}
												if (utilisateur.nom === '') {
													donnees.nom = donnees.identifiant
												} else {
													donnees.nom = utilisateur.nom
												}
												resolve(donnees)
											})
										} else {
											donnees.nom = donnees.identifiant
											resolve(donnees)
										}
									})
								})
							} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
								const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
								if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('identifiant')) {
									// Pour résoudre le problème de chemin pour les fichiers déplacés
									if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
										donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
									}
									db.exists('utilisateurs:' + donnees.identifiant, function (err, resultat) {
										if (err) {
											donnees.nom = donnees.identifiant
											resolve(donnees)
										}
										if (resultat === 1) {
											db.hgetall('utilisateurs:' + donnees.identifiant, function (err, utilisateur) {
												if (err) {
													donnees.nom = donnees.identifiant
													resolve(donnees)
													return false
												}
												if (utilisateur.nom === '') {
													donnees.nom = donnees.identifiant
												} else {
													donnees.nom = utilisateur.nom
												}
												resolve(donnees)
											})
										} else {
											donnees.nom = donnees.identifiant
											resolve(donnees)
										}
									})
								} else {
									resolve({})
								}
							} else {
								resolve({})
							}
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
				if (err) { resolveMain(donneesPads); return false }
				for (const pad of pads) {
					const donneePad = new Promise(function (resolve) {
						db.exists('pads:' + pad, async function (err, resultat) {
							if (err) { resolve({}); return false }
							if (resultat === 1) {
								db.hgetall('pads:' + pad, function (err, donnees) {
									if (err) { resolve({}); return false }
									// Pour résoudre le problème de chemin pour les fichiers déplacés
									if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
										donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
									}
									db.exists('utilisateurs:' + donnees.identifiant, function (err, resultat) {
										if (err) {
											donnees.nom = donnees.identifiant
											resolve(donnees)
											return false
										}
										if (resultat === 1) {
											db.hgetall('utilisateurs:' + donnees.identifiant, function (err, utilisateur) {
												if (err) {
													donnees.nom = donnees.identifiant
													resolve(donnees)
													return false
												}
												if (utilisateur.nom === '') {
													donnees.nom = donnees.identifiant
												} else {
													donnees.nom = utilisateur.nom
												}
												resolve(donnees)
											})
										} else {
											donnees.nom = donnees.identifiant
											resolve(donnees)
										}
									})
								})
							} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
								const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
								if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('identifiant')) {
									// Pour résoudre le problème de chemin pour les fichiers déplacés
									if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
										donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
									}
									db.exists('utilisateurs:' + donnees.identifiant, function (err, resultat) {
										if (err) {
											donnees.nom = donnees.identifiant
											resolve(donnees)
											return false
										}
										if (resultat === 1) {
											db.hgetall('utilisateurs:' + donnees.identifiant, function (err, utilisateur) {
												if (err) {
													donnees.nom = donnees.identifiant
													resolve(donnees)
													return false
												}
												if (utilisateur.nom === '') {
													donnees.nom = donnees.identifiant
												} else {
													donnees.nom = utilisateur.nom
												}
												resolve(donnees)
											})
										} else {
											donnees.nom = donnees.identifiant
											resolve(donnees)
										}
									})
								} else {
									resolve({})
								}
							} else {
								resolve({})
							}
						})
					})
					donneesPads.push(donneePad)
				}
				Promise.all(donneesPads).then(function (resultat) {
					resolveMain(resultat)
				})
			})
		})
		// Pads administrés
		const donneesPadsAdmins = new Promise(function (resolveMain) {
			db.smembers('pads-admins:' + identifiant, function (err, pads) {
				const donneesPads = []
				if (err) { resolveMain(donneesPads); return false }
				for (const pad of pads) {
					const donneePad = new Promise(function (resolve) {
						db.exists('pads:' + pad, async function (err, resultat) {
							if (err) { resolve({}); return false }
							if (resultat === 1) {
								db.hgetall('pads:' + pad, function (err, donnees) {
									if (err) { resolve({}) }
									// Pour résoudre le problème de chemin pour les fichiers déplacés
									if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
										donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
									}
									db.exists('utilisateurs:' + donnees.identifiant, function (err, resultat) {
										if (err) {
											donnees.nom = donnees.identifiant
											resolve(donnees)
											return false
										}
										if (resultat === 1) {
											db.hgetall('utilisateurs:' + donnees.identifiant, function (err, utilisateur) {
												if (err) {
													donnees.nom = donnees.identifiant
													resolve(donnees)
													return false
												}
												if (utilisateur.nom === '') {
													donnees.nom = donnees.identifiant
												} else {
													donnees.nom = utilisateur.nom
												}
												resolve(donnees)
											})
										} else {
											donnees.nom = donnees.identifiant
											resolve(donnees)
										}
									})
								})
							} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
								const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
								if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('identifiant')) {
									// Pour résoudre le problème de chemin pour les fichiers déplacés
									if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
										donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
									}
									db.exists('utilisateurs:' + donnees.identifiant, function (err, resultat) {
										if (err) {
											donnees.nom = donnees.identifiant
											resolve(donnees)
											return false
										}
										if (resultat === 1) {
											db.hgetall('utilisateurs:' + donnees.identifiant, function (err, utilisateur) {
												if (err) {
													donnees.nom = donnees.identifiant
													resolve(donnees)
													return false
												}
												if (utilisateur.nom === '') {
													donnees.nom = donnees.identifiant
												} else {
													donnees.nom = utilisateur.nom
												}
												resolve(donnees)
											})
										} else {
											donnees.nom = donnees.identifiant
											resolve(donnees)
										}
									})
								} else {
									resolve({})
								}
							} else {
								resolve({})
							}
						})
					})
					donneesPads.push(donneePad)
				}
				Promise.all(donneesPads).then(function (resultat) {
					resolveMain(resultat)
				})
			})
		})
		// Pads favoris
		const donneesPadsFavoris = new Promise(function (resolveMain) {
			db.smembers('pads-favoris:' + identifiant, function (err, pads) {
				const donneesPads = []
				if (err) { resolveMain(donneesPads) }
				for (const pad of pads) {
					const donneePad = new Promise(function (resolve) {
						db.exists('pads:' + pad, async function (err, resultat) {
							if (err) { resolve({}); return false }
							if (resultat === 1) {
								db.hgetall('pads:' + pad, function (err, donnees) {
									if (err) { resolve({}); return false }
									// Pour résoudre le problème de chemin pour les fichiers déplacés
									if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
										donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
									}
									db.exists('utilisateurs:' + donnees.identifiant, function (err, resultat) {
										if (err) {
											donnees.nom = donnees.identifiant
											resolve(donnees)
											return false
										}
										if (resultat === 1) {
											db.hgetall('utilisateurs:' + donnees.identifiant, function (err, utilisateur) {
												if (err) {
													donnees.nom = donnees.identifiant
													resolve(donnees)
													return false
												}
												if (utilisateur.nom === '') {
													donnees.nom = donnees.identifiant
												} else {
													donnees.nom = utilisateur.nom
												}
												resolve(donnees)
											})
										} else {
											donnees.nom = donnees.identifiant
											resolve(donnees)
										}
									})
								})
							} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
								const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
								if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('identifiant')) {
									// Pour résoudre le problème de chemin pour les fichiers déplacés
									if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
										donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
									}
									db.exists('utilisateurs:' + donnees.identifiant, function (err, resultat) {
										if (err) {
											donnees.nom = donnees.identifiant
											resolve(donnees)
											return false
										}
										if (resultat === 1) {
											db.hgetall('utilisateurs:' + donnees.identifiant, function (err, utilisateur) {
												if (err) {
													donnees.nom = donnees.identifiant
													resolve(donnees)
													return false
												}
												if (utilisateur.nom === '') {
													donnees.nom = donnees.identifiant
												} else {
													donnees.nom = utilisateur.nom
												}
												resolve(donnees)
											})
										} else {
											donnees.nom = donnees.identifiant
											resolve(donnees)
										}
									})
								} else {
									resolve({})
								}
							} else {
								resolve({})
							}
						})
					})
					donneesPads.push(donneePad)
				}
				Promise.all(donneesPads).then(function (resultat) {
					resolveMain(resultat)
				})
			})
		})
		return Promise.all([donneesPadsCrees, donneesPadsRejoints, donneesPadsAdmins, donneesPadsFavoris])
	}

	function recupererDonneesAuteur (identifiant) {
		// Pads créés
		const donneesPadsCrees = new Promise(function (resolveMain) {
			db.smembers('pads-crees:' + identifiant, function (err, pads) {
				const donneesPads = []
				if (err) { resolveMain(donneesPads) }
				for (const pad of pads) {
					const donneePad = new Promise(function (resolve) {
						db.exists('pads:' + pad, async function (err, resultat) {
							if (err) { resolve({}); return false }
							if (resultat === 1) {
								db.hgetall('pads:' + pad, function (err, donnees) {
									if (err) { resolve({}); return false }
									resolve(donnees)
								})
							} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
								const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
								if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('identifiant')) {
									resolve(donnees)
								} else {
									resolve({})
								}
							} else {
								resolve({})
							}
						})
					})
					donneesPads.push(donneePad)
				}
				Promise.all(donneesPads).then(function (resultat) {
					resolveMain(resultat)
				})
			})
		})
		// Pads administrés
		const donneesPadsAdmins = new Promise(function (resolveMain) {
			db.smembers('pads-admins:' + identifiant, function (err, pads) {
				const donneesPads = []
				if (err) { resolveMain(donneesPads) }
				for (const pad of pads) {
					const donneePad = new Promise(function (resolve) {
						db.exists('pads:' + pad, async function (err, resultat) {
							if (err) { resolve({}); return false }
							if (resultat === 1) {
								db.hgetall('pads:' + pad, function (err, donnees) {
									if (err) { resolve({}); return false }
									resolve(donnees)
								})
							} else if (resultat !== 1 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
								const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
								if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('identifiant')) {
									resolve(donnees)
								} else {
									resolve({})
								}
							} else {
								resolve({})
							}
						})
					})
					donneesPads.push(donneePad)
				}
				Promise.all(donneesPads).then(function (resultat) {
					resolveMain(resultat)
				})
			})
		})
		return Promise.all([donneesPadsCrees, donneesPadsAdmins])
	}

	function recupererDonneesPad (id, token, identifiant, statut, res) {
		db.hgetall('pads:' + id, function (err, pad) {
			if (err) { res.send('erreur'); return false }
			if (pad !== null && pad.hasOwnProperty('id') && pad.id === id && pad.hasOwnProperty('token') && pad.token === token) {
				// Pour homogénéité des paramètres de pad avec coadministration
				if (!pad.hasOwnProperty('admins') || (pad.hasOwnProperty('admins') && pad.admins.substring(0, 2) === '"\\')) { // fix bug update 0.9.0
					pad.admins = []
				} else if (pad.hasOwnProperty('admins') && pad.admins.substring(0, 1) === '"') { // fix bug update 0.9.0
					pad.admins = JSON.parse(JSON.parse(pad.admins))
				} else if (pad.hasOwnProperty('admins')) {
					pad.admins = JSON.parse(pad.admins)
				}
				// Vérifier si admin
				let admin = false
				if (pad.admins.includes(identifiant) || pad.identifiant === identifiant) {
					admin = true
				}
				// Vérifier accès
				let accesCode = false
				if (pad.hasOwnProperty('code') && pad.acces === 'code') {
					accesCode = true
				}
				let accesPrive = false
				if (pad.acces === 'prive') {
					accesPrive = true
				}
				let nombreColonnes = 0
				if (pad.hasOwnProperty('colonnes')) {
					nombreColonnes = JSON.parse(pad.colonnes).length
					pad.colonnes = JSON.parse(pad.colonnes)
				}
				if (pad.hasOwnProperty('notification')) {
					pad.notification = JSON.parse(pad.notification)
				}
				let vues = 0
				if (pad.hasOwnProperty('vues')) {
					vues = parseInt(pad.vues) + 1
				}
				// Pour homogénéité des paramètres de pad
				if (!pad.hasOwnProperty('ordre')) {
					pad.ordre = 'croissant'
				}
				if (!pad.hasOwnProperty('largeur')) {
					pad.largeur = 'normale'
				}
				if (!pad.hasOwnProperty('enregistrements')) {
					pad.enregistrements = 'desactives'
				}
				if ((admin || (!accesCode && !accesPrive)) && pad.hasOwnProperty('affichageColonnes')) {
					pad.affichageColonnes = JSON.parse(pad.affichageColonnes)
					if ((pad.hasOwnProperty('colonnes') && pad.affichageColonnes.length === 0) || (pad.hasOwnProperty('colonnes') && pad.affichageColonnes.length < pad.colonnes.length)) { // fix bug update 0.9.11
						const affichageColonnes = []
						if (pad.hasOwnProperty('colonnes')) {
							pad.colonnes.forEach(function () {
								affichageColonnes.push(true)
							})
						}
						pad.affichageColonnes = affichageColonnes
					}
				} else if ((admin || (!accesCode && !accesPrive)) && !pad.hasOwnProperty('affichageColonnes')) {
					const affichageColonnes = []
					if (pad.hasOwnProperty('colonnes')) {
						pad.colonnes.forEach(function () {
							affichageColonnes.push(true)
						})
					}
					pad.affichageColonnes = affichageColonnes
				}
				// Pour résoudre le problème de chemin pour les fichiers déplacés
				if (pad.hasOwnProperty('fond') && !pad.fond.includes('/img/') && pad.fond.substring(0, 1) !== '#' && pad.fond !== '') {
					pad.fond = '/' + definirDossierFichiers(id) + '/' + id + '/' + path.basename(pad.fond)
				}
				// Cacher mot de passe front
				if (pad.hasOwnProperty('motdepasse')) {
					pad.motdepasse = ''
				}
				// Cacher données front
				if (!admin) {
					if (accesCode) {
						pad.code = ''
					}
					if (accesCode || accesPrive) {
						pad.colonnes = []
						pad.affichageColonnes = []
					}
					pad.admins = []
				}
				const blocsPad = new Promise(function (resolveMain) {
					const donneesBlocs = []
					if (admin || (!accesCode && !accesPrive)) {
						db.zrange('blocs:' + id, 0, -1, function (err, blocs) {
							if (err) { resolveMain(donneesBlocs); return false }
							for (const bloc of blocs) {
								const donneesBloc = new Promise(function (resolve) {
									db.hgetall('pad-' + id + ':' + bloc, function (err, donnees) {
										if (err) { resolve({}); return false }
										if (donnees && Object.keys(donnees).length > 0) {
											// Pour résoudre le problème des capsules qui sont référencées dans une colonne inexistante
											if (parseInt(donnees.colonne) >= nombreColonnes) {
												donnees.colonne = nombreColonnes - 1
											}
											// Pour résoudre le problème de chemin pour les fichiers déplacés
											if (donnees.hasOwnProperty('vignette') && donnees.vignette !== '' && !donnees.vignette.includes('/img/') && !verifierURL(donnees.vignette, ['https', 'http'])) {
												donnees.vignette = '/' + definirDossierFichiers(id) + '/' + id + '/' + path.basename(donnees.vignette)
											}
											// Pour homogénéité des paramètres du bloc avec modération activée
											if (!donnees.hasOwnProperty('visibilite')) {
												donnees.visibilite = 'visible'
											}
											// Pour résoudre le problème lié au changement de domaine de digidoc
											if (donnees.hasOwnProperty('iframe') && donnees.iframe.includes('env-7747481.jcloud-ver-jpe.ik-server.com') === true) {
												donnees.iframe = donnees.iframe.replace('https://env-7747481.jcloud-ver-jpe.ik-server.com', process.env.VITE_ETHERPAD)
											}
											// Pour résoudre le problème lié au changement de domaine de digidoc
											if (donnees.hasOwnProperty('media') && donnees.media.includes('env-7747481.jcloud-ver-jpe.ik-server.com') === true) {
												donnees.media = donnees.media.replace('https://env-7747481.jcloud-ver-jpe.ik-server.com', process.env.VITE_ETHERPAD)
											}
											// Ne pas ajouter les capsules en attente de modération ou privées
											if (((pad.contributions === 'moderees' && donnees.visibilite === 'masquee') || donnees.visibilite === 'privee') && donnees.identifiant !== identifiant && pad.identifiant !== identifiant && !pad.admins.includes(identifiant)) {
												resolve({})
												return false
											}
											db.zcard('commentaires:' + bloc, function (err, commentaires) {
												if (err) {
													donnees.commentaires = []
													resolve(donnees)
													return false
												}
												donnees.commentaires = commentaires
												db.zrange('evaluations:' + bloc, 0, -1, function (err, evaluations) {
													if (err) {
														donnees.evaluations = []
														resolve(donnees)
														return false
													}
													const donneesEvaluations = []
													evaluations.forEach(function (evaluation) {
														donneesEvaluations.push(JSON.parse(evaluation))
													})
													donnees.evaluations = donneesEvaluations
													db.exists('utilisateurs:' + donnees.identifiant, function (err, resultat) {
														if (err) {
															donnees.nom = ''
															donnees.couleur = ''
															resolve(donnees)
															return false
														}
														if (resultat === 1) {
															db.hgetall('utilisateurs:' + donnees.identifiant, function (err, utilisateur) {
																if (err) {
																	donnees.nom = ''
																	donnees.couleur = ''
																	resolve(donnees)
																	return false
																}
																donnees.nom = utilisateur.nom
																db.hget('couleurs:' + donnees.identifiant, 'pad' + id, function (err, couleur) {
																	if (err || couleur === null) {
																		donnees.couleur = ''
																	} else {
																		donnees.couleur = couleur
																	}
																	resolve(donnees)
																})
															})
														} else {
															db.exists('noms:' + donnees.identifiant, function (err, resultat) {
																if (err) {
																	donnees.nom = ''
																	donnees.couleur = ''
																	resolve(donnees)
																	return false
																}
																if (resultat === 1) {
																	db.hget('noms:' + donnees.identifiant, 'nom', function (err, nom) {
																		if (err) {
																			donnees.nom = ''
																			donnees.couleur = ''
																			resolve(donnees)
																			return false
																		}
																		donnees.nom = nom
																		db.hget('couleurs:' + donnees.identifiant, 'pad' + id, function (err, couleur) {
																			if (err || couleur === null) {
																				donnees.couleur = ''
																			} else {
																				donnees.couleur = couleur
																			}
																			resolve(donnees)
																		})
																	})
																} else {
																	donnees.nom = ''
																	db.hget('couleurs:' + donnees.identifiant, 'pad' + id, function (err, couleur) {
																		if (err || couleur === null) {
																			donnees.couleur = ''
																		} else {
																			donnees.couleur = couleur
																		}
																		resolve(donnees)
																	})
																}
															})
														}
													})
												})
											})
										} else {
											resolve({})
										}
									})
								})
								donneesBlocs.push(donneesBloc)
							}
							Promise.all(donneesBlocs).then(function (resultat) {
								resultat = resultat.filter(function (element) {
									return Object.keys(element).length > 0
								})
								resolveMain(resultat)
							})
						})
					} else {
						resolveMain(donneesBlocs)
					}
				})
				const activitePad = new Promise(function (resolveMain) {
					const donneesEntrees = []
					if (admin || (!accesCode && !accesPrive)) {
						db.zrange('activite:' + id, 0, -1, function (err, entrees) {
							if (err) { resolveMain(donneesEntrees); return false }
							for (let entree of entrees) {
								entree = JSON.parse(entree)
								const donneesEntree = new Promise(function (resolve) {
									db.exists('utilisateurs:' + entree.identifiant, function (err, resultat) {
										if (err) {
											entree.nom = ''
											entree.couleur = ''
											resolve(entree)
											return false
										}
										if (resultat === 1) {
											db.hgetall('utilisateurs:' + entree.identifiant, function (err, utilisateur) {
												if (err) {
													entree.nom = ''
													entree.couleur = ''
													resolve(entree)
													return false
												}
												entree.nom = utilisateur.nom
												db.hget('couleurs:' + entree.identifiant, 'pad' + id, function (err, couleur) {
													if (err || couleur === null) {
														entree.couleur = ''
													} else {
														entree.couleur = couleur
													}
													resolve(entree)
												})
											})
										} else {
											db.exists('noms:' + entree.identifiant, function (err, resultat) {
												if (err) {
													entree.nom = ''
													entree.couleur = ''
													resolve(entree)
													return false
												}
												if (resultat === 1) {
													db.hget('noms:' + entree.identifiant, 'nom', function (err, nom) {
														if (err) {
															entree.nom = ''
															entree.couleur = ''
															resolve(entree)
															return false
														}
														entree.nom = nom
														db.hget('couleurs:' + entree.identifiant, 'pad' + id, function (err, couleur) {
															if (err || couleur === null) {
																entree.couleur = ''
															} else {
																entree.couleur = couleur
															}
															resolve(entree)
														})
													})
												} else {
													entree.nom = ''
													db.hget('couleurs:' + entree.identifiant, 'pad' + id, function (err, couleur) {
														if (err || couleur === null) {
															entree.couleur = ''
														} else {
															entree.couleur = couleur
														}
														resolve(entree)
													})
												}
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
					} else {
						resolveMain(donneesEntrees)
					}
				})
				Promise.all([blocsPad, activitePad]).then(function ([blocs, activite]) {
					// Définir la même couleur pour les utilisateurs qui ne sont plus dans la base de données
					const utilisateursSansCouleur = []
					const couleurs = []
					blocs = blocs.filter(function (element) {
						return Object.keys(element).length > 0
					})
					blocs.forEach(function (bloc) {
						if ((bloc.couleur === '' || bloc.couleur === null) && utilisateursSansCouleur.includes(bloc.identifiant) === false) {
							utilisateursSansCouleur.push(bloc.identifiant)
						}
					})
					activite = activite.filter(function (element) {
						return Object.keys(element).length > 0
					})
					activite.forEach(function (item) {
						if ((item.couleur === '' || item.couleur === null) && utilisateursSansCouleur.includes(item.identifiant) === false) {
							utilisateursSansCouleur.push(item.identifiant)
						}
					})
					utilisateursSansCouleur.forEach(function () {
						const couleur = choisirCouleur()
						couleurs.push(couleur)
					})
					blocs.forEach(function (bloc, indexBloc) {
						if (utilisateursSansCouleur.includes(bloc.identifiant) === true) {
							const index = utilisateursSansCouleur.indexOf(bloc.identifiant)
							blocs[indexBloc].couleur = couleurs[index]
						}
					})
					activite.forEach(function (item, indexItem) {
						if (utilisateursSansCouleur.includes(item.identifiant) === true) {
							const index = utilisateursSansCouleur.indexOf(item.identifiant)
							activite[indexItem].couleur = couleurs[index]
						}
					})
					if (pad.ordre === 'decroissant') {
						blocs.reverse()
					}
					// Ajouter nombre de vues
					db.hset('pads:' + id, 'vues', vues, function () {
						// Ajouter dans pads rejoints
						if (pad.identifiant !== identifiant && statut === 'utilisateur') {
							db.smembers('pads-rejoints:' + identifiant, function (err, padsRejoints) {
								if (err) { res.send('erreur'); return false }
								let padDejaRejoint = false
								for (const padRejoint of padsRejoints) {
									if (padRejoint === id) {
										padDejaRejoint = true
									}
								}
								if (padDejaRejoint === false && pad.acces !== 'prive') {
									const multi = db.multi()
									multi.sadd('pads-rejoints:' + identifiant, id)
									multi.sadd('pads-utilisateurs:' + identifiant, id)
									multi.hset('couleurs:' + identifiant, 'pad' + id, choisirCouleur())
									multi.sadd('utilisateurs-pads:' + id, identifiant)
									multi.exec(function () {
										res.json({ pad: pad, blocs: blocs, activite: activite.reverse() })
									})
								} else {
									// Vérifier notification mise à jour pad
									if (pad.hasOwnProperty('notification') && pad.notification.includes(identifiant)) {
										pad.notification.splice(pad.notification.indexOf(identifiant), 1)
										db.hset('pads:' + id, 'notification', JSON.stringify(pad.notification), function () {
											res.json({ pad: pad, blocs: blocs, activite: activite.reverse() })
										})
									} else {
										res.json({ pad: pad, blocs: blocs, activite: activite.reverse() })
									}
								}
							})
						} else {
							// Vérifier notification mise à jour pad
							if (pad.hasOwnProperty('notification') && pad.notification.includes(identifiant)) {
								pad.notification.splice(pad.notification.indexOf(identifiant), 1)
								db.hset('pads:' + id, 'notification', JSON.stringify(pad.notification), function () {
									res.json({ pad: pad, blocs: blocs, activite: activite.reverse() })
								})
							} else {
								res.json({ pad: pad, blocs: blocs, activite: activite.reverse() })
							}
						}
					})
				})
			} else {
				res.send('erreur')
			}
		})
	}

	async function recupererDonneesPadProtege (pad, id, identifiant) {
		return new Promise(function (resolveData) {
			let nombreColonnes = 0
			if (pad.hasOwnProperty('colonnes')) {
				nombreColonnes = JSON.parse(pad.colonnes).length
				pad.colonnes = JSON.parse(pad.colonnes)
			}
			if (pad.hasOwnProperty('affichageColonnes')) {
				pad.affichageColonnes = JSON.parse(pad.affichageColonnes)
				if ((pad.hasOwnProperty('colonnes') && pad.affichageColonnes.length === 0) || (pad.hasOwnProperty('colonnes') && pad.affichageColonnes.length < pad.colonnes.length)) { // fix bug update 0.9.11
					const affichageColonnes = []
					if (pad.hasOwnProperty('colonnes')) {
						pad.colonnes.forEach(function () {
							affichageColonnes.push(true)
						})
					}
					pad.affichageColonnes = affichageColonnes
				}
			} else {
				const affichageColonnes = []
				if (pad.hasOwnProperty('colonnes')) {
					pad.colonnes.forEach(function () {
						affichageColonnes.push(true)
					})
				}
				pad.affichageColonnes = affichageColonnes
			}
			const blocsPad = new Promise(function (resolveMain) {
				const donneesBlocs = []
				db.zrange('blocs:' + id, 0, -1, function (err, blocs) {
					if (err) { resolveMain(donneesBlocs); return false }
					for (const bloc of blocs) {
						const donneesBloc = new Promise(function (resolve) {
							db.hgetall('pad-' + id + ':' + bloc, function (err, donnees) {
								if (err) { resolve({}); return false }
								if (donnees && Object.keys(donnees).length > 0) {
									if (parseInt(donnees.colonne) >= nombreColonnes) {
										donnees.colonne = nombreColonnes - 1
									}
									if (donnees.hasOwnProperty('vignette') && donnees.vignette !== '' && !donnees.vignette.includes('/img/') && !verifierURL(donnees.vignette, ['https', 'http'])) {
										donnees.vignette = '/' + definirDossierFichiers(id) + '/' + id + '/' + path.basename(donnees.vignette)
									}
									if (!donnees.hasOwnProperty('visibilite')) {
										donnees.visibilite = 'visible'
									}
									if (donnees.hasOwnProperty('iframe') && donnees.iframe.includes('env-7747481.jcloud-ver-jpe.ik-server.com') === true) {
										donnees.iframe = donnees.iframe.replace('https://env-7747481.jcloud-ver-jpe.ik-server.com', process.env.VITE_ETHERPAD)
									}
									if (donnees.hasOwnProperty('media') && donnees.media.includes('env-7747481.jcloud-ver-jpe.ik-server.com') === true) {
										donnees.media = donnees.media.replace('https://env-7747481.jcloud-ver-jpe.ik-server.com', process.env.VITE_ETHERPAD)
									}
									if ((pad.contributions === 'moderees' && donnees.visibilite === 'masquee') || donnees.visibilite === 'privee') {
										resolve({})
										return false
									}
									db.zcard('commentaires:' + bloc, function (err, commentaires) {
										if (err) {
											donnees.commentaires = []
											resolve(donnees)
											return false
										}
										donnees.commentaires = commentaires
										db.zrange('evaluations:' + bloc, 0, -1, function (err, evaluations) {
											if (err) {
												donnees.evaluations = []
												resolve(donnees)
												return false
											}
											const donneesEvaluations = []
											evaluations.forEach(function (evaluation) {
												donneesEvaluations.push(JSON.parse(evaluation))
											})
											donnees.evaluations = donneesEvaluations
											db.exists('utilisateurs:' + donnees.identifiant, function (err, resultat) {
												if (err) {
													donnees.nom = ''
													donnees.couleur = ''
													resolve(donnees)
													return false
												}
												if (resultat === 1) {
													db.hgetall('utilisateurs:' + donnees.identifiant, function (err, utilisateur) {
														if (err) {
															donnees.nom = ''
															donnees.couleur = ''
															resolve(donnees)
															return false
														}
														donnees.nom = utilisateur.nom
														db.hget('couleurs:' + donnees.identifiant, 'pad' + id, function (err, couleur) {
															if (err || couleur === null) {
																donnees.couleur = ''
															} else {
																donnees.couleur = couleur
															}
															resolve(donnees)
														})
													})
												} else {
													db.exists('noms:' + donnees.identifiant, function (err, resultat) {
														if (err) {
															donnees.nom = ''
															donnees.couleur = ''
															resolve(donnees)
															return false
														}
														if (resultat === 1) {
															db.hget('noms:' + donnees.identifiant, 'nom', function (err, nom) {
																if (err) {
																	donnees.nom = ''
																	donnees.couleur = ''
																	resolve(donnees)
																	return false
																}
																donnees.nom = nom
																db.hget('couleurs:' + donnees.identifiant, 'pad' + id, function (err, couleur) {
																	if (err || couleur === null) {
																		donnees.couleur = ''
																	} else {
																		donnees.couleur = couleur
																	}
																	resolve(donnees)
																})
															})
														} else {
															donnees.nom = ''
															db.hget('couleurs:' + donnees.identifiant, 'pad' + id, function (err, couleur) {
																if (err || couleur === null) {
																	donnees.couleur = ''
																} else {
																	donnees.couleur = couleur
																}
																resolve(donnees)
															})
														}
													})
												}
											})
										})
									})
								} else {
									resolve({})
								}
							})
						})
						donneesBlocs.push(donneesBloc)
					}
					Promise.all(donneesBlocs).then(function (resultat) {
						resultat = resultat.filter(function (element) {
							return Object.keys(element).length > 0
						})
						resolveMain(resultat)
					})
				})
			})
			const activitePad = new Promise(function (resolveMain) {
				const donneesEntrees = []
				db.zrange('activite:' + id, 0, -1, function (err, entrees) {
					if (err) { resolveMain(donneesEntrees); return false }
					for (let entree of entrees) {
						entree = JSON.parse(entree)
						const donneesEntree = new Promise(function (resolve) {
							db.exists('utilisateurs:' + entree.identifiant, function (err, resultat) {
								if (err) {
									entree.nom = ''
									entree.couleur = ''
									resolve(entree)
									return false
								}
								if (resultat === 1) {
									db.hgetall('utilisateurs:' + entree.identifiant, function (err, utilisateur) {
										if (err) {
											entree.nom = ''
											entree.couleur = ''
											resolve(entree)
											return false
										}
										entree.nom = utilisateur.nom
										db.hget('couleurs:' + entree.identifiant, 'pad' + id, function (err, couleur) {
											if (err || couleur === null) {
												entree.couleur = ''
											} else {
												entree.couleur = couleur
											}
											resolve(entree)
										})
									})
								} else {
									db.exists('noms:' + entree.identifiant, function (err, resultat) {
										if (err) {
											entree.nom = ''
											entree.couleur = ''
											resolve(entree)
											return false
										}
										if (resultat === 1) {
											db.hget('noms:' + entree.identifiant, 'nom', function (err, nom) {
												if (err) {
													entree.nom = ''
													entree.couleur = ''
													resolve(entree)
													return false
												}
												entree.nom = nom
												db.hget('couleurs:' + entree.identifiant, 'pad' + id, function (err, couleur) {
													if (err || couleur === null) {
														entree.couleur = ''
													} else {
														entree.couleur = couleur
													}
													resolve(entree)
												})
											})
										} else {
											entree.nom = ''
											db.hget('couleurs:' + entree.identifiant, 'pad' + id, function (err, couleur) {
												if (err || couleur === null) {
													entree.couleur = ''
												} else {
													entree.couleur = couleur
												}
												resolve(entree)
											})
										}
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
				const utilisateursSansCouleur = []
				const couleurs = []
				blocs = blocs.filter(function (element) {
					return Object.keys(element).length > 0
				})
				blocs.forEach(function (bloc) {
					if ((bloc.couleur === '' || bloc.couleur === null) && utilisateursSansCouleur.includes(bloc.identifiant) === false) {
						utilisateursSansCouleur.push(bloc.identifiant)
					}
				})
				activite = activite.filter(function (element) {
					return Object.keys(element).length > 0
				})
				activite.forEach(function (item) {
					if ((item.couleur === '' || item.couleur === null) && utilisateursSansCouleur.includes(item.identifiant) === false) {
						utilisateursSansCouleur.push(item.identifiant)
					}
				})
				utilisateursSansCouleur.forEach(function () {
					const couleur = choisirCouleur()
					couleurs.push(couleur)
				})
				blocs.forEach(function (bloc, indexBloc) {
					if (utilisateursSansCouleur.includes(bloc.identifiant) === true) {
						const index = utilisateursSansCouleur.indexOf(bloc.identifiant)
						blocs[indexBloc].couleur = couleurs[index]
					}
				})
				activite.forEach(function (item, indexItem) {
					if (utilisateursSansCouleur.includes(item.identifiant) === true) {
						const index = utilisateursSansCouleur.indexOf(item.identifiant)
						activite[indexItem].couleur = couleurs[index]
					}
				})
				if (pad.ordre === 'decroissant') {
					blocs.reverse()
				}
				// Vérifier notification mise à jour pad
				if (pad.hasOwnProperty('notification') && pad.notification.includes(identifiant)) {
					pad.notification.splice(pad.notification.indexOf(identifiant), 1)
					db.hset('pads:' + id, 'notification', JSON.stringify(pad.notification), function () {
						resolveData({ pad: pad, blocs: blocs, activite: activite.reverse() })
					})
				} else {
					resolveData({ pad: pad, blocs: blocs, activite: activite.reverse() })
				}
			})
		})
	}

	async function verifierAcces (req, pad, identifiant, motdepasse) {
		return new Promise(function (resolve) {
			db.hgetall('pads:' + pad, async function (err, donnees) {
				if (err || !donnees || !donnees.hasOwnProperty('identifiant')) { resolve('erreur'); return false }
				if (identifiant === donnees.identifiant && donnees.hasOwnProperty('motdepasse') && await bcrypt.compare(motdepasse, donnees.motdepasse)) {
					db.hgetall('utilisateurs:' + identifiant, function (err, utilisateur) {
						if (err || !utilisateur || !utilisateur.hasOwnProperty('id') || !utilisateur.hasOwnProperty('nom') || !utilisateur.hasOwnProperty('langue')) { resolve('erreur'); return false }
						req.session.identifiant = utilisateur.id
						req.session.nom = utilisateur.nom
						req.session.statut = 'auteur'
						req.session.langue = utilisateur.langue
						if (!req.session.hasOwnProperty('acces')) {
							req.session.acces = []
						}
						if (!req.session.hasOwnProperty('pads')) {
							req.session.pads = []
						}
						if (!req.session.hasOwnProperty('digidrive')) {
							req.session.digidrive = []
						}
						if (!req.session.digidrive.includes(pad)) {
							req.session.digidrive.push(pad)
						}
						req.session.cookie.expires = new Date(Date.now() + dureeSession)
						resolve('pad_debloque')
					})
				} else if (identifiant === donnees.identifiant && !donnees.hasOwnProperty('motdepasse')) {
					db.exists('utilisateurs:' + identifiant, function (err, resultat) {
						if (err) { resolve('erreur'); return false }
						if (resultat === 1) {
							db.hgetall('utilisateurs:' + identifiant, async function (err, utilisateur) {
								if (err || !utilisateur || !utilisateur.hasOwnProperty('id') || !utilisateur.hasOwnProperty('motdepasse') || !utilisateur.hasOwnProperty('nom') || !utilisateur.hasOwnProperty('langue')) { resolve('erreur'); return false }
								if (motdepasse.trim() !== '' && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
									req.session.identifiant = utilisateur.id
									req.session.nom = utilisateur.nom
									req.session.statut = 'auteur'
									req.session.langue = utilisateur.langue
									if (!req.session.hasOwnProperty('acces')) {
										req.session.acces = []
									}
									if (!req.session.hasOwnProperty('pads')) {
										req.session.pads = []
									}
									if (!req.session.hasOwnProperty('digidrive')) {
										req.session.digidrive = []
									}
									if (!req.session.digidrive.includes(pad)) {
										req.session.digidrive.push(pad)
									}
									req.session.cookie.expires = new Date(Date.now() + dureeSession)
									resolve('pad_debloque')
								} else {
									resolve('erreur')
								}
							})
						} else {
							resolve('erreur')
						}
					})
				} else {
					resolve('erreur')
				}
			})
		})
	}

	function choisirCouleur () {
		const couleurs = ['#f76707', '#f59f00', '#74b816', '#37b24d', '#0ca678', '#1098ad', '#1c7ed6', '#4263eb', '#7048e8', '#ae3ec9', '#d6336c', '#f03e3e', '#495057']
		const couleur = couleurs[Math.floor(Math.random() * couleurs.length)]
		return couleur
	}

	function genererPseudo () {
		const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
		const nom = caracteres.charAt(Math.floor(Math.random() * caracteres.length)) + caracteres.charAt(Math.floor(Math.random() * caracteres.length)) + Math.floor(Math.random() * (9999 - 1000) + 1000)
		return nom
	}

	function genererMotDePasse (longueur) {
		function rand (max) {
			return Math.floor(Math.random() * max)
		}
		function verifierMotDePasse (motdepasse, regex, caracteres) {
			if (!regex.test(motdepasse)) {
				const nouveauCaractere = caracteres.charAt(rand(caracteres.length))
				const position = rand(motdepasse.length + 1)
				motdepasse = motdepasse.slice(0, position) + nouveauCaractere + motdepasse.slice(position)
			}
			return motdepasse
		}
		let caracteres = '123456789abcdefghijklmnopqrstuvwxyz'
		const caracteresSpeciaux = '!#$@*'
		const specialRegex = /[!#\$@*]/
		const majuscules = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
		const majusculesRegex = /[A-Z]/

		caracteres = caracteres.split('')
		let motdepasse = ''
		let index

		while (motdepasse.length < longueur) {
			index = rand(caracteres.length)
			motdepasse += caracteres[index]
			caracteres.splice(index, 1)
		}
		motdepasse = verifierMotDePasse(motdepasse, specialRegex, caracteresSpeciaux)
		motdepasse = verifierMotDePasse(motdepasse, majusculesRegex, majuscules)
		return motdepasse  
	}

	function verifierEmail (email) {
		const regexExp = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/gi
		return regexExp.test(email)
	}

	const televerser = multer({
		storage: multer.diskStorage({
			destination: function (req, fichier, callback) {
				const pad = req.body.pad
				const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad + '/')
				callback(null, chemin)
			},
			filename: function (req, fichier, callback) {
				const info = path.parse(fichier.originalname)
				const extension = info.ext.toLowerCase()
				let nom = v.latinise(info.name.toLowerCase())
				nom = nom.replace(/\ /gi, '-')
				nom = nom.replace(/[^0-9a-z_\-]/gi, '')
				if (nom.length > 100) {
					nom = nom.substring(0, 100)
				}
				nom = nom + '_' + Math.random().toString(36).substring(2) + extension
				callback(null, nom)
			}
		}),
		fileFilter: function (req, fichier, callback) {
			if (req.body.pad) {
				const pad = req.body.pad
				const dossier = path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad))
				checkDiskSpace(dossier).then(function (diskSpace) {
					const espace = Math.round((diskSpace.free / diskSpace.size) * 100)
					if (espace < minimumEspaceDisque) {
						callback('erreur_espace_disque')
					} else {
						callback(null, true)
					}
				})
			} else {
				callback(null, true)
			}
		}
	}).single('fichier')

	const televerserTemp = multer({
		storage: multer.diskStorage({
			destination: function (req, fichier, callback) {
				const chemin = path.join(__dirname, '..', '/static/temp/')
				callback(null, chemin)
			},
			filename: function (req, fichier, callback) {
				const info = path.parse(fichier.originalname)
				const extension = info.ext.toLowerCase()
				let nom = v.latinise(info.name.toLowerCase())
				nom = nom.replace(/\ /gi, '-')
				nom = nom.replace(/[^0-9a-z_\-]/gi, '')
				if (nom.length > 100) {
					nom = nom.substring(0, 100)
				}
				nom = nom + '_' + Math.random().toString(36).substring(2) + extension
				callback(null, nom)
			}
		}),
		fileFilter: function (req, fichier, callback) {
			if (req.body.pad) {
				const pad = req.body.pad
				const dossier = path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad))
				checkDiskSpace(dossier).then(function (diskSpace) {
					const espace = Math.round((diskSpace.free / diskSpace.size) * 100)
					if (espace < minimumEspaceDisque) {
						callback('erreur_espace_disque')
					} else {
						callback(null, true)
					}
				})
			} else {
				callback(null, true)
			}
		}
	}).single('fichier')

	async function supprimerFichier (pad, fichier) {
		const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad + '/' + fichier)
		await fs.remove(chemin)
	}

	function definirDossierFichiers (id) {
		if (process.env.VITE_NFS6_PAD_NUMBER && process.env.VITE_NFS6_PAD_NUMBER !== '' && process.env.VITE_NFS6_FOLDER && process.env.VITE_NFS6_FOLDER !== '' && parseInt(id) > parseInt(process.env.VITE_NFS6_PAD_NUMBER)) {
			return process.env.VITE_NFS6_FOLDER
		} else if (process.env.VITE_NFS5_PAD_NUMBER && process.env.VITE_NFS5_PAD_NUMBER !== '' && process.env.VITE_NFS5_FOLDER && process.env.VITE_NFS5_FOLDER !== '' && parseInt(id) > parseInt(process.env.VITE_NFS5_PAD_NUMBER)) {
			return process.env.VITE_NFS5_FOLDER
		} else if (process.env.VITE_NFS4_PAD_NUMBER && process.env.VITE_NFS4_PAD_NUMBER !== '' && process.env.VITE_NFS4_FOLDER && process.env.VITE_NFS4_FOLDER !== '' && parseInt(id) > parseInt(process.env.VITE_NFS4_PAD_NUMBER)) {
			return process.env.VITE_NFS4_FOLDER
		} else if (process.env.VITE_NFS3_PAD_NUMBER && process.env.VITE_NFS3_PAD_NUMBER !== '' && process.env.VITE_NFS3_FOLDER && process.env.VITE_NFS3_FOLDER !== '' && parseInt(id) > parseInt(process.env.VITE_NFS3_PAD_NUMBER)) {
			return process.env.VITE_NFS3_FOLDER
		} else if (process.env.VITE_NFS2_PAD_NUMBER && process.env.VITE_NFS2_PAD_NUMBER !== '' && process.env.VITE_NFS2_FOLDER && process.env.VITE_NFS2_FOLDER !== '' && parseInt(id) > parseInt(process.env.VITE_NFS2_PAD_NUMBER)) {
			return process.env.VITE_NFS2_FOLDER
		} else if (process.env.VITE_NFS_PAD_NUMBER && process.env.VITE_NFS_PAD_NUMBER !== '' && process.env.VITE_NFS_FOLDER && process.env.VITE_NFS_FOLDER !== '' && parseInt(id) > parseInt(process.env.VITE_NFS_PAD_NUMBER)) {
			return process.env.VITE_NFS_FOLDER
		} else {
			return 'fichiers'
		}
	}

	function verifierURL (s, protocoles) {
		try {
			const url = new URL(s)
			return protocoles ? url.protocol ? protocoles.map(x => `${x.toLowerCase()}:`).includes(url.protocol) : false : true
		} catch (err) {
			return false
		}
	}

	function verifierJSON (json){
		try {
			const o = JSON.parse(json)
			if (o && typeof o === 'object') {
				return o
			}
		}
		catch (e) { }
		return false
	}

	function formaterDate (donnees, langue) {
		let dateFormattee = ''
		switch (langue) {
		case 'fr':
			if (donnees.hasOwnProperty('modifie')) {
				dateFormattee = 'Créée le ' + dayjs(new Date(donnees.date)).locale('fr').format('L') + ' à ' + dayjs(new Date(donnees.date)).locale('fr').format('LT') + ' par ' + donnees.nom + '. Modifiée le ' + dayjs(new Date(donnees.modifie)).locale('fr').format('L') + ' à ' + dayjs(new Date(donnees.modifie)).locale('fr').format('LT') + '.'
			} else {
				dateFormattee = 'Créée le ' + dayjs(new Date(donnees.date)).locale('fr').format('L') + ' à ' + dayjs(new Date(donnees.date)).locale('fr').format('LT') + ' par ' + donnees.nom + '.'
			}
			break
		case 'es':
			if (donnees.hasOwnProperty('modifie')) {
				dateFormattee = 'Creada el ' + dayjs(new Date(donnees.date)).locale('es').format('L') + ' a las ' + dayjs(new Date(donnees.date)).locale('es').format('LT') + ' por ' + donnees.nom + '. Modificada el ' + dayjs(new Date(donnees.modifie)).locale('es').format('L') + ' a las ' + dayjs(new Date(donnees.modifie)).locale('es').format('LT') + '.'
			} else {
				dateFormattee = 'Creada el ' + dayjs(new Date(donnees.date)).locale('es').format('L') + ' a las ' + dayjs(new Date(donnees.date)).locale('es').format('LT') + ' por ' + donnees.nom + '.'
			}
			break
		case 'it':
			if (donnees.hasOwnProperty('modifie')) {
				dateFormattee = 'Creazione attivata ' + dayjs(new Date(donnees.date)).locale('it').format('L') + ' alle ' + dayjs(new Date(donnees.date)).locale('it').format('LT') + ' di ' + donnees.nom + '. Modifica attivata ' + dayjs(new Date(donnees.modifie)).locale('it').format('L') + ' alle ' + dayjs(new Date(donnees.modifie)).locale('it').format('LT') + '.'
			} else {
				dateFormattee = 'Creazione attivata ' + dayjs(new Date(donnees.date)).locale('it').format('L') + ' alle ' + dayjs(new Date(donnees.date)).locale('it').format('LT') + ' di ' + donnees.nom + '.'
			}
			break
		case 'de':
			if (donnees.hasOwnProperty('modifie')) {
				dateFormattee = 'Erstellt am ' + dayjs(new Date(donnees.date)).locale('de').format('L') + ' um ' + dayjs(new Date(donnees.date)).locale('de').format('LT') + ' von ' + donnees.nom + '. Geändert am ' + dayjs(new Date(donnees.modifie)).locale('de').format('L') + ' um ' + dayjs(new Date(donnees.modifie)).locale('de').format('LT') + '.'
			} else {
				dateFormattee = 'Erstellt am ' + dayjs(new Date(donnees.date)).locale('de').format('L') + ' um ' + dayjs(new Date(donnees.date)).locale('de').format('LT') + ' von ' + donnees.nom + '.'
			}
			break
		case 'hr':
			if (donnees.hasOwnProperty('modifie')) {
				dateFormattee = 'Stvoreno na ' + dayjs(new Date(donnees.date)).locale('hr').format('L') + ' u ' + dayjs(new Date(donnees.date)).locale('hr').format('LT') + ' po ' + donnees.nom + '. Izmijenjeno na ' + dayjs(new Date(donnees.modifie)).locale('hr').format('L') + ' u ' + dayjs(new Date(donnees.modifie)).locale('hr').format('LT') + '.'
			} else {
				dateFormattee = 'Stvoreno na ' + dayjs(new Date(donnees.date)).locale('hr').format('L') + ' u ' + dayjs(new Date(donnees.date)).locale('hr').format('LT') + ' po ' + donnees.nom + '.'
			}
			break
		case 'en':
			if (donnees.hasOwnProperty('modifie')) {
				dateFormattee = 'Created on ' + dayjs(new Date(donnees.date)).locale('en').format('L') + ' at ' + dayjs(new Date(donnees.date)).locale('en').format('LT') + ' by ' + donnees.nom + '. Modified on ' + dayjs(new Date(donnees.modifie)).locale('en').format('L') + ' at ' + dayjs(new Date(donnees.modifie)).locale('en').format('LT') + '.'
			} else {
				dateFormattee = 'Created on ' + dayjs(new Date(donnees.date)).locale('en').format('L') + ' at ' + dayjs(new Date(donnees.date)).locale('en').format('LT') + ' by ' + donnees.nom + '.'
			}
			break
		}
		return dateFormattee
	}

	function genererHTML (pad, blocs) {
		return `
		<!DOCTYPE html>
		<html lang="fr">
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, height=device-height, viewport-fit=cover, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
				<meta name="description" content="Digipad permet de créer des murs multimédias collaboratifs.">
				<meta name="robots" content="index, no-follow">
				<meta name="theme-color" content="#00ced1">
				<meta property="og:title" content="Digipad by La Digitale">
				<meta property="og:description" content="Digipad permet de créer des murs multimédias collaboratifs.">
				<meta property="og:type" content="website" />
				<meta property="og:locale" content="fr_FR" />
				<title>Digipad by La Digitale</title>
				<link rel="icon" type="image/png" href="./static/img/favicon.png">
				<link rel="stylesheet" href="./static/css/destyle.css">
				<link rel="stylesheet" href="./static/css/main.css">
				<link rel="stylesheet" href="./static/css/pad.css">
				<script src="./static/js/vue.js" type="text/javascript"></script>
				<script src="./static/js/vue-masonry-css.js" type="text/javascript"></script>
			</head>
			<body>
				<noscript>
					<strong>Veuillez activer Javascript dans votre navigateur pour utiliser <i>Digipad</i>.</strong>
				</noscript>
				<div id="app">
					<main id="page" :class="pad.affichage">
						<header v-if="!chargement">
							<span id="titre">{{ pad.titre }}</span>
						</header>

						<div id="pad" :class="{'fond-personnalise': pad.fond.substring(0, 1) !== '#' && !pad.fond.includes('/img/')}" :style="definirFond(pad.fond)" v-if="!chargement">
							<!-- Affichage mur -->
							<masonry id="blocs" class="mur" :cols="definirLargeurCapsules()" :gutter="0" v-if="pad.affichage === 'mur'">
								<div :id="item.bloc" class="bloc" v-for="(item, indexItem) in blocs" :style="{'border-color': couleurs[item.identifiant]}" :data-bloc="item.bloc" :key="'bloc' + indexItem">
									<div class="contenu">
										<div class="titre" v-if="item.titre !== ''" :style="{'background': eclaircirCouleur(couleurs[item.identifiant])}">
											<span>{{ item.titre }}</span>
										</div>
										<div class="texte" v-if="item.texte !== ''" v-html="item.texte"></div>
										<div class="media" v-if="item.media !== ''">
											<img v-if="item.type === 'image'" :src="'./fichiers/' + item.media" @click="afficherMedia(item)">
											<img v-else-if="item.type === 'lien-image'" :src="item.media" @click="afficherMedia(item)">
											<span v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'document' || item.type === 'pdf' || item.type === 'office' || item.type === 'embed'" @click="afficherMedia(item)"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></span>
											<span v-else-if="item.type === 'lien'"><a :href="item.media" target="_blank"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a></span>
											<span v-else><a :href="'./fichiers/' + item.media" download><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a></span>
										</div>
										<div class="evaluation" v-if="pad.evaluations === 'activees'">
											<span class="etoiles">
												<i class="material-icons" v-for="etoile in definirEvaluationCapsule(item.listeEvaluations)" :key="'etoilepleine_' + etoile">star</i>
												<i class="material-icons" v-for="etoile in (5 - definirEvaluationCapsule(item.listeEvaluations))" :key="'etoilevide_' + etoile">star_outline</i>
												<span>({{ item.listeEvaluations.length }})</span>
											</span>
										</div>
										<div class="action" :style="{'color': couleurs[item.identifiant]}">
											<span role="button" tabindex="0" class="bouton" @click="ouvrirModaleCommentaires(item.bloc, item.titre)" v-if="pad.commentaires === 'actives'"><i class="material-icons">comment</i><span class="badge">{{ item.commentaires }}</span></span>
											<span role="button" tabindex="0" class="bouton info" :data-description="item.info"><i class="material-icons">info</i></span>
											<span class="media-type" v-if="item.media !== ''"><i class="material-icons">{{ definirIconeMedia(item) }}</i></span>
										</div>
									</div>
								</div>
							</masonry>
							<!-- Affichage flux vertical -->
							<div id="blocs" class="flux-vertical" :class="{'large': pad.hasOwnProperty('largeur') && pad.largeur === 'large'}" v-else-if="pad.affichage === 'flux-vertical'">
								<div :id="item.bloc" class="bloc" v-for="(item, indexItem) in blocs" :style="{'border-color': couleurs[item.identifiant]}" :data-bloc="item.bloc" :key="'bloc' + indexItem">
									<div class="contenu">
										<div class="titre" v-if="item.titre !== ''" :style="{'background': eclaircirCouleur(couleurs[item.identifiant])}">
											<span>{{ item.titre }}</span>
										</div>
										<div class="texte" v-if="item.texte !== ''" v-html="item.texte"></div>
										<div class="media" v-if="item.media !== ''">
											<img v-if="item.type === 'image'" :src="'./fichiers/' + item.media" @click="afficherMedia(item)">
											<img v-else-if="item.type === 'lien-image'" :src="item.media" @click="afficherMedia(item)">
											<span v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'document' || item.type === 'pdf' || item.type === 'office' || item.type === 'embed'" @click="afficherMedia(item)"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></span>
											<span v-else-if="item.type === 'lien'"><a :href="item.media" target="_blank"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a></span>
											<span v-else><a :href="'./fichiers/' + item.media" download><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a></span>
										</div>
										<div class="evaluation" v-if="pad.evaluations === 'activees'">
											<span class="etoiles">
												<i class="material-icons" v-for="etoile in definirEvaluationCapsule(item.listeEvaluations)" :key="'etoilepleine_' + etoile">star</i>
												<i class="material-icons" v-for="etoile in (5 - definirEvaluationCapsule(item.listeEvaluations))" :key="'etoilevide_' + etoile">star_outline</i>
												<span>({{ item.listeEvaluations.length }})</span>
											</span>
										</div>
										<div class="action" :style="{'color': couleurs[item.identifiant]}">
											<span role="button" tabindex="0" class="bouton" @click="ouvrirModaleCommentaires(item.bloc, item.titre)" v-if="pad.commentaires === 'actives'"><i class="material-icons">comment</i><span class="badge">{{ item.commentaires }}</span></span>
											<span role="button" tabindex="0" class="bouton info" :data-description="item.info"><i class="material-icons">info</i></span>
											<span class="media-type" v-if="item.media !== ''"><i class="material-icons">{{ definirIconeMedia(item) }}</i></span>
										</div>
									</div>
								</div>
							</div>
							<!-- Affichage colonne -->
							<div id="blocs" class="colonnes" v-else-if="pad.affichage === 'colonnes'">
								<section :id="'colonne' + indexCol" class="colonne" :class="{'large': pad.hasOwnProperty('largeur') && pad.largeur === 'large'}" v-for="(col, indexCol) in pad.colonnes" :key="'colonne' + indexCol">
									<div class="bloc haut">
										<div class="titre-colonne">
											<span>{{ col }}</span>
										</div>
									</div>
									<div class="conteneur-colonne ascenseur" v-if="colonnes[indexCol].length > 0">
										<div :id="item.bloc" class="bloc" v-for="(item, indexItem) in colonnes[indexCol]" :style="{'border-color': couleurs[item.identifiant]}" :data-bloc="item.bloc" :key="'bloc' + indexItem">
											<div class="contenu">
												<div class="titre" v-if="item.titre !== ''" :style="{'background': eclaircirCouleur(couleurs[item.identifiant])}">
													<span>{{ item.titre }}</span>
												</div>
												<div class="texte" v-if="item.texte !== ''" v-html="item.texte"></div>
												<div class="media" v-if="item.media !== ''">
													<img v-if="item.type === 'image'" :src="'./fichiers/' + item.media" @click="afficherMedia(item)">
													<img v-else-if="item.type === 'lien-image'" :src="item.media" @click="afficherMedia(item)">
													<span v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'document' || item.type === 'pdf' || item.type === 'office' || item.type === 'embed'" @click="afficherMedia(item)"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></span>
													<span v-else-if="item.type === 'lien'"><a :href="item.media" target="_blank"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a></span>
													<span v-else><a :href="'./fichiers/' + item.media" download><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a></span>
												</div>
												<div class="evaluation" v-if="pad.evaluations === 'activees'">
													<span class="etoiles">
														<i class="material-icons" v-for="etoile in definirEvaluationCapsule(item.listeEvaluations)" :key="'etoilepleine_' + etoile">star</i>
														<i class="material-icons" v-for="etoile in (5 - definirEvaluationCapsule(item.listeEvaluations))" :key="'etoilevide_' + etoile">star_outline</i>
														<span>({{ item.listeEvaluations.length }})</span>
													</span>
												</div>
												<div class="action" :style="{'color': couleurs[item.identifiant]}">
													<span role="button" tabindex="0" class="bouton" @click="ouvrirModaleCommentaires(item.bloc)" v-if="pad.commentaires === 'actives'"><i class="material-icons">comment</i><span class="badge">{{ item.commentaires }}</span></span>
													<span role="button" tabindex="0" class="bouton info" :data-description="item.info"><i class="material-icons">info</i></span>
													<span class="media-type" v-if="item.media !== ''"><i class="material-icons">{{ definirIconeMedia(item) }}</i></span>
												</div>
											</div>
										</div>
									</div>
								</section>
							</div>
						</div>

						<div class="conteneur-modale" v-if="modaleCommentaires">
							<div id="discussion" class="modale" role="dialog">
								<div class="en-tete">
									<span class="titre">{{ titre }}</span>
									<span role="button" tabindex="0" class="fermer" @click="fermerModaleCommentaires"><i class="material-icons">close</i></span>
								</div>
								<ul class="commentaires ascenseur">
									<li v-for="(entreeCommentaire, indexEntreeCommentaire) in commentaires" :key="indexEntreeCommentaire">
										<span class="meta">// {{ noms[entreeCommentaire.identifiant] }}</span>
										<div class="texte" v-html="entreeCommentaire.texte"></div>
									</li>
								</ul>
							</div>
						</div>
						
						<div id="conteneur-chargement" v-if="chargement">
							<div id="chargement">
								<div class="spinner">
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
								</div>
							</div>
						</div>
					</main>
				</div>
				
				<script type="text/javascript">
					var vm = new Vue({
						el: '#app',
						data: {
							chargement: true,
							modaleCommentaires: false,
							pad: ` + JSON.stringify(pad) + `,
							blocs: ` + JSON.stringify(blocs) + `,
							colonnes: [],
							commentaires: [],
							couleurs: {},
							noms: {},
							titre: '',
							defilement: false,
							depart: 0,
							distance: 0
						},
						methods: {
							ouvrirModaleCommentaires (bloc) {
								let commentaires = []
								let titre = ''
								this.blocs.forEach(function (item) {
									if (item.bloc === bloc) {
										commentaires = item.listeCommentaires
										titre = item.titre
									}
								})
								if (commentaires.length > 0) {
									this.commentaires = commentaires
									this.titre = titre
									this.modaleCommentaires = true
								}
							},
							fermerModaleCommentaires () {
								this.modaleCommentaires = false
								this.commentaires = []
								this.titre = ''
							},
							definirFond (fond) {
								if (fond.substring(0, 1) === '#') {
									return { backgroundColor: fond }
								} else if (fond.includes('/img/')) {
									return { backgroundImage: 'url(./static/' + fond + ')' }
								} else {
									return { backgroundImage: 'url(./fichiers/' + fond.split('/').pop() + ')' }
								}
							},
							definirLargeurCapsules () {
								let donnees
								switch (this.pad.largeur) {
								case 'large':
									donnees = { default: 4, 1729: 4, 1449: 3, 1365: 2, 899: 2, 499: 1 }
									break
								case 'normale':
									donnees = { default: 5, 1729: 5, 1449: 4, 1365: 3, 899: 2, 499: 1 }
									break
								}
								return donnees
							},
							definirColonnes (blocs) {
								const colonnes = []
								if (this.pad.colonnes && JSON.parse(this.pad.colonnes).length > 0) {
									this.pad.colonnes = JSON.parse(this.pad.colonnes)
									this.pad.colonnes.forEach(function () {
										colonnes.push([])
									})
									blocs.forEach(function (bloc, index) {
										if (bloc.colonne !== undefined) {
											colonnes[parseInt(bloc.colonne)].push(bloc)
										} else {
											blocs[index].colonne = 0
											colonnes[bloc.colonne].push(bloc)
										}
									})
								} else {
									this.pad.colonnes.push('Colonne sans titre')
									colonnes.push([])
									blocs.forEach(function (bloc, index) {
										blocs[index].colonne = 0
										colonnes[0].push(bloc)
									})
								}
								this.blocs = blocs
								this.colonnes = colonnes
							},
							afficherMedia (item) {
								let lien
								if (this.verifierURL(item.media) === true) {
									lien = item.media
								} else {
									lien = './fichiers/' + item.media
								}
								window.open(lien, '_blank')
							},
							definirVignette (item) {
								let vignette
								if (item.vignette && item.vignette !== '' && this.verifierURL(item.vignette) === false && item.vignette.includes('/img/')) {
									vignette = './static/img/' + item.vignette.split('/').pop()
								} else if (item.vignette && item.vignette !== '' && this.verifierURL(item.vignette) === false && !item.vignette.includes('/img/')) {
									vignette = './fichiers/' + item.vignette.split('/').pop()
								} else if (item.vignette && item.vignette !== '' && this.verifierURL(item.vignette) === true) {
									vignette = item.vignette
								}
								return vignette
							},
							definirIconeMedia (item) {
								let icone
								switch (item.type) {
								case 'image':
								case 'lien-image':
									icone = 'image'
									break
								case 'audio':
									icone = 'volume_up'
									break
								case 'video':
									icone = 'movie'
									break
								case 'pdf':
								case 'document':
								case 'office':
									icone = 'description'
									break
								case 'lien':
									icone = 'link'
									break
								case 'embed':
									if (item.source === 'youtube' || item.source === 'vimeo' || item.source === 'dailymotion' || item.source === 'digiview') {
										icone = 'movie'
									} else if (item.source === 'slideshare' || item.media.includes('wikipedia.org') || item.media.includes('drive.google.com') || item.media.includes('docs.google.com')) {
										icone = 'description'
									} else if (item.source === 'flickr') {
										icone = 'image'
									} else if (item.source === 'soundcloud' || item.media.includes('vocaroo.com') || item.media.includes('voca.ro')) {
										icone = 'volume_up'
									} else if (item.media.includes('google.com/maps')) {
										icone = 'place'
									} else if (item.source === 'etherpad' || item.media.includes('framapad.org')) {
										icone = 'group_work'
									} else {
										icone = 'web'
									}
									break
								default:
									icone = 'save_alt'
									break
								}
								return icone
							},
							definirEvaluationCapsule (evaluations) {
								if (evaluations && evaluations.length > 0) {
									let note = 0
									evaluations.forEach(function (evaluation) {
										note = note + evaluation.etoiles
									})
									if (note > 0) {
										return Math.round(note / evaluations.length)
									} else {
										return 0
									}
								} else {
									return 0
								}
							},
							verifierURL (lien) {
								let url
								try {
									url = new URL(lien)
								} catch (_) {
									return false
								}
								return url.protocol === 'http:' || url.protocol === 'https:'
							},
							choisirCouleur () {
								const couleurs = ['#f76707', '#f59f00', '#74b816', '#37b24d', '#0ca678', '#1098ad', '#1c7ed6', '#4263eb', '#7048e8', '#ae3ec9', '#d6336c', '#f03e3e', '#495057']
								const couleur = couleurs[Math.floor(Math.random() * couleurs.length)]
								return couleur
							},
							genererPseudo () {
								const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
								const nom = caracteres.charAt(Math.floor(Math.random() * caracteres.length)) + caracteres.charAt(Math.floor(Math.random() * caracteres.length)) + Math.floor(Math.random() * (9999 - 1000) + 1000)
								return nom
							},
							eclaircirCouleur (hex) {
								if (hex && hex.substring(0, 1) === '#') {
									const r = parseInt(hex.slice(1, 3), 16)
									const v = parseInt(hex.slice(3, 5), 16)
									const b = parseInt(hex.slice(5, 7), 16)
									return 'rgba(' + r + ', ' + v + ', ' + b + ', ' + 0.15 + ')'
								} else {
									return 'transparent'
								}
							},
							activerDefilementHorizontal () {
								const pad = document.querySelector('#pad')
								pad.addEventListener('mousedown', this.defilementHorizontalDebut)
								pad.addEventListener('mouseleave', this.defilementHorizontalFin)
								pad.addEventListener('mouseup', this.defilementHorizontalFin)
								pad.addEventListener('mousemove', this.defilementHorizontalEnCours)
							},
							desactiverDefilementHorizontal () {
								const pad = document.querySelector('#pad')
								pad.removeEventListener('mousedown', this.defilementHorizontalDebut)
								pad.removeEventListener('mouseleave', this.defilementHorizontalFin)
								pad.removeEventListener('mouseup', this.defilementHorizontalFin)
								pad.removeEventListener('mousemove', this.defilementHorizontalEnCours)
							},
							defilementHorizontalDebut (event) {
								const pad = document.querySelector('#pad')
								this.defilement = true
								this.depart = event.pageX - pad.offsetLeft
								this.distance = pad.scrollLeft
							},
							defilementHorizontalFin () {
								this.defilement = false
							},
							defilementHorizontalEnCours (event) {
								if (!this.defilement) { return }
								event.preventDefault()
								const pad = document.querySelector('#pad')
								const x = event.pageX - pad.offsetLeft
								const delta = (x - this.depart) * 1.5
								pad.scrollLeft = this.distance - delta
							}
						},
						created () {
							if (this.pad.ordre === 'decroissant') {
								this.blocs.reverse()
							}
							if (this.pad.affichage === 'colonnes') {
								this.definirColonnes(this.blocs)
							}
						},
						mounted () {
							const couleurs = {}
							const noms = {}
							this.blocs.forEach(function (bloc) {
								const couleur = this.choisirCouleur()
								if (couleurs.hasOwnProperty(bloc.identifiant) === false) {
									couleurs[bloc.identifiant] = couleur
								}
								if (noms.hasOwnProperty(bloc.identifiant) === false) {
									noms[bloc.identifiant] = bloc.nom
								}
								bloc.listeCommentaires.forEach(function (commentaire) {
									if (noms.hasOwnProperty(commentaire.identifiant) === false) {
										noms[commentaire.identifiant] = this.genererPseudo()
									}
								}.bind(this))
							}.bind(this))
							this.couleurs = couleurs
							this.noms = noms
							document.title = this.pad.titre + ' - Digipad by La Digitale'
							this.chargement = false
							if (this.pad.affichage === 'colonnes') {
								this.$nextTick(function () {
									this.activerDefilementHorizontal()
								}.bind(this))
							}
						}
					})
				</script>
			</body>
		</html>`
	}
}
