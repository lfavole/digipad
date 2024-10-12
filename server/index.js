import 'dotenv/config'
import path from 'path'
import fs from 'fs-extra'
import onHeaders from 'on-headers'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/cluster-adapter'
import eiows from 'eiows'
import compression from 'compression'
import axios from 'axios'
import cors from 'cors'
import { createClient } from 'redis'
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
import RedisStore from 'connect-redis'
import session from 'express-session'
import events from 'events'
import base64 from 'base-64'
import checkDiskSpace from 'check-disk-space'
import pg from 'pg'
import { renderPage } from 'vike/server'

const production = process.env.NODE_ENV === 'production'
const cluster = parseInt(process.env.NODE_CLUSTER) === 1
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = `${__dirname}/..`

planifierCollecteDechets()

function planifierCollecteDechets () {
	if (!global.gc) {
		return false
	}
	const prochainAppel = 30 + (Math.random() * 15)
	setTimeout(function () {
		global.gc()
		planifierCollecteDechets()
	}, prochainAppel * 1000)
}

demarrerServeur()

async function demarrerServeur () {
	const app = express()
	app.use(compression())
	const httpServer = createServer(app)

	let hote = 'http://localhost:3000'
	if (production) {
		hote = process.env.DOMAIN
	} else if (process.env.PORT) {
		hote = 'http://localhost:' + process.env.PORT
	}
	let db
	let db_port = 6379
	if (process.env.DB_PORT) {
		db_port = process.env.DB_PORT
	}
	if (production) {
		db = await createClient({
			url: 'redis://default:' + process.env.DB_PWD  + '@' + process.env.DB_HOST + ':' + db_port
		}).on('error', function (err) {
			console.log('redis: ', err)
		}).connect()
	} else {
		db = await createClient({
			url: 'redis://localhost:' + db_port
		}).on('error', function (err) {
			console.log('redis: ' + err)
		}).connect()
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
	const redisStore = new RedisStore(storeOptions)
	const sessionOptions = {
		secret: process.env.SESSION_KEY,
		store: redisStore,
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

	let pgdb = false
	let pool = null
	if (production && process.env.PG_DB && parseInt(process.env.PG_DB) === 1) {
		const { Pool } = pg
		pgdb = true
		let maxCon = 240
		if (cluster === true) {
			maxCon = 15
		}
		pool = new Pool({
			user: process.env.PG_DB_USER,
			password: process.env.PG_DB_PWD,
			host: process.env.PG_DB_HOST,
			port: process.env.PG_DB_PORT,
			database: process.env.PG_DB_NAME,
			max: maxCon,
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: 360000,
			allowExitOnIdle: true
		})
		pool.on('error', function (err) {
			console.log('pg: ' + err)
		})
		const client = await pool.connect()
		await client.query('CREATE TABLE IF NOT EXISTS pads (id BIGSERIAL PRIMARY KEY, pad INTEGER NOT NULL, donnees TEXT NOT NULL, blocs TEXT NOT NULL, activite TEXT NOT NULL, date TEXT NOT NULL)')
		client.release()
	}

	let earlyHints103 = false
	if (process.env.EARLY_HINTS && parseInt(process.env.EARLY_HINTS) === 1) {
		earlyHints103 = true
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
	events.EventEmitter.defaultMaxListeners = 100

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
	app.use(bodyParser.json({ limit: '300mb' }))
	app.use(sessionMiddleware)
	app.use(cors({ 'origin': domainesAutorises }))
	if (parseInt(process.env.REVERSE_PROXY) !== 1 || !production) {
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
	}

	if (!production) {
		const vite = await import('vite')
    	const viteDevMiddleware = (
      		await vite.createServer({
        		root,
        		server: { middlewareMode: true }
			})
    	).middlewares
    	app.use(viteDevMiddleware)
  	} else if (production && parseInt(process.env.REVERSE_PROXY) !== 1) {
		const sirv = (await import('sirv')).default
		app.use(sirv(`${root}/dist/client`))
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
				langues: ['fr', 'es', 'it', 'de', 'en', 'hr'],
				langue: langue
			}
			const pageContext = await renderPage(pageContextInit)
			if (pageContext.errorWhileRendering) {
				if (!pageContext.httpResponse) {
					throw pageContext.errorWhileRendering
				}
			}
			const { httpResponse } = pageContext
			if (!httpResponse) {
				return next()
			}
			const { body, statusCode, headers, earlyHints } = httpResponse
			if (earlyHints103 === true && res.writeEarlyHints) {
				res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) })
			}
			if (headers) {
				headers.forEach(([name, value]) => res.setHeader(name, value))
			}
			res.status(statusCode).send(body)
		}
  	})

	app.get('/u/:utilisateur', function (req, res, next) {
		const identifiant = req.params.utilisateur
		if (maintenance === true) {
			res.redirect('/maintenance')
		} else if (identifiant === req.session.identifiant && req.session.statut === 'utilisateur') {
			recupererDonneesUtilisateur(identifiant).then(async function (pads) {
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
				let donnees = await db.HGETALL('utilisateurs:' + identifiant)
				donnees = Object.assign({}, donnees)
				if (donnees === null) {
					const pageContextInit = {
						urlOriginal: req.originalUrl,
						params: req.query,
						hote: hote,
						langues: ['fr', 'es', 'it', 'de', 'en', 'hr'],
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
					if (pageContext.errorWhileRendering) {
						if (!pageContext.httpResponse) {
							throw pageContext.errorWhileRendering
						}
					}
					const { httpResponse } = pageContext
					if (!httpResponse) {
						return next()
					}
					const { body, statusCode, headers, earlyHints } = httpResponse
					if (earlyHints103 === true && res.writeEarlyHints) {
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
						const donneePadsDossiers = new Promise(async function (resolve) {
							const resultat = await db.EXISTS('pads:' + pad)
							if (resultat === null || resultat === 1) {
								resolve()
							} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
								const client = await pool.connect()
								if ((await client.query('SELECT id FROM pads WHERE pad = $1', [parseInt(pad)])).rowCount > 0) {
									resolve()
								} else {
									resolve(parseInt(pad))
								}
								client.release()
							} else {
								resolve(parseInt(pad))
							}
						})
						donneesPadsDossiers.push(donneePadsDossiers)
					}
					Promise.all(donneesPadsDossiers).then(async function (padsSupprimes) {
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
						await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
						const pageContextInit = {
							urlOriginal: req.originalUrl,
							params: req.query,
							hote: hote,
							langues: ['fr', 'es', 'it', 'de', 'en', 'hr'],
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
						if (pageContext.errorWhileRendering) {
							if (!pageContext.httpResponse) {
								throw pageContext.errorWhileRendering
							}
						}
						const { httpResponse } = pageContext
						if (!httpResponse) {
							return next()
						}
						const { body, statusCode, headers, earlyHints } = httpResponse
						if (earlyHints103 === true && res.writeEarlyHints) {
							res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) })
						}
						if (headers) {
							headers.forEach(([name, value]) => res.setHeader(name, value))
						}
						res.status(statusCode).send(body)
					})
				}
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
			langues: ['fr', 'es', 'it', 'de', 'en', 'hr'],
			identifiant: req.session.identifiant,
			nom: req.session.nom,
			email: req.session.email,
			langue: req.session.langue,
			statut: req.session.statut,
			pads: req.session.pads,
			digidrive: req.session.digidrive
		}
		const pageContext = await renderPage(pageContextInit)
		if (pageContext.errorWhileRendering) {
			if (!pageContext.httpResponse) {
				throw pageContext.errorWhileRendering
			}
		}
		const { httpResponse } = pageContext
		if (!httpResponse) {
			return next()
		}
		const { body, statusCode, headers, earlyHints } = httpResponse
		if (earlyHints103 === true && res.writeEarlyHints) {
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
			hote: hote,
			langue: langue
		}
		const pageContext = await renderPage(pageContextInit)
		if (pageContext.errorWhileRendering) {
			if (!pageContext.httpResponse) {
				throw pageContext.errorWhileRendering
			}
		}
		const { httpResponse } = pageContext
		if (!httpResponse) {
			return next()
		}
		const { body, statusCode, headers, earlyHints } = httpResponse
		if (earlyHints103 === true && res.writeEarlyHints) {
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
		if (pageContext.errorWhileRendering) {
			if (!pageContext.httpResponse) {
				throw pageContext.errorWhileRendering
			}
		}
		const { httpResponse } = pageContext
		if (!httpResponse) {
			return next()
		}
		const { body, statusCode, headers, earlyHints } = httpResponse
		if (earlyHints103 === true && res.writeEarlyHints) {
			res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) })
		}
		if (headers) {
			headers.forEach(([name, value]) => res.setHeader(name, value))
		}
		res.status(statusCode).send(body)
  	})

	app.post('/api/inscription', async function (req, res) {
		const identifiant = req.body.identifiant
		const motdepasse = req.body.motdepasse
		const email = req.body.email
		const reponse = await db.EXISTS('utilisateurs:' + identifiant)
		if (reponse === null) {
			res.send('erreur'); return false
		} else if (reponse === 0) {
			const hash = await bcrypt.hash(motdepasse, 10)
			const date = dayjs().format()
			let langue = 'fr'
			if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
				langue = req.session.langue
			}
			await db.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'motdepasse', hash, 'date', date, 'nom', '', 'email', email, 'langue', langue, 'affichage', 'liste', 'classement', 'date-asc'])
			req.session.identifiant = identifiant
			req.session.nom = ''
			req.session.email = email
			req.session.langue = langue
			req.session.statut = 'utilisateur'
			req.session.cookie.expires = new Date(Date.now() + dureeSession)
			res.json({ identifiant: identifiant })
		} else {
			res.send('utilisateur_existe_deja')
		}
	})

	app.post('/api/connexion', async function (req, res) {
		const identifiant = req.body.identifiant
		const motdepasse = req.body.motdepasse
		const reponse = await db.EXISTS('utilisateurs:' + identifiant)
		if (reponse === null) { 
			res.send('erreur_connexion')
		} else if (reponse === 1) {
			let donnees = await db.HGETALL('utilisateurs:' + identifiant)
			donnees = Object.assign({}, donnees)
			if (donnees === null) { res.send('erreur_connexion'); return false }
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
					await db.HSET('utilisateurs:' + identifiant, 'motdepasse', hash)
					await db.HDEL('utilisateurs:' + identifiant, 'motdepassetemp')
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
		} else {
			res.send('erreur_connexion')
		}
	})

	app.post('/api/mot-de-passe-oublie', async function (req, res) {
		const identifiant = req.body.identifiant
		let email = req.body.email.trim()
		const reponse = await db.EXISTS('utilisateurs:' + identifiant)
		if (reponse === null) { res.send('erreur'); return false }
		if (reponse === 1) {
			let donnees = await db.HGETALL('utilisateurs:' + identifiant)
			donnees = Object.assign({}, donnees)
			if (donnees === null) { res.send('erreur'); return false }
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
						await db.HSET('utilisateurs:' + identifiant, 'motdepassetemp', hash)
						res.send('message_envoye')
					}
				})
			} else {
				res.send('email_invalide')
			}
		} else {
			res.send('identifiant_invalide')
		}
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

	app.post('/api/recuperer-donnees-auteur', async function (req, res) {
		const identifiant = req.body.identifiant
		const pad = req.body.pad
		let donnees = await db.HGETALL('pads:' + pad)
		donnees = Object.assign({}, donnees)
		if (donnees === null || !donnees.hasOwnProperty('identifiant')) { res.send('erreur'); return false }
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

	app.post('/api/recuperer-donnees-pad', async function (req, res) {
		const id = req.body.id
		const token = req.body.token
		const identifiant = req.body.identifiant
		const statut = req.body.statut
		const resultat = await db.EXISTS('pads:' + id)
		if (resultat === null) { res.send('erreur'); return false }
		let pad = await db.HGETALL('pads:' + id)
		pad = Object.assign({}, pad)
		if (resultat === 1 && pad !== null) {
			recupererDonneesPad(id, token, identifiant, statut, res)
		} else if ((resultat !== 1 || pad === null) && pgdb === true && isNaN(parseInt(id)) === false) {
			const client = await pool.connect()
			const donneesQ = await client.query('SELECT donnees, blocs, activite FROM pads WHERE pad = $1', [parseInt(id)])
			client.release()
			if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 3) {
				const donnees = { pad: JSON.parse(donneesQ.rows[0].donnees), blocs: JSON.parse(donneesQ.rows[0].blocs), activite: JSON.parse(donneesQ.rows[0].activite) }
				await ajouterPadDansDb(id, donnees)
				recupererDonneesPad(id, token, identifiant, statut, res)
			} else {
				res.send('erreur')
			}
		} else {
			res.send('erreur')
		}
	})

	app.post('/api/creer-pad', async function (req, res) {
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
			const resultat = await db.EXISTS('pad')
			if (resultat === null) { res.send('erreur_creation'); return false }
			if (resultat === 1) {
				const reponse = await db.GET('pad')
				if (reponse === null) { res.send('erreur_creation'); return false }
				const id = parseInt(reponse) + 1
				const creation = await creerPad(id, token, titre, date, identifiant, couleur)
				if (creation === true) {
					const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id)
					await fs.mkdirp(chemin)
					res.json({ id: id, token: token, titre: titre, identifiant: identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desactivee', listeUtilisateurs: 'activee', editionNom: 'desactivee', fichiers: 'actives', enregistrements: 'desactives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', copieBloc: 'desactivee', ordre: 'croissant', largeur: 'normale', date: date, colonnes: [], affichageColonnes: [], bloc: 0, activite: 0, admins: [] })
				} else {
					res.send('erreur_creation')
				}
			} else {
				const creation = await creerPad(1, token, titre, date, identifiant, couleur)
				if (creation === true) {
					const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(1) + '/1')
					await fs.mkdirp(chemin)
					res.json({ id: 1, token: token, titre: titre, identifiant: identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desactivee', listeUtilisateurs: 'activee', editionNom: 'desactivee', fichiers: 'actives', enregistrements: 'desactives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', copieBloc: 'desactivee', ordre: 'croissant', largeur: 'normale', date: date, colonnes: [], affichageColonnes: [], bloc: 0, activite: 0, admins: [] })
				} else {
					res.send('erreur_creation')
				}
			}
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
		const resultat = await db.EXISTS('pad')
		if (resultat === null) { res.send('erreur_creation'); return false }
		if (resultat === 1) {
			const reponse = await db.GET('pad')
			if (reponse === null) { res.send('erreur_creation'); return false }
			const id = parseInt(reponse) + 1
			const creation = await creerPadSansCompte(id, token, titre, hash, date, identifiant, nom, langue, '')
			if (creation === true) {
				const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id)
				await fs.mkdirp(chemin)
				req.session.langue = langue
				req.session.statut = 'auteur'
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				res.json({ id: id, token: token, titre: titre, identifiant: identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desactivee', listeUtilisateurs: 'activee', editionNom: 'desactivee', fichiers: 'actives', enregistrements: 'desactives', liens: 'actives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', copieBloc: 'desactivee', ordre: 'croissant', largeur: 'normale', date: date, colonnes: [], affichageColonnes: [], bloc: 0, activite: 0 })
			} else {
				res.send('erreur_creation')
			}
		} else {
			const creation = await creerPadSansCompte(1, token, titre, hash, date, identifiant, nom, langue, '')
			if (creation === true) {
				const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(1) + '/1')
				await fs.mkdirp(chemin)
				req.session.langue = langue
				req.session.statut = 'auteur'
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				res.json({ id: 1, token: token, titre: titre, identifiant: identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desactivee', listeUtilisateurs: 'activee', editionNom: 'desactivee', fichiers: 'actives', enregistrements: 'desactives', liens: 'actives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', copieBloc: 'desactivee', ordre: 'croissant', largeur: 'normale', date: date, colonnes: [], affichageColonnes: [], bloc: 0, activite: 0 })
			} else {
				res.send('erreur_creation')
			}
		}
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

	app.post('/api/modifier-mot-de-passe-pad', async function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant) {
			const pad = req.body.pad
			let donnees = await db.HGETALL('pads:' + pad)
			donnees = Object.assign({}, donnees)
			if (donnees === null) { res.send('erreur'); return false }
			const motdepasse = req.body.motdepasse
			const nouveaumotdepasse = req.body.nouveaumotdepasse
			if (motdepasse.trim() !== '' && nouveaumotdepasse.trim() !== '' && donnees.hasOwnProperty('motdepasse') && donnees.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donnees.motdepasse)) {
				const hash = await bcrypt.hash(nouveaumotdepasse, 10)
				await db.HSET('pads:' + pad, 'motdepasse', hash)
				res.send('motdepasse_modifie')
			} else {
				res.send('motdepasse_incorrect')
			}
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/ajouter-pad-favoris', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const pad = req.body.padId
			await db.SADD('pads-favoris:' + identifiant, pad.toString())
			res.send('pad_ajoute_favoris')
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/supprimer-pad-favoris', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const pad = req.body.padId
			await db.SREM('pads-favoris:' + identifiant, pad.toString())
			res.send('pad_supprime_favoris')
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/deplacer-pad', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const padId = req.body.padId
			const destination = req.body.destination
			let donnees = await db.HGETALL('utilisateurs:' + identifiant)
			donnees = Object.assign({}, donnees)
			if (donnees === null) { res.send('erreur_deplacement'); return false }
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
			await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
			res.send('pad_deplace')
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/dupliquer-pad', async function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const pad = req.body.padId
			const num = await db.GET('pad')
			if (num === null) { res.send('erreur_duplication'); return false }
			const id = parseInt(num) + 1
			const dossier = path.join(__dirname, '..', '/static/' + definirDossierFichiers(id))
			checkDiskSpace(dossier).then(async function (diskSpace) {
				const espace = Math.round((diskSpace.free / diskSpace.size) * 100)
				if (espace < minimumEspaceDisque) {
					res.send('erreur_espace_disque')
				} else {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { res.send('erreur_duplication'); return false }
					if (resultat === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						if (donnees === null || !donnees.hasOwnProperty('identifiant')) { res.send('erreur_duplication'); return false }
						const proprietaire = donnees.identifiant
						if (proprietaire === identifiant) {
							const donneesBlocs = []
							const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
							if (blocs === null) { res.send('erreur_duplication'); return false }
							for (const [indexBloc, bloc] of blocs.entries()) {
								const donneesBloc = new Promise(async function (resolve) {
									let infos = await db.HGETALL('pad-' + pad + ':' + bloc)
									infos = Object.assign({}, infos)
									if (infos === null) { resolve({}); return false }
									const date = dayjs().format()
									if (infos.hasOwnProperty('vignette') && infos.vignette !== '' && !String(infos.vignette).includes('/img/') && !verifierURL(infos.vignette, ['https', 'http'])) {
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
									const blocId = 'bloc-id-' + (new Date()).getTime() + Math.random().toString(16).slice(10)
									await db
									.multi()
									.HSET('pad-' + id + ':' + blocId, ['id', infos.id, 'bloc', blocId, 'titre', infos.titre, 'texte', infos.texte, 'media', infos.media, 'iframe', infos.iframe, 'type', infos.type, 'source', infos.source, 'vignette', infos.vignette, 'date', date, 'identifiant', infos.identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', infos.colonne, 'visibilite', visibilite])
									.ZADD('blocs:' + id, [{ score: indexBloc, value: blocId }])
									.exec()
									resolve(blocId)
								})
								donneesBlocs.push(donneesBloc)
							}
							Promise.all(donneesBlocs).then(async function () {
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
								if (donnees.hasOwnProperty('code')) {
									await db
									.multi()
									.INCR('pad')
									.HSET('pads:' + id, ['id', id, 'token', token, 'titre', 'Copie de ' + donnees.titre, 'identifiant', identifiant, 'fond', donnees.fond, 'acces', donnees.acces, 'code', code, 'contributions', donnees.contributions, 'affichage', donnees.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.fichiers, 'enregistrements', enregistrements, 'liens', donnees.liens, 'documents', donnees.documents, 'commentaires', donnees.commentaires, 'evaluations', donnees.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.bloc, 'activite', 0])
									.SADD('pads-crees:' + identifiant, id.toString())
									.SADD('utilisateurs-pads:' + id, identifiant)
									.HSET('couleurs:' + identifiant, 'pad' + id, couleur)
									.exec()
								} else {
									await db
									.multi()
									.INCR('pad')
									.HSET('pads:' + id, ['id', id, 'token', token, 'titre', 'Copie de ' + donnees.titre, 'identifiant', identifiant, 'fond', donnees.fond, 'acces', donnees.acces, 'contributions', donnees.contributions, 'affichage', donnees.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.fichiers, 'enregistrements', enregistrements, 'liens', donnees.liens, 'documents', donnees.documents, 'commentaires', donnees.commentaires, 'evaluations', donnees.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.bloc, 'activite', 0])
									.SADD('pads-crees:' + identifiant, id.toString())
									.SADD('utilisateurs-pads:' + id, identifiant)
									.HSET('couleurs:' + identifiant, 'pad' + id, couleur)
									.exec()
								}
								if (await fs.pathExists(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad))) {
									await fs.copy(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad), path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id))
								}
								res.json({ id: id, token: token, titre: 'Copie de ' + donnees.titre, identifiant: identifiant, fond: donnees.fond, acces: donnees.acces, code: code, contributions: donnees.contributions, affichage: donnees.affichage, registreActivite: registreActivite, conversation: conversation, listeUtilisateurs: listeUtilisateurs, editionNom: editionNom, fichiers: donnees.fichiers, enregistrements: enregistrements, liens: donnees.liens, documents: donnees.documents, commentaires: donnees.commentaires, evaluations: donnees.evaluations, copieBloc: copieBloc, ordre: ordre, largeur: largeur, date: date, colonnes: donnees.colonnes, affichageColonnes: affichageColonnes, bloc: donnees.bloc, activite: 0 })
							})
						} else {
							res.send('non_autorise')
						}
					} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
						const client = await pool.connect()
						const donneesQ = await client.query('SELECT donnees, blocs, activite FROM pads WHERE pad = $1', [parseInt(pad)])
						client.release()
						if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 3) {
							const donnees = { pad: JSON.parse(donneesQ.rows[0].donnees), blocs: JSON.parse(donneesQ.rows[0].blocs), activite: JSON.parse(donneesQ.rows[0].activite) }
							if (donnees.pad.identifiant === identifiant) {
								const date = dayjs().format()
								const donneesBlocs = []
								for (const [indexBloc, bloc] of donnees.blocs.entries()) {
									const donneesBloc = new Promise(async function (resolve) {
										if (Object.keys(bloc).length > 0) {
											if (bloc.hasOwnProperty('vignette') && bloc.vignette !== '' && !String(bloc.vignette).includes('/img/') && !verifierURL(bloc.vignette, ['https', 'http'])) {
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
											const blocId = 'bloc-id-' + (new Date()).getTime() + Math.random().toString(16).slice(10)
											await db
											.multi()
											.HSET('pad-' + id + ':' + blocId, ['id', bloc.id, 'bloc', blocId, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', bloc.vignette, 'date', date, 'identifiant', bloc.identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', bloc.colonne, 'visibilite', visibilite])
											.ZADD('blocs:' + id, [{ score: indexBloc, value: blocId }])
											.exec()
											resolve(blocId)
										} else {
											resolve({})
										}
									})
									donneesBlocs.push(donneesBloc)
								}
								Promise.all(donneesBlocs).then(async function () {
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
									if (donnees.pad.hasOwnProperty('code')) {
										await db
										.multi()
										.INCR('pad')
										.HSET('pads:' + id, ['id', id, 'token', token, 'titre', 'Copie de ' + donnees.pad.titre, 'identifiant', identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'code', code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.pad.bloc, 'activite', 0])
										.SADD('pads-crees:' + identifiant, id.toString())
										.SADD('utilisateurs-pads:' + id, identifiant)
										.HSET('couleurs:' + identifiant, 'pad' + id, couleur)
										.exec()
									} else {
										await db
										.multi()
										.INCR('pad')
										.HSET('pads:' + id, ['id', id, 'token', token, 'titre', 'Copie de ' + donnees.pad.titre, 'identifiant', identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.pad.bloc, 'activite', 0])
										.SADD('pads-crees:' + identifiant, id.toString())
										.SADD('utilisateurs-pads:' + id, identifiant)
										.HSET('couleurs:' + identifiant, 'pad' + id, couleur)
										.exec()
									}
									if (await fs.pathExists(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad))) {
										await fs.copy(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad), path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id))
									}
									res.json({ id: id, token: token, titre: 'Copie de ' + donnees.pad.titre, identifiant: identifiant, fond: donnees.pad.fond, acces: donnees.pad.acces, code: code, contributions: donnees.pad.contributions, affichage: donnees.pad.affichage, registreActivite: registreActivite, conversation: conversation, listeUtilisateurs: listeUtilisateurs, editionNom: editionNom, fichiers: donnees.pad.fichiers, enregistrements: enregistrements, liens: donnees.pad.liens, documents: donnees.pad.documents, commentaires: donnees.pad.commentaires, evaluations: donnees.pad.evaluations, copieBloc: copieBloc, ordre: ordre, largeur: largeur, date: date, colonnes: donnees.pad.colonnes, affichageColonnes: affichageColonnes, bloc: donnees.pad.bloc, activite: 0 })
								})
							} else {
								res.send('non_autorise')
							}
						} else {
							res.send('erreur_duplication')
						}
					}
				}
			})
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/exporter-pad', async function (req, res) {
		const identifiant = req.body.identifiant
		const admin = req.body.admin
		const motdepasseAdmin = process.env.VITE_ADMIN_PASSWORD
		if ((req.session.identifiant && req.session.identifiant === identifiant) || (admin !== '' && admin === motdepasseAdmin)) {
			const id = req.body.padId
			const resultat = await db.EXISTS('pads:' + id)
			if (resultat === null) { res.send('erreur_export'); return false }
			if (resultat === 1) {
				let d = await db.HGETALL('pads:' + id)
				d = Object.assign({}, d)
				if (d === null) { res.send('erreur_export'); return false }
				const proprietaire = d.identifiant
				if (proprietaire === identifiant || (admin !== '' && admin === motdepasseAdmin)) {
					const donneesPad = new Promise(async function (resolveMain) {
						let resultats = await db.HGETALL('pads:' + id)
						resultats = Object.assign({}, resultats)
						if (resultats === null) { resolveMain({}); return false }
						resolveMain(resultats)
					})
					const blocsPad = new Promise(async function (resolveMain) {
						const donneesBlocs = []
						const blocs = await db.ZRANGE('blocs:' + id, 0, -1)
						if (blocs === null) { resolveMain(donneesBlocs); return false }
						for (const bloc of blocs) {
							const donneesBloc = new Promise(async function (resolve) {
								let donnees = await db.HGETALL('pad-' + id + ':' + bloc)
								donnees = Object.assign({}, donnees)
								if (donnees === null) { resolve({}); return false }
								const donneesCommentaires = []
								const commentaires = await db.ZRANGE('commentaires:' + bloc, 0, -1)
								if (commentaires === null) { resolve(donnees); return false }
								for (let commentaire of commentaires) {
									donneesCommentaires.push(JSON.parse(commentaire))
								}
								donnees.commentaires = donneesCommentaires.length
								donnees.listeCommentaires = donneesCommentaires
								const evaluations = await db.ZRANGE('evaluations:' + bloc, 0, -1)
								if (evaluations === null) { resolve(donnees); return false }
								const donneesEvaluations = []
								evaluations.forEach(function (evaluation) {
									donneesEvaluations.push(JSON.parse(evaluation))
								})
								donnees.evaluations = donneesEvaluations.length
								donnees.listeEvaluations = donneesEvaluations
								const resultat = await db.EXISTS('noms:' + donnees.identifiant)
								if (resultat === null) { resolve(donnees); return false }
								if (resultat === 1) {
									const nom = await db.HGET('noms:' + donnees.identifiant, 'nom')
									if (nom === null) { resolve(donnees); return false }
									donnees.nom = nom
									donnees.info = formaterDate(donnees, req.session.langue)
									resolve(donnees)
								} else {
									donnees.nom = genererPseudo()
									donnees.info = formaterDate(donnees, req.session.langue)
									resolve(donnees)
								}
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
					const activitePad = new Promise(async function (resolveMain) {
						const donneesEntrees = []
						const entrees = await db.ZRANGE('activite:' + id, 0, -1)
						if (entrees === null) { resolveMain(donneesEntrees); return false }
						for (let entree of entrees) {
							entree = JSON.parse(entree)
							const donneesEntree = new Promise(async function (resolve) {
								const resultat = await db.EXISTS('utilisateurs:' + entree.identifiant)
								if (resultat === null) { resolve({}) }
								if (resultat === 1) {
									resolve(entree)
								} else {
									resolve({})
								}
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
								if (Object.keys(bloc).length > 0 && bloc.hasOwnProperty('media') && bloc.media !== '' && bloc.type !== 'embed' && await fs.pathExists(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + bloc.media))) {
									await fs.copy(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + bloc.media), path.normalize(chemin + '/' + id + '/fichiers/' + bloc.media, { overwrite: true }))
								}
								if (Object.keys(bloc).length > 0 && bloc.hasOwnProperty('vignette') && bloc.vignette !== '') {
									if (String(bloc.vignette).includes('/img/') && !verifierURL(bloc.vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/public' + bloc.vignette))) {
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
			} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(id)) === false) {
				const client = await pool.connect()
				const donneesQ = await client.query('SELECT donnees, blocs, activite FROM pads WHERE pad = $1', [parseInt(id)])
				client.release()
				if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 3) {
					const donnees = { pad: JSON.parse(donneesQ.rows[0].donnees), blocs: JSON.parse(donneesQ.rows[0].blocs), activite: JSON.parse(donneesQ.rows[0].activite) }
					if (donnees.pad.identifiant === identifiant || (admin !== '' && admin === motdepasseAdmin)) {
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
							if (Object.keys(bloc).length > 0 && bloc.hasOwnProperty('media') && bloc.media !== '' && bloc.type !== 'embed' && await fs.pathExists(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + bloc.media))) {
								await fs.copy(path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id + '/' + bloc.media), path.normalize(chemin + '/' + id + '/fichiers/' + bloc.media, { overwrite: true }))
							}
							if (Object.keys(bloc).length > 0 && bloc.hasOwnProperty('vignette') && bloc.vignette !== '') {
								if (String(bloc.vignette).includes('/img/') && !verifierURL(bloc.vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/public' + bloc.vignette))) {
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
						res.send('non_autorise')
					}
				} else {
					res.send('pad_inexistant')
				}
			} else {
				res.send('pad_inexistant')
			}
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
						const resultat = await db.GET('pad')
						if (resultat === null) { res.send('erreur_import'); return false }
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
									const donneesBloc = new Promise(async function (resolve) {
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
											if (bloc.vignette !== '' && !String(bloc.vignette).includes('/img/') && !verifierURL(bloc.vignette, ['https', 'http'])) {
												bloc.vignette = '/' + definirDossierFichiers(donnees.pad.id) + '/' + donnees.pad.id + '/' + path.basename(bloc.vignette)
											}
											let visibilite = 'visible'
											if (bloc.hasOwnProperty('visibilite')) {
												visibilite = bloc.visibilite
											}
											const blocId = 'bloc-id-' + (new Date()).getTime() + Math.random().toString(16).slice(10)
											await db
											.multi()
											.HSET('pad-' + id + ':' + blocId, ['id', bloc.id, 'bloc', blocId, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', bloc.vignette, 'date', date, 'identifiant', bloc.identifiant, 'commentaires', commentaires, 'evaluations', evaluations, 'colonne', bloc.colonne, 'visibilite', visibilite])
											.ZADD('blocs:' + id, [{ score: indexBloc, value: blocId }])
											.exec()
											if (parametres.commentaires === true) {
												for (const commentaire of bloc.listeCommentaires) {
													if (commentaire.hasOwnProperty('id') && commentaire.hasOwnProperty('identifiant') && commentaire.hasOwnProperty('date') && commentaire.hasOwnProperty('texte')) {
														await db.ZADD('commentaires:' + blocId, [{ score: commentaire.id, value: JSON.stringify(commentaire) }])
													}
												}
											}
											if (parametres.evaluations === true) {
												for (const evaluation of bloc.listeEvaluations) {
													if (evaluation.hasOwnProperty('id') && evaluation.hasOwnProperty('identifiant') && evaluation.hasOwnProperty('date') && evaluation.hasOwnProperty('etoiles')) {
														await db.ZADD('evaluations:' + blocId, [{ score: evaluation.id, value: JSON.stringify(evaluation) }])
													}
												}
											}
											if (bloc.hasOwnProperty('media') && bloc.media !== '' && bloc.type !== 'embed' && await fs.pathExists(path.normalize(cible + '/fichiers/' + bloc.media))) {
												await fs.copy(path.normalize(cible + '/fichiers/' + bloc.media), path.normalize(chemin + '/' + bloc.media, { overwrite: true }))
											}
											if (bloc.hasOwnProperty('vignette') && bloc.vignette !== '' && !String(bloc.vignette).includes('/img/') && !verifierURL(bloc.vignette, ['https', 'http']) && await fs.pathExists(path.normalize(cible + '/fichiers/' + path.basename(bloc.vignette)))) {
												await fs.copy(path.normalize(cible + '/fichiers/' + path.basename(bloc.vignette)), path.normalize(chemin + '/' + path.basename(bloc.vignette), { overwrite: true }))
											}
											resolve({ bloc: bloc.bloc, blocId: blocId })
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
									await db
									.multi()
									.INCR('pad')
									.HSET('pads:' + id, ['id', id, 'token', token, 'titre', donnees.pad.titre, 'identifiant', identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'code', code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.pad.bloc, 'activite', activiteId, 'admins', JSON.stringify([])])
									.SADD('pads-crees:' + identifiant, id.toString())
									.SADD('utilisateurs-pads:' + id, identifiant)
									.HSET('couleurs:' + identifiant, 'pad' + id, couleur)
									.exec()
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
												await db.ZADD('activite:' + id, [{ score: activite.id, value: JSON.stringify(activite) }])
											}
										}
									}
									await fs.remove(source)
									await fs.remove(cible)
									res.json({ id: id, token: token, titre: donnees.pad.titre, identifiant: identifiant, fond: donnees.pad.fond, acces: donnees.pad.acces, code: code, contributions: donnees.pad.contributions, affichage: donnees.pad.affichage, registreActivite: registreActivite, conversation: conversation, listeUtilisateurs: listeUtilisateurs, editionNom: editionNom, fichiers: donnees.pad.fichiers, enregistrements: enregistrements, liens: donnees.pad.liens, documents: donnees.pad.documents, commentaires: donnees.pad.commentaires, evaluations: donnees.pad.evaluations, copieBloc: copieBloc, ordre: ordre, largeur: largeur, date: date, colonnes: donnees.pad.colonnes, affichageColonnes: affichageColonnes, bloc: donnees.pad.bloc, activite: activiteId, admins: [] })
								})
							}
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

	app.post('/api/supprimer-pad', async function (req, res) {
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
			const resultat = await db.EXISTS('pads:' + pad)
			if (resultat === null) { res.send('erreur_suppression'); return false }
			if (resultat === 1) {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = Object.assign({}, donneesPad)
				if (donneesPad === null) { res.send('erreur_suppression'); return false }
				if (donneesPad.identifiant === identifiant) {
					const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
					if (blocs === null) { res.send('erreur_suppression'); return false }
					for (let i = 0; i < blocs.length; i++) {
						await db
						.multi()
						.DEL('commentaires:' + blocs[i])
						.DEL('evaluations:' + blocs[i])
						.DEL('pad-' + pad + ':' + blocs[i])
						.exec()
					}
					await db
					.multi()
					.DEL('blocs:' + pad)
					.DEL('pads:' + pad)
					.DEL('activite:' + pad)
					.DEL('dates-pads:' + pad)
					.SREM('pads-crees:' + identifiant, pad.toString())
					.exec()
					const utilisateurs = await db.SMEMBERS('utilisateurs-pads:' + pad)
					if (utilisateurs === null) { res.send('erreur_suppression'); return false }
					for (let j = 0; j < utilisateurs.length; j++) {
						await db.multi()
						.SREM('pads-rejoints:' + utilisateurs[j], pad.toString())
						.SREM('pads-utilisateurs:' + utilisateurs[j], pad.toString())
						.SREM('pads-admins:' + utilisateurs[j], pad.toString())
						.SREM('pads-favoris:' + utilisateurs[j], pad.toString())
						.HDEL('couleurs:' + utilisateurs[j], 'pad' + pad)
						.exec()
					}
					await db.DEL('utilisateurs-pads:' + pad)
					const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad)
					if (suppressionFichiers === true) {
						await fs.remove(chemin)
					}
					res.send('pad_supprime')
				} else {
					let donnees = await db.HGETALL('utilisateurs:' + identifiant)
					donnees = Object.assign({}, donnees)
					if (donnees === null) { res.send('erreur_suppression'); return false }
					if (donnees.hasOwnProperty('dossiers')) {
						const dossiers = JSON.parse(donnees.dossiers)
						dossiers.forEach(function (dossier, indexDossier) {
							if (dossier.pads.includes(pad)) {
								const indexPad = dossier.pads.indexOf(pad)
								dossiers[indexDossier].pads.splice(indexPad, 1)
							}
						})
						await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
					}
					if (type === 'pad-rejoint') {
						await db.SREM('pads-rejoints:' + identifiant, pad.toString())
					}
					if (type === 'pad-admin') {
						await db.SREM('pads-rejoints:' + identifiant, pad.toString())
						await db.SREM('pads-admins:' + identifiant, pad.toString())
					}
					await db.SREM('pads-favoris:' + identifiant, pad.toString())
					// Suppression de l'utilisateur dans la liste des admins du pad
					if (type === 'pad-admin') {
						let d = await db.HGETALL('pads:' + pad)
						d = Object.assign({}, d)
						if (d === null) { res.send('erreur_suppression'); return false }
						let listeAdmins = []
						if (d.hasOwnProperty('admins')) {
							listeAdmins = JSON.parse(d.admins)
						}
						const index = listeAdmins.indexOf(identifiant)
						if (index > -1) {
							listeAdmins.splice(index, 1)
						}
						await db.HSET('pads:' + pad, 'admins', JSON.stringify(listeAdmins))
						res.send('pad_supprime')
					} else {
						res.send('pad_supprime')
					}
				}
			} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
				const client = await pool.connect()
				const donneesQ = await client.query('SELECT donnees FROM pads WHERE pad = $1', [parseInt(pad)])
				client.release()
				if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 1) {
					const donneesPad = JSON.parse(donneesQ.rows[0].donnees)
					if (donneesPad.identifiant === identifiant) {
						await db.SREM('pads-crees:' + identifiant, pad.toString())
						const utilisateurs = await db.SMEMBERS('utilisateurs-pads:' + pad)
						if (utilisateurs === null) { res.send('erreur_suppression'); return false }
						for (let j = 0; j < utilisateurs.length; j++) {
							await db
							.multi()
							.SREM('pads-rejoints:' + utilisateurs[j], pad.toString())
							.SREM('pads-utilisateurs:' + utilisateurs[j], pad.toString())
							.SREM('pads-admins:' + utilisateurs[j], pad.toString())
							.SREM('pads-favoris:' + utilisateurs[j], pad.toString())
							.HDEL('couleurs:' + utilisateurs[j], 'pad' + pad)
							.exec()
						}
						await db.DEL('utilisateurs-pads:' + pad)
						if (suppressionFichiers === true) {
							await fs.remove(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad))
						}
						const client = await pool.connect()
						await client.query('DELETE FROM pads WHERE pad = $1', [parseInt(pad)])
						client.release()
						res.send('pad_supprime')
					} else {
						let donnees = await db.HGETALL('utilisateurs:' + identifiant)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { res.send('erreur_suppression'); return false }
						if (donnees.hasOwnProperty('dossiers')) {
							const dossiers = JSON.parse(donnees.dossiers)
							dossiers.forEach(function (dossier, indexDossier) {
								if (dossier.pads.includes(pad)) {
									const indexPad = dossier.pads.indexOf(pad)
									dossiers[indexDossier].pads.splice(indexPad, 1)
								}
							})
							await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
						}
						if (type === 'pad-rejoint') {
							await db.SREM('pads-rejoints:' + identifiant, pad.toString())
						}
						if (type === 'pad-admin') {
							await db.SREM('pads-rejoints:' + identifiant, pad.toString())
							await db.SREM('pads-admins:' + identifiant, pad.toString())
						}
						await db.SREM('pads-favoris:' + identifiant, pad.toString())
						// Suppression de l'utilisateur dans la liste des admins du pad
						if (type === 'pad-admin') {
							let donnees = await db.HGETALL('pads:' + pad)
							donnees = Object.assign({}, donnees)
							if (donnees !== null) {
								let listeAdmins = []
								if (donnees.hasOwnProperty('admins')) {
									listeAdmins = JSON.parse(donnees.admins)
								}
								const index = listeAdmins.indexOf(identifiant)
								if (index > -1) {
									listeAdmins.splice(index, 1)
								}
								await db.HSET('pads:' + pad, 'admins', JSON.stringify(listeAdmins))
								res.send('pad_supprime')
							} else {
								res.send('pad_supprime')
							}
						} else {
							res.send('pad_supprime')
						}
					}
				} else {
					res.send('erreur_suppression')
				}
			}
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/modifier-informations', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const nom = req.body.nom
			const email = req.body.email
			await db.HSET('utilisateurs:' + identifiant, ['nom', nom, 'email', email])
			req.session.nom = nom
			req.session.email = email
			res.send('utilisateur_modifie')
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/modifier-mot-de-passe', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant) {
			let donnees = await db.HGETALL('utilisateurs:' + identifiant)
			donnees = Object.assign({}, donnees)
			if (donnees === null) { res.send('erreur'); return false }
			const motdepasse = req.body.motdepasse
			const nouveaumotdepasse = req.body.nouveaumotdepasse
			if (motdepasse.trim() !== '' && nouveaumotdepasse.trim() !== '' && donnees.hasOwnProperty('motdepasse') && donnees.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donnees.motdepasse)) {
				const hash = await bcrypt.hash(nouveaumotdepasse, 10)
				await db.HSET('utilisateurs:' + identifiant, 'motdepasse', hash)
				res.send('motdepasse_modifie')
			} else {
				res.send('motdepasse_incorrect')
			}
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

	app.post('/api/modifier-mot-de-passe-admin', async function (req, res) {
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.VITE_ADMIN_PASSWORD) {
			const identifiant = req.body.identifiant
			const email = req.body.email
			if (identifiant !== '') {
				const resultat = await db.EXISTS('utilisateurs:' + identifiant)
				if (resultat === null) { res.send('erreur'); return false }
				if (resultat === 1) {
					const hash = await bcrypt.hash(req.body.motdepasse, 10)
					await db.HSET('utilisateurs:' + identifiant, 'motdepasse', hash)
					res.send('motdepasse_modifie')
				} else {
					res.send('identifiant_non_valide')
				}
			} else if (email !== '') {
				const utilisateurs = await db.KEYS('utilisateurs:*')
				if (utilisateurs) {
					const donneesUtilisateurs = []
					utilisateurs.forEach(function (utilisateur) {
						const donneesUtilisateur = new Promise(async function (resolve) {
							let donnees = await db.HGETALL('utilisateurs:' + utilisateur.substring(13))
							donnees = Object.assign({}, donnees)
							if (donnees === null) { resolve({}); return false }
							if (donnees.hasOwnProperty('email')) {
								resolve({ identifiant: utilisateur.substring(13), email: donnees.email })
							} else {
								resolve({})
							}
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
							await db.HSET('utilisateurs:' + utilisateurId, 'motdepasse', hash)
							res.send(utilisateurId)
						} else {
							res.send('email_non_valide')
						}
					})
				}
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/recuperer-donnees-pad-admin', async function (req, res) {
		const pad = req.body.padId
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.VITE_ADMIN_PASSWORD) {
			const resultat = await db.EXISTS('pads:' + pad)
			if (resultat === null) { res.send('erreur'); return false }
			if (resultat === 1) {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = Object.assign({}, donneesPad)
				if (donneesPad === null) { res.send('erreur'); return false }
				res.json(donneesPad)
			} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
				const client = await pool.connect()
				const donneesQ = await client.query('SELECT donnees FROM pads WHERE pad = $1', [parseInt(pad)])
				client.release()
				if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 1) {
					const donneesPad = JSON.parse(donneesQ.rows[0].donnees)
					res.json(donneesPad)
				} else {
					res.send('pad_inexistant')
				}
			} else {
				res.send('pad_inexistant')
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/modifier-donnees-pad-admin', async function (req, res) {
		const pad = req.body.padId
		const champ = req.body.champ
		const valeur = req.body.valeur
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.VITE_ADMIN_PASSWORD) {
			const resultat = await db.EXISTS('pads:' + pad)
			if (resultat === null) { res.send('erreur'); return false }
			if (resultat === 1) {
				if (champ === 'motdepasse') {
					const hash = await bcrypt.hash(valeur, 10)
					await db.HSET('pads:' + pad, champ, hash)
				} else {
					await db.HSET('pads:' + pad, champ, valeur)
				}
				res.send('donnees_modifiees')
			} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
				const client = await pool.connect()
				const donneesQ = await client.query('SELECT donnees, blocs, activite FROM pads WHERE pad = $1', [parseInt(pad)])
				client.release()
				if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 3) {
					const donnees = { pad: JSON.parse(donneesQ.rows[0].donnees), blocs: JSON.parse(donneesQ.rows[0].blocs), activite: JSON.parse(donneesQ.rows[0].activite) }
					await ajouterPadDansDb(pad, donnees)
					if (champ === 'motdepasse') {
						const hash = await bcrypt.hash(valeur, 10)
						await db.HSET('pads:' + pad, champ, hash)
					} else {
						await db.HSET('pads:' + pad, champ, valeur)
					}
					res.send('donnees_modifiees')
				} else {
					res.send('erreur')
				}
			} else {
				res.send('pad_inexistant')
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/rattacher-pad', async function (req, res) {
		const pad = req.body.padId
		const identifiant = req.body.identifiant
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.VITE_ADMIN_PASSWORD) {
			const reponse = await db.EXISTS('utilisateurs:' + identifiant)
			if (reponse === null) { res.send('erreur'); return false  }
			if (reponse === 1) {
				const resultat = await db.EXISTS('pads:' + pad)
				if (resultat === null) { res.send('erreur'); return false  }
				if (resultat === 1) {
					let donnees = await db.HGETALL('pads:' + pad)
					donnees = Object.assign({}, donnees)
					if (donnees === null) { res.send('erreur'); return false }
					if (donnees.hasOwnProperty('motdepasse')) {
						await db
						.multi()
						.SADD('pads-crees:' + identifiant, pad.toString())
						.SADD('utilisateurs-pads:' + pad, identifiant)
						.HSET('pads:' + pad, 'identifiant', identifiant)
						.HDEL('pads:' + pad, 'motdepasse')
						.SREM('pads-rejoints:' + identifiant, pad.toString())
						.SREM('pads-utilisateurs:' + identifiant, pad.toString())
						.exec()
						res.send('pad_transfere')
					} else {
						res.send('pad_cree_avec_compte')
					}
				} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
					const client = await pool.connect()
					const donneesQ = await client.query('SELECT donnees, blocs, activite FROM pads WHERE pad = $1', [parseInt(pad)])
					client.release()
					if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 3) {
						const donnees = { pad: JSON.parse(donneesQ.rows[0].donnees), blocs: JSON.parse(donneesQ.rows[0].blocs), activite: JSON.parse(donneesQ.rows[0].activite) }
						if (donnees.pad.hasOwnProperty('motdepasse')) {
							await ajouterPadDansDb(pad, donnees)
							await db
							.multi()
							.SADD('pads-crees:' + identifiant, pad.toString())
							.SADD('utilisateurs-pads:' + pad, identifiant)
							.HSET('pads:' + pad, 'identifiant', identifiant)
							.HDEL('pads:' + pad, 'motdepasse')
							.SREM('pads-rejoints:' + identifiant, pad.toString())
							.SREM('pads-utilisateurs:' + identifiant, pad.toString())
							.exec()
							res.send('pad_transfere')
						} else {
							res.send('pad_cree_avec_compte')
						}
					} else {
						res.send('erreur')
					}
				} else {
					res.send('pad_inexistant')
				}
			} else {
				res.send('utilisateur_inexistant')
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/transferer-pad', async function (req, res) {
		const nouvelIdentifiant = req.body.nouvelIdentifiant
		const pad = req.body.padId
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.VITE_ADMIN_PASSWORD) {
			const resultat = await db.EXISTS('utilisateurs:' + nouvelIdentifiant)
			if (resultat === null) { res.send('erreur'); return false  }
			if (resultat === 1) {
				const reponse = await db.EXISTS('pads:' + pad)
					if (reponse === null) { res.send('erreur'); return false  }
					if (reponse === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { res.send('erreur'); return false }
						const identifiant = donnees.identifiant
						await db
						.multi()
						.SADD('pads-crees:' + nouvelIdentifiant, pad.toString())
						.SREM('pads-crees:' + identifiant, pad.toString())
						.SADD('utilisateurs-pads:' + pad, nouvelIdentifiant)
						.SREM('utilisateurs-pads:' + pad, identifiant)
						.HSET('pads:' + pad, 'identifiant', nouvelIdentifiant)
						.SREM('pads-admins:' + nouvelIdentifiant, pad.toString())
						.SREM('pads-rejoints:' + nouvelIdentifiant, pad.toString())
						.SREM('pads-utilisateurs:' + nouvelIdentifiant, pad.toString())
						.exec()
						res.send('pad_transfere')
					} else if (reponse !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
						const client = await pool.connect()
						const donneesQ = await client.query('SELECT donnees, blocs, activite FROM pads WHERE pad = $1', [parseInt(pad)])
						client.release()
						if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 3) {
							const donnees = { pad: JSON.parse(donneesQ.rows[0].donnees), blocs: JSON.parse(donneesQ.rows[0].blocs), activite: JSON.parse(donneesQ.rows[0].activite) }
							await ajouterPadDansDb(pad, donnees)
							const identifiant = donnees.pad.identifiant
							await db
							.multi()
							.SADD('pads-crees:' + nouvelIdentifiant, pad.toString())
							.SREM('pads-crees:' + identifiant, pad.toString())
							.SADD('utilisateurs-pads:' + pad, nouvelIdentifiant)
							.SREM('utilisateurs-pads:' + pad, identifiant)
							.HSET('pads:' + pad, 'identifiant', nouvelIdentifiant)
							.SREM('pads-admins:' + nouvelIdentifiant, pad.toString())
							.SREM('pads-rejoints:' + nouvelIdentifiant, pad.toString())
							.SREM('pads-utilisateurs:' + nouvelIdentifiant, pad.toString())
							.exec()
							res.send('pad_transfere')
						} else {
							res.send('erreur')
						}
					} else {
						res.send('pad_inexistant')
					}
			} else {
				res.send('utilisateur_inexistant')
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/transferer-compte', async function (req, res) {
		const identifiant = req.body.identifiant
		const nouvelIdentifiant = req.body.nouvelIdentifiant
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.VITE_ADMIN_PASSWORD) {
			const reponse = await db.EXISTS('utilisateurs:' + identifiant)
			if (reponse === null) { res.send('erreur'); return false  }
			if (reponse === 1) {
				const r = await db.EXISTS('utilisateurs:' + nouvelIdentifiant)
				if (r === null) { res.send('erreur'); return false  }
				if (r === 1) {
					const pads = await db.SMEMBERS('pads-crees:' + identifiant)
					if (pads === null) { res.send('erreur'); return false }
					const donneesPads = []
					for (const pad of pads) {
						const donneesPad = new Promise(async function (resolve) {
							const resultat = await db.EXISTS('pads:' + pad)
							if (resultat === null) { resolve('erreur'); return false  }
							if (resultat === 1) {
								await db
								.multi()
								.SADD('pads-crees:' + nouvelIdentifiant, pad.toString())
								.SREM('pads-crees:' + identifiant, pad.toString())
								.SADD('utilisateurs-pads:' + pad, nouvelIdentifiant)
								.SREM('utilisateurs-pads:' + pad, identifiant)
								.HSET('pads:' + pad, 'identifiant', nouvelIdentifiant)
								.SREM('pads-admins:' + nouvelIdentifiant, pad.toString())
								.SREM('pads-rejoints:' + nouvelIdentifiant, pad.toString())
								.SREM('pads-utilisateurs:' + nouvelIdentifiant, pad.toString())
								.exec()
								resolve('pad_transfere')
							} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
								const client = await pool.connect()
								const donneesQ = await client.query('SELECT donnees, blocs, activite FROM pads WHERE pad = $1', [parseInt(pad)])
								client.release()
								if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 3) {
									const donnees = { pad: JSON.parse(donneesQ.rows[0].donnees), blocs: JSON.parse(donneesQ.rows[0].blocs), activite: JSON.parse(donneesQ.rows[0].activite) }
									await ajouterPadDansDb(pad, donnees)
									await db
									.multi()
									.SADD('pads-crees:' + nouvelIdentifiant, pad.toString())
									.SREM('pads-crees:' + identifiant, pad.toString())
									.SADD('utilisateurs-pads:' + pad, nouvelIdentifiant)
									.SREM('utilisateurs-pads:' + pad, identifiant)
									.HSET('pads:' + pad, 'identifiant', nouvelIdentifiant)
									.SREM('pads-admins:' + nouvelIdentifiant, pad.toString())
									.SREM('pads-rejoints:' + nouvelIdentifiant, pad.toString())
									.SREM('pads-utilisateurs:' + nouvelIdentifiant, pad.toString())
									.exec()
									resolve('pad_transfere')
								} else {
									resolve('erreur')
								}
							} else {
								resolve('pad_inexistant')
							}
						})
						donneesPads.push(donneesPad)
					}
					Promise.all(donneesPads).then(function () {
						res.send('compte_transfere')
					})
				} else {
					res.send('utilisateur_inexistant')
				}
			} else {
				res.send('utilisateur_inexistant')
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/supprimer-compte', async function (req, res) {
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
			const pads = await db.SMEMBERS('pads-crees:' + identifiant)
			if (pads === null) { res.send('erreur'); return false }
			const donneesPads = []
			for (const pad of pads) {
				const donneesPad = new Promise(async function (resolve) {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { resolve(); return false }
					if (resultat === 1) {
						const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
						if (blocs === null) { resolve(); return false }
						for (let i = 0; i < blocs.length; i++) {
							await db
							.multi()
							.DEL('commentaires:' + blocs[i])
							.DEL('evaluations:' + blocs[i])
							.DEL('pad-' + pad + ':' + blocs[i])
							.exec()
						}
						await db
						.multi()
						.DEL('blocs:' + pad)
						.DEL('pads:' + pad)
						.DEL('activite:' + pad)
						.DEL('dates-pads:' + pad)
						.exec()
						const utilisateurs = await db.SMEMBERS('utilisateurs-pads:' + pad)
						if (utilisateurs === null) { resolve(); return false }
						for (let j = 0; j < utilisateurs.length; j++) {
							await db
							.multi()
							.SREM('pads-rejoints:' + utilisateurs[j], pad.toString())
							.SREM('pads-utilisateurs:' + utilisateurs[j], pad.toString())
							.SREM('pads-admins:' + utilisateurs[j], pad.toString())
							.SREM('pads-favoris:' + utilisateurs[j], pad.toString())
							.HDEL('couleurs:' + utilisateurs[j], 'pad' + pad)
							.exec()
						}
						await db.DEL('utilisateurs-pads:' + pad)
						const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad)
						await fs.remove(chemin)
						resolve(pad)
					} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
						const client = await pool.connect()
						if ((await client.query('SELECT id FROM pads WHERE pad = $1', [parseInt(pad)])).rowCount > 0) {
							const utilisateurs = await db.SMEMBERS('utilisateurs-pads:' + pad)
							if (utilisateurs === null) { resolve(); return false }
							for (let j = 0; j < utilisateurs.length; j++) {
								await db
								.multi()
								.SREM('pads-rejoints:' + utilisateurs[j], pad.toString())
								.SREM('pads-utilisateurs:' + utilisateurs[j], pad.toString())
								.SREM('pads-admins:' + utilisateurs[j], pad.toString())
								.SREM('pads-favoris:' + utilisateurs[j], pad.toString())
								.HDEL('couleurs:' + utilisateurs[j], 'pad' + pad)
								.exec()
							}
							await db.DEL('utilisateurs-pads:' + pad)
							await fs.remove(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad))
							await client.query('DELETE FROM pads WHERE pad = $1', [parseInt(pad)])
							client.release()
							resolve(pad)
						} else {
							client.release()
							resolve()
						}
					} else {
						resolve()
					}
				})
				donneesPads.push(donneesPad)
			}
			Promise.all(donneesPads).then(async function () {
				const pads = await db.SMEMBERS('pads-utilisateurs:' + identifiant)
				if (pads === null) { res.send('erreur'); return false }
				const donneesBlocs = []
				const donneesActivites = []
				const donneesCommentaires = []
				const donneesEvaluations = []
				for (const pad of pads) {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { res.send('erreur'); return false }
					if (resultat === 1) {
						const donneesBloc = new Promise(async function (resolve) {
							const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
							if (blocs === null) { resolve(); return false }
							for (let i = 0; i < blocs.length; i++) {
								let donnees = await db.HGETALL('pad-' + pad + ':' + blocs[i])
								donnees = Object.assign({}, donnees)
								if (donnees === null) { resolve(); return false }
								if (donnees.hasOwnProperty('identifiant') && donnees.identifiant === identifiant) {
									if (donnees.hasOwnProperty('media') && donnees.media !== '' && donnees.type !== 'embed') {
										supprimerFichier(pad, donnees.media)
									}
									if (donnees.hasOwnProperty('vignette') && donnees.vignette !== '' && !String(donnees.vignette).includes('/img/') && !verifierURL(donnees.vignette, ['https', 'http'])) {
										supprimerFichier(pad, path.basename(donnees.vignette))
									}
									await db
									.multi()
									.DEL('pad-' + pad + ':' + blocs[i])
									.ZREM('blocs:' + pad, blocs[i])
									.DEL('commentaires:' + blocs[i])
									.DEL('evaluations:' + blocs[i])
									.exec()
									resolve(blocs[i])
								} else {
									resolve(blocs[i])
								}
							}
						})
						donneesBlocs.push(donneesBloc)
						const donneesActivite = new Promise(async function (resolve) {
							const entrees = await db.ZRANGE('activite:' + pad, 0, -1)
							if (entrees === null) { resolve(); return false }
							for (let i = 0; i < entrees.length; i++) {
								const entree = JSON.parse(entrees[i])
								if (entree.identifiant === identifiant) {
									await db.ZREMRANGEBYSCORE('activite:' + pad, entree.id, entree.id)
									resolve(entree.id)
								} else {
									resolve(entree.id)
								}
							}
						})
						donneesActivites.push(donneesActivite)
						const donneesCommentaire = new Promise(async function (resolve) {
							const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
							if (blocs === null) { resolve() }
							for (let i = 0; i < blocs.length; i++) {
								const commentaires = await db.ZRANGE('commentaires:' + blocs[i], 0, -1)
								if (commentaires === null) { resolve(); return false }
								for (let j = 0; j < commentaires.length; j++) {
									const commentaire = JSON.parse(commentaires[j])
									if (commentaire.identifiant === identifiant) {
										await db.ZREMRANGEBYSCORE('commentaires:' + blocs[i], commentaire.id, commentaire.id)
										resolve(commentaire.id)
									} else {
										resolve(commentaire.id)
									}
								}
							}
						})
						donneesCommentaires.push(donneesCommentaire)
						const donneesEvaluation = new Promise(async function (resolve) {
							const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
							if (blocs === null) { resolve(); return false }
							for (let i = 0; i < blocs.length; i++) {
								const evaluations = await db.ZRANGE('evaluations:' + blocs[i], 0, -1)
								if (evaluations === null) { resolve(); return false }
								for (let j = 0; j < evaluations.length; j++) {
									const evaluation = JSON.parse(evaluations[j])
									if (evaluation.identifiant === identifiant) {
										await db.ZREMRANGEBYSCORE('evaluations:' + blocs[i], evaluation.id, evaluation.id)
										resolve(evaluation.id)
									} else {
										resolve(evaluation.id)
									}
								}
							}
						})
						donneesEvaluations.push(donneesEvaluation)
					} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
						const client = await pool.connect()
						const donneesQ = await client.query('SELECT donnees, blocs, activite FROM pads WHERE pad = $1', [parseInt(pad)])
						client.release()
						if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 3) {
							const donnees = { pad: JSON.parse(donneesQ.rows[0].donnees), blocs: JSON.parse(donneesQ.rows[0].blocs), activite: JSON.parse(donneesQ.rows[0].activite) }
							const blocs = donnees.blocs
							const entrees = donnees.activite
							const donneesBloc = new Promise(async function (resolve) {
								for (let i = 0; i < blocs.length; i++) {
									if (blocs[i].identifiant === identifiant) {
										if (blocs[i].hasOwnProperty('media') && blocs[i].media !== '' && blocs[i].type !== 'embed') {
											supprimerFichier(pad, blocs[i].media)
										}
										if (blocs[i].hasOwnProperty('vignette') && blocs[i].vignette !== '' && !String(blocs[i].vignette).includes('/img/') && !verifierURL(blocs[i].vignette, ['https', 'http'])) {
											supprimerFichier(pad, path.basename(blocs[i].vignette))
										}
										await db
										.multi()
										.DEL('pad-' + pad + ':' + blocs[i].bloc)
										.ZREM('blocs:' + pad, blocs[i].bloc)
										.DEL('commentaires:' + blocs[i].bloc)
										.DEL('evaluations:' + blocs[i].bloc)
										.exec()
										resolve(blocs[i].bloc)
									} else {
										resolve(blocs[i].bloc)
									}
								}
							})
							donneesBlocs.push(donneesBloc)
							const donneesActivite = new Promise(async function (resolve) {
								for (let i = 0; i < entrees.length; i++) {
									if (entrees[i].identifiant === identifiant) {
										await db.ZREMRANGEBYSCORE('activite:' + pad, entrees[i].id, entrees[i].id)
										resolve(entrees[i].id)
									} else {
										resolve(entrees[i].id)
									}
								}
							})
							donneesActivites.push(donneesActivite)
							const donneesCommentaire = new Promise(async function (resolve) {
								for (let i = 0; i < blocs.length; i++) {
									const commentaires = await db.ZRANGE('commentaires:' + blocs[i].bloc, 0, -1)
									if (commentaires === null) { resolve(); return false }
									for (let j = 0; j < commentaires.length; j++) {
										const commentaire = JSON.parse(commentaires[j])
										if (commentaire.identifiant === identifiant) {
											await db.ZREMRANGEBYSCORE('commentaires:' + blocs[i].bloc, commentaire.id, commentaire.id)
											resolve(commentaire.id)
										} else {
											resolve(commentaire.id)
										}
									}
								}
							})
							donneesCommentaires.push(donneesCommentaire)
							const donneesEvaluation = new Promise(async function (resolve) {
								for (let i = 0; i < blocs.length; i++) {
									const evaluations = await db.ZRANGE('evaluations:' + blocs[i].bloc, 0, -1)
									if (evaluations === null) { resolve(); return false }
									for (let j = 0; j < evaluations.length; j++) {
										const evaluation = JSON.parse(evaluations[j])
										if (evaluation.identifiant === identifiant) {
											await db.ZREMRANGEBYSCORE('evaluations:' + blocs[i].bloc, evaluation.id, evaluation.id)
											resolve(evaluation.id)
										} else {
											resolve(evaluation.id)
										}
									}
								}
							})
							donneesEvaluations.push(donneesEvaluation)
						}
					}
				}
				Promise.all([donneesBlocs, donneesActivites, donneesCommentaires, donneesEvaluations]).then(async function () {
					await db
					.multi()
					.DEL('pads-crees:' + identifiant)
					.DEL('pads-rejoints:' + identifiant)
					.DEL('pads-favoris:' + identifiant)
					.DEL('pads-admins:' + identifiant)
					.DEL('pads-utilisateurs:' + identifiant)
					.DEL('utilisateurs:' + identifiant)
					.DEL('couleurs:' + identifiant)
					.DEL('noms:' + identifiant)
					.exec()
					if (type === 'utilisateur') {
						req.session.identifiant = ''
						req.session.nom = ''
						req.session.email = ''
						req.session.langue = ''
						req.session.statut = ''
						req.session.destroy()
						res.send('compte_supprime')
					} else {
						const sessions = await db.KEYS('sessions:*')
						if (sessions !== null) {
							const donneesSessions = []
							sessions.forEach(function (session) {
								const donneesSession = new Promise(async function (resolve) {
									const donnees = await db.GET('sessions:' + session.substring(9))
									if (donnees === null) { resolve({}); return false }
									donnees = JSON.parse(donnees)
									if (donnees.hasOwnProperty('identifiant')) {
										resolve({ session: session.substring(9), identifiant: donnees.identifiant })
									} else {
										resolve({})
									}
								})
								donneesSessions.push(donneesSession)
							})
							Promise.all(donneesSessions).then(async function (donnees) {
								let sessionId = ''
								donnees.forEach(function (item) {
									if (item.hasOwnProperty('identifiant') && item.identifiant === identifiant) {
										sessionId = item.session
									}
								})
								if (sessionId !== '') {
									await db.DEL('sessions:' + sessionId)
								}
								res.send('compte_supprime')
							})
						} else {
							res.send('erreur')
						}
					}
				})
			})
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/verifier-identifiant', async function (req, res) {
		const identifiant = req.body.identifiant
		const resultat = await db.EXISTS('utilisateurs:' + identifiant)
		if (resultat === null) { res.send('erreur'); return false }
		if (resultat === 1) {
			res.send('identifiant_valide')
		} else {
			res.send('identifiant_non_valide')
		}
	})

	app.post('/api/verifier-mot-de-passe', async function (req, res) {
		const pad = req.body.pad
		let donnees = await db.HGETALL('pads:' + pad)
		donnees = Object.assign({}, donnees)
		if (donnees === null || !donnees.hasOwnProperty('motdepasse')) { res.send('erreur'); return false }
		if (req.body.motdepasse.trim() !== '' && donnees.hasOwnProperty('motdepasse') && donnees.motdepasse.trim() !== '' && await bcrypt.compare(req.body.motdepasse, donnees.motdepasse)) {
			res.send('motdepasse_correct')
		} else {
			res.send('motdepasse_incorrect')
		}
	})

	app.post('/api/verifier-code-acces', async function (req, res) {
		const pad = req.body.pad
		const identifiant = req.body.identifiant
		const code = req.body.code
		let donnees = await db.HGETALL('pads:' + pad)
		donnees = Object.assign({}, donnees)
		if (donnees === null || !donnees.hasOwnProperty('code')) { res.send('erreur'); return false }
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

	app.post('/api/modifier-langue', async function (req, res) {
		const identifiant = req.body.identifiant
		const langue = req.body.langue
		if (req.session.identifiant && req.session.identifiant === identifiant) {
			await db.HSET('utilisateurs:' + identifiant, 'langue', langue)
			req.session.langue = langue
		} else {
			req.session.langue = langue
		}
		res.send('langue_modifiee')
	})

	app.post('/api/modifier-affichage', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const affichage = req.body.affichage
			await db.HSET('utilisateurs:' + identifiant, 'affichage', affichage)
			res.send('affichage_modifie')
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/modifier-classement', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const classement = req.body.classement
			await db.HSET('utilisateurs:' + identifiant, 'classement', classement)
			req.session.classement = classement
			res.send('classement_modifie')
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/ajouter-dossier', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const nom = req.body.dossier
			let donnees = await db.HGETALL('utilisateurs:' + identifiant)
			donnees = Object.assign({}, donnees)
			if (donnees === null) { res.send('erreur_ajout_dossier'); return false }
			let dossiers = []
			if (donnees.hasOwnProperty('dossiers')) {
				dossiers = JSON.parse(donnees.dossiers)
			}
			const id = Math.random().toString(36).substring(2)
			dossiers.push({ id: id, nom: nom, pads: [] })
			await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
			res.json({ id: id, nom: nom, pads: [] })
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/modifier-dossier', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const nom = req.body.dossier
			const dossierId = req.body.dossierId
			let donnees = await db.HGETALL('utilisateurs:' + identifiant)
			donnees = Object.assign({}, donnees)
			if (donnees === null) { res.send('erreur_modification_dossier'); return false }
			const dossiers = JSON.parse(donnees.dossiers)
			dossiers.forEach(function (dossier, index) {
				if (dossier.id === dossierId) {
					dossiers[index].nom = nom
				}
			})
			await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
			res.send('dossier_modifie')
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/supprimer-dossier', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur') {
			const dossierId = req.body.dossierId
			let donnees = await db.HGETALL('utilisateurs:' + identifiant)
			donnees = Object.assign({}, donnees)
			if (donnees === null) { res.send('erreur_suppression_dossier'); return false }
			const dossiers = JSON.parse(donnees.dossiers)
			dossiers.forEach(function (dossier, index) {
				if (dossier.id === dossierId) {
					dossiers.splice(index, 1)
				}
			})
			await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
			res.send('dossier_supprime')
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
							}).toBuffer(async function (err, buffer) {
								if (err) { res.send('erreur_televersement'); return false }
								await fs.writeFile(chemin, buffer)
								res.json({ fichier: fichier.filename, mimetype: mimetype })
							})
						} else if (extension.toLowerCase() !== '.gif') {
							sharp(chemin).withMetadata().resize(1200, 1200, {
								fit: sharp.fit.inside,
								withoutEnlargement: true
							}).toBuffer(async function (err, buffer) {
								if (err) { res.send('erreur_televersement'); return false }
								await fs.writeFile(chemin, buffer)
								res.json({ fichier: fichier.filename, mimetype: mimetype })
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
					}).toBuffer(async function (err, buffer) {
						if (err) { res.send('erreur_televersement'); return false }
						await fs.writeFile(chemin, buffer)
						res.send('/temp/' + fichier.filename)
					})
				} else {
					sharp(chemin).withMetadata().resize(400, 400, {
						fit: sharp.fit.inside,
						withoutEnlargement: true
					}).toBuffer(async function (err, buffer) {
						if (err) { res.send('erreur_televersement'); return false }
						await fs.writeFile(chemin, buffer)
						res.send('/temp/' + fichier.filename)
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
					}).toBuffer(async function (err, buffer) {
						if (err) { res.send('erreur_televersement'); return false }
						await fs.writeFile(chemin, buffer)
						res.send('/' + definirDossierFichiers(pad) + '/' + pad + '/' + fichier.filename)
					})
				} else {
					sharp(chemin).withMetadata().resize(1200, 1200, {
						fit: sharp.fit.inside,
						withoutEnlargement: true
					}).toBuffer(async function (err, buffer) {
						if (err) { res.send('erreur_televersement'); return false }
						await fs.writeFile(chemin, buffer)
						res.send('/' + definirDossierFichiers(pad) + '/' + pad + '/' + fichier.filename)
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
				const resultat = await db.EXISTS('pad')
				if (resultat === null) { res.send('erreur'); return false }
				if (resultat === 1) {
					const reponse = await db.GET('pad')
					if (reponse === null) { res.send('erreur'); return false }
					const id = parseInt(reponse) + 1
					const creation = await creerPadSansCompte(id, token, titre, hash, date, identifiant, nom, langue, 'api')
					if (creation === true) {
						const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(id) + '/' + id)
						await fs.mkdirp(chemin)
						res.send(id + '/' + token)
					} else {
						res.send('erreur_creation')
					}
				} else {
					const creation = await creerPadSansCompte(1, token, titre, hash, date, identifiant, nom, langue, 'api')
					if (creation === true) {
						const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(1) + '/1')
						await fs.mkdirp(chemin)
						res.send('1/' + token)
					} else {
						res.send('erreur_creation')
					}
				}
			} else if (reponse.data === 'token_autorise' && req.body.action && req.body.action === 'modifier-titre') {
				const pad = req.body.id
				const titre = req.body.titre
				await db.HSET('pads:' + pad, 'titre', titre)
				res.send('contenu_modifie')
			} else if (reponse.data === 'token_autorise' && req.body.action && req.body.action === 'ajouter') {
				const identifiant = req.body.identifiant
				const pad = req.body.id
				const token = req.body.tokenContenu
				const motdepasse = req.body.motdepasse
				const nom = req.body.nomUtilisateur
				const resultat = await db.EXISTS('pads:' + pad)
				if (resultat === null) { res.send('erreur'); return false }
				if (resultat === 1) {
					let donneesPad = await db.HGETALL('pads:' + pad)
					donneesPad = Object.assign({}, donneesPad)
					if (donneesPad === null) { res.send('erreur'); return false }
					if (motdepasse.trim() !== '' && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donneesPad.motdepasse) && token === donneesPad.token) {
						const date = dayjs().format()
						let langue = 'fr'
						if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
							langue = req.session.langue
						}
						await db
						.multi()
						.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'date', date, 'nom', nom, 'langue', langue])
						.HSET('pads:' + pad, 'identifiant', identifiant)
						.exec()
						res.json({ titre: donneesPad.titre, identifiant: identifiant })
					} else if (!donneesPad.hasOwnProperty('motdepasse') && token === donneesPad.token) {
						const resultat = await db.EXISTS('utilisateurs:' + donneesPad.identifiant)
						if (resultat === null) { res.send('erreur'); return false }
						if (resultat === 1) {
							let utilisateur = await db.HGETALL('utilisateurs:' + donneesPad.identifiant)
							utilisateur = Object.assign({}, utilisateur)
							if (utilisateur === null) { res.send('erreur'); return false }
							if (motdepasse.trim() !== '' && utilisateur.hasOwnProperty('motdepasse') && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
								res.json({ titre: donneesPad.titre, identifiant: donneesPad.identifiant })
							} else {
								res.send('non_autorise')
							}
						} else {
							res.send('erreur')
						}
					} else {
						res.send('non_autorise')
					}
				} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
					const client = await pool.connect()
					const donneesQ = await client.query('SELECT donnees FROM pads WHERE pad = $1', [parseInt(pad)])
					if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 1) {
						const donneesPad = JSON.parse(donneesQ.rows[0].donnees)
						if (motdepasse.trim() !== '' && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donneesPad.motdepasse) && token === donneesPad.token) {
							const date = dayjs().format()
							let langue = 'fr'
							if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
								langue = req.session.langue
							}
							await db.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'date', date, 'nom', nom, 'langue', langue])
							donneesPad.identifiant = identifiant
							await client.query('UPDATE pads SET donnees = $1 WHERE pad = $2', [JSON.stringify(donneesPad), parseInt(pad)])
							client.release()
							res.json({ titre: donneesPad.titre, identifiant: identifiant })
						} else if (!donneesPad.hasOwnProperty('motdepasse') && token === donneesPad.token) {
							const resultat = await db.EXISTS('utilisateurs:' + donneesPad.identifiant)
							if (resultat === null) { res.send('erreur'); return false }
							if (resultat === 1) {
								let utilisateur = await db.HGETALL('utilisateurs:' + donneesPad.identifiant)
								utilisateur = Object.assign({}, utilisateur)
								if (utilisateur === null) { res.send('erreur'); return false }
								if (motdepasse.trim() !== '' && utilisateur.hasOwnProperty('motdepasse') && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
									res.json({ titre: donneesPad.titre, identifiant: donneesPad.identifiant })
								} else {
									client.release()
									res.send('non_autorise')
								}
							} else {
								client.release()
								res.send('erreur')
							}
						} else {
							client.release()
							res.send('non_autorise')
						}
					} else {
						client.release()
						res.send('erreur')
					}
				} else {
					res.send('contenu_inexistant')
				}
			} else if (reponse.data === 'token_autorise' && req.body.action && req.body.action === 'supprimer') {
				const identifiant = req.body.identifiant
				const pad = req.body.id
				const motdepasse = req.body.motdepasse
				const resultat = await db.EXISTS('pads:' + pad)
				if (resultat === null) { res.send('erreur'); return false }
				if (resultat === 1) {
					let donneesPad = await db.HGETALL('pads:' + pad)
					donneesPad = Object.assign({}, donneesPad)
					if (donneesPad === null) { res.send('erreur'); return false }
					if (motdepasse.trim() !== '' && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && donneesPad.identifiant === identifiant && await bcrypt.compare(motdepasse, donneesPad.motdepasse)) {
						const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
						if (blocs === null) { res.send('erreur'); return false }
						for (let i = 0; i < blocs.length; i++) {
							await db
							.multi()
							.DEL('commentaires:' + blocs[i])
							.DEL('evaluations:' + blocs[i])
							.DEL('pad-' + pad + ':' + blocs[i])
							.exec()
						}
						await db
						.multi()
						.DEL('blocs:' + pad)
						.DEL('pads:' + pad)
						.DEL('activite:' + pad)
						.DEL('dates-pads:' + pad)
						.SREM('pads-crees:' + identifiant, pad.toString())
						.exec()
						const utilisateurs = await db.SMEMBERS('utilisateurs-pads:' + pad)
						if (utilisateurs === null) { res.send('erreur'); return false }
						for (let j = 0; j < utilisateurs.length; j++) {
							await db
							.multi()
							.SREM('pads-rejoints:' + utilisateurs[j], pad.toString())
							.SREM('pads-utilisateurs:' + utilisateurs[j], pad.toString())
							.SREM('pads-admins:' + utilisateurs[j], pad.toString())
							.SREM('pads-favoris:' + utilisateurs[j], pad.toString())
							.HDEL('couleurs:' + utilisateurs[j], 'pad' + pad)
							.exec()
						}
						await db.DEL('utilisateurs-pads:' + pad)
						const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad)
						await fs.remove(chemin)
						res.send('contenu_supprime')
					} else if (!donneesPad.hasOwnProperty('motdepasse') && donneesPad.identifiant === identifiant) {
						const resultat = await db.EXISTS('utilisateurs:' + identifiant)
						if (resultat === null) { res.send('erreur'); return false }
						if (resultat === 1) {
							let utilisateur = await db.HGETALL('utilisateurs:' + identifiant)
							utilisateur = Object.assign({}, utilisateur)
							if (utilisateur === null) { res.send('erreur'); return false }
							if (motdepasse.trim() !== '' && utilisateur.hasOwnProperty('motdepasse') && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
								const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
								if (blocs === null) { res.send('erreur'); return false }
								for (let i = 0; i < blocs.length; i++) {
									await db
									.multi()
									.DEL('commentaires:' + blocs[i])
									.DEL('evaluations:' + blocs[i])
									.DEL('pad-' + pad + ':' + blocs[i])
									.exec()
								}
								await db
								.multi()
								.DEL('blocs:' + pad)
								.DEL('pads:' + pad)
								.DEL('activite:' + pad)
								.DEL('dates-pads:' + pad)
								.SREM('pads-crees:' + identifiant, pad.toString())
								.exec()
								const utilisateurs = await db.SMEMBERS('utilisateurs-pads:' + pad)
									if (utilisateurs === null) { res.send('erreur'); return false }
									for (let j = 0; j < utilisateurs.length; j++) {
										await db
										.multi()
										.SREM('pads-rejoints:' + utilisateurs[j], pad.toString())
										.SREM('pads-utilisateurs:' + utilisateurs[j], pad.toString())
										.SREM('pads-admins:' + utilisateurs[j], pad.toString())
										.SREM('pads-favoris:' + utilisateurs[j], pad.toString())
										.HDEL('couleurs:' + utilisateurs[j], 'pad' + pad)
										.exec()
									}
								await db.DEL('utilisateurs-pads:' + pad)
								const chemin = path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad)
								await fs.remove(chemin)
								res.send('contenu_supprime')
							} else {
								res.send('non_autorise')
							}
						} else {
							res.send('erreur')
						}
					} else {
						res.send('non_autorise')
					}
				} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
					const client = await pool.connect()
					const donneesQ = await client.query('SELECT donnees FROM pads WHERE pad = $1', [parseInt(pad)])
					if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 1) {
						const donneesPad = JSON.parse(donneesQ.rows[0].donnees)
						if (motdepasse.trim() !== '' && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && donneesPad.identifiant === identifiant && await bcrypt.compare(motdepasse, donneesPad.motdepasse)) {
							await db.SREM('pads-crees:' + identifiant, pad.toString())
							const utilisateurs = await db.SMEMBERS('utilisateurs-pads:' + pad)
							if (utilisateurs === null) { res.send('erreur'); return false }
							for (let j = 0; j < utilisateurs.length; j++) {
								await db
								.multi()
								.SREM('pads-rejoints:' + utilisateurs[j], pad.toString())
								.SREM('pads-utilisateurs:' + utilisateurs[j], pad.toString())
								.SREM('pads-admins:' + utilisateurs[j], pad.toString())
								.SREM('pads-favoris:' + utilisateurs[j], pad.toString())
								.HDEL('couleurs:' + utilisateurs[j], 'pad' + pad)
								.exec()
							}
							await db.DEL('utilisateurs-pads:' + pad)
							await fs.remove(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad))
							const client = await pool.connect()
							await client.query('DELETE FROM pads WHERE pad = $1', [parseInt(pad)])
							client.release()
							res.send('contenu_supprime')
						} else if (!donneesPad.hasOwnProperty('motdepasse') && donneesPad.identifiant === identifiant) {
							const resultat = await db.EXISTS('utilisateurs:' + identifiant)
							if (resultat === null) { res.send('erreur'); return false }
							if (resultat === 1) {
								let utilisateur = db.HGETALL('utilisateurs:' + identifiant)
								utilisateur = Object.assign({}, utilisateur)
								if (utilisateur === null) { res.send('erreur'); return false }
								if (motdepasse.trim() !== '' && utilisateur.hasOwnProperty('motdepasse') && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
									await db.SREM('pads-crees:' + identifiant, pad.toString())
									const utilisateurs = await db.SMEMBERS('utilisateurs-pads:' + pad)
									if (utilisateurs === null) { res.send('erreur'); return false }
									for (let j = 0; j < utilisateurs.length; j++) {
										await db
										.multi()
										.SREM('pads-rejoints:' + utilisateurs[j], pad.toString())
										.SREM('pads-utilisateurs:' + utilisateurs[j], pad.toString())
										.SREM('pads-admins:' + utilisateurs[j], pad.toString())
										.SREM('pads-favoris:' + utilisateurs[j], pad.toString())
										.HDEL('couleurs:' + utilisateurs[j], 'pad' + pad)
										.exec()
									}
									await db.DEL('utilisateurs-pads:' + pad)
									await fs.remove(path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad))
									const client = await pool.connect()
									await client.query('DELETE FROM pads WHERE pad = $1', [parseInt(pad)])
									client.release()
									res.send('contenu_supprime')
								} else {
									res.send('non_autorise')
								}
							} else {
								res.send('erreur')
							}
						} else {
							res.send('non_autorise')
						}
					} else {
						client.release()
						res.send('erreur')
					}
				} else {
					res.send('contenu_supprime')
				}
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

	const io = new Server(httpServer, {
		wsEngine: eiows.Server,
		pingInterval: 95000,
    	pingTimeout: 100000,
    	maxHttpBufferSize: 1e8,
		cookie: false,
		perMessageDeflate: false
	})
	if (cluster === true) {
		io.adapter(createAdapter())
	}
	const wrap = middleware => (socket, next) => middleware(socket.request, {}, next)
	io.use(wrap(sessionMiddleware))

	io.on('connection', function (socket) {
		socket.on('connexion', async function (donnees) {        
			const pad = donnees.pad
			const identifiant = donnees.identifiant
			const nom = donnees.nom
			const room = 'pad-' + pad
			socket.join(room)
			socket.data.identifiant = identifiant
			socket.data.nom = nom
			const clients = await io.in(room).fetchSockets()
			const utilisateurs = []
			for (let i = 0; i < clients.length; i++) {
				const donneesUtilisateur = new Promise(async function (resolve) {
					let couleur = await db.HGET('couleurs:' + clients[i].data.identifiant, 'pad' + pad)
					if (couleur === null) {
						couleur = choisirCouleur()
						await db.HSET('couleurs:' + identifiant, 'pad' + pad, couleur)
						resolve({ identifiant: clients[i].data.identifiant, nom: clients[i].data.nom, couleur: couleur })
					} else {
						resolve({ identifiant: clients[i].data.identifiant, nom: clients[i].data.nom, couleur: couleur })
					}
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

		socket.on('verifieracces', async function (donnees) {
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
				let resultat = await db.HGETALL('pads:' + pad)
				resultat = Object.assign({}, resultat)
				if (resultat === null || !resultat.hasOwnProperty('code')) { socket.emit('erreur'); return false }
				if (code === resultat.code) {
					const donneesPad = await recupererDonneesPadProtege(resultat, pad, identifiant)
					socket.emit('verifieracces', { acces: true, pad: donneesPad.pad, blocs: donneesPad.blocs, activite: donneesPad.activite.reverse() })
				} else {
					socket.emit('verifieracces', { acces: false })
				}
			} else {
				socket.emit('verifieracces', { acces: false })
			}
		})

		socket.on('ajouterbloc', async function (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne, privee, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('token') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (donnees.id === pad && donnees.token === token && (donnees.contributions !== 'fermees' || admins.includes(identifiant) || proprietaire === identifiant)) {
					const id = parseInt(donnees.bloc) + 1
					const date = dayjs().format()
					const activiteId = parseInt(donnees.activite) + 1
					let visibilite = 'visible'
					if ((admins.includes(identifiant) || proprietaire === identifiant) && privee === true) {
						visibilite = 'privee'
					} else if (!admins.includes(identifiant) && proprietaire !== identifiant && donnees.contributions === 'moderees') {
						visibilite = 'masquee'
					}
					if (vignette && vignette !== '' && !String(vignette).includes('/img/') && !verifierURL(vignette, ['https', 'http'])) {
						vignette = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(vignette)
					}
					await db
					.multi()
					.HINCRBY('pads:' + pad, 'bloc', 1)
					.HSET('pad-' + pad + ':' + bloc, ['id', id, 'bloc', bloc, 'titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'date', date, 'identifiant', identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', colonne, 'visibilite', visibilite])
					.ZADD('blocs:' + pad, [{ score: id, value: bloc }])
					.HSET('dates-pads:' + pad, 'date', date)
					.exec()
					if (visibilite === 'visible') {
						// Enregistrer entrée du registre d'activité
						await db
						.multi()
						.HINCRBY('pads:' + pad, 'activite', 1)
						.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-ajoute' }) }])
						.exec()
					}
					if (media !== '' && type !== 'embed' && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + media))) {
						await fs.copy(path.join(__dirname, '..', '/static/temp/' + media), path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad + '/' + media))
						await fs.remove(path.join(__dirname, '..', '/static/temp/' + media))
					}
					if (vignette && vignette !== '' && !String(vignette).includes('/img/') && !verifierURL(vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))) {
						await fs.copy(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)), path.join(__dirname, '..', '/static' + vignette))
						await fs.remove(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))
					}
					io.in('pad-' + pad).emit('ajouterbloc', { bloc: bloc, titre: titre, texte: texte, media: media, iframe: iframe, type: type, source: source, vignette: vignette, identifiant: identifiant, nom: nom, date: date, couleur: couleur, commentaires: 0, evaluations: [], colonne: colonne, visibilite: visibilite, activiteId: activiteId })
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierbloc', async function (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne, privee, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('token') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (donnees.id === pad && donnees.token === token) {
					const resultat = await db.EXISTS('pad-' + pad + ':' + bloc)
					if (resultat === null) { socket.emit('erreur'); return false }
					if (resultat === 1) {
						let objet = await db.HGETALL('pad-' + pad + ':' + bloc)
						objet = Object.assign({}, objet)
						if (objet === null) { socket.emit('erreur'); return false }
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
							if (vignette && objet.hasOwnProperty('vignette') && objet.vignette !== vignette && vignette !== '' && !String(vignette).includes('/img/') && !verifierURL(vignette, ['https', 'http'])) {
								vignette = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(vignette)
							}
							if (visibilite === 'visible') {
								// Enregistrer entrée du registre d'activité
								const activiteId = parseInt(donnees.activite) + 1
								await db
								.multi()
								.HSET('pad-' + pad + ':' + bloc, ['titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'visibilite', 'visible', 'modifie', date])
								.HSET('dates-pads:' + pad, 'date', date)
								.HINCRBY('pads:' + pad, 'activite', 1)
								.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-modifie' }) }])
								.exec()
								if (objet.hasOwnProperty('media') && objet.media !== media && media !== '' && type !== 'embed' && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + media))) {
									await fs.copy(path.join(__dirname, '..', '/static/temp/' + media), path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad + '/' + media))
									await fs.remove(path.join(__dirname, '..', '/static/temp/' + media))
								}
								if (objet.hasOwnProperty('media') && objet.media !== media && objet.media !== '' && objet.type !== 'embed') {
									supprimerFichier(pad, objet.media)
								}
								if (vignette && objet.hasOwnProperty('vignette') && objet.vignette !== vignette && vignette !== '' && !String(vignette).includes('/img/') && !verifierURL(vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))) {
									await fs.copy(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)), path.join(__dirname, '..', '/static' + vignette))
									await fs.remove(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))
								}
								if (objet.hasOwnProperty('vignette') && objet.vignette !== vignette && objet.vignette !== '' && !String(objet.vignette).includes('/img/') && !verifierURL(objet.vignette, ['https', 'http'])) {
									supprimerFichier(pad, path.basename(objet.vignette))
								}
								io.in('pad-' + pad).emit('modifierbloc', { bloc: bloc, titre: titre, texte: texte, media: media, iframe: iframe, type: type, source: source, vignette: vignette, identifiant: identifiant, nom: nom, modifie: date, couleur: couleur, colonne: colonne, visibilite: visibilite, activiteId: activiteId })
								socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
								socket.request.session.save()
							} else if (visibilite === 'privee' || visibilite === 'masquee') {
								await db
								.multi()
								.HSET('pad-' + pad + ':' + bloc, ['titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'visibilite', visibilite, 'modifie', date])
								.HSET('dates-pads:' + pad, 'date', date)
								.exec()
								if (objet.hasOwnProperty('media') && objet.media !== media && media !== '' && type !== 'embed' && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + media))) {
									await fs.copy(path.join(__dirname, '..', '/static/temp/' + media), path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad + '/' + media))
									await fs.remove(path.join(__dirname, '..', '/static/temp/' + media))
								}
								if (objet.hasOwnProperty('media') && objet.media !== media && objet.media !== '' && objet.type !== 'embed') {
									supprimerFichier(pad, objet.media)
								}
								if (vignette && objet.hasOwnProperty('vignette') && objet.vignette !== vignette && vignette !== '' && !String(vignette).includes('/img/') && !verifierURL(vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))) {
									await fs.copy(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)), path.join(__dirname, '..', '/static' + vignette))
									await fs.remove(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))
								}
								if (objet.hasOwnProperty('vignette') && objet.vignette !== vignette && objet.vignette !== '' && !String(objet.vignette).includes('/img/') && !verifierURL(objet.vignette, ['https', 'http'])) {
									supprimerFichier(pad, path.basename(objet.vignette))
								}
								io.in('pad-' + pad).emit('modifierbloc', { bloc: bloc, titre: titre, texte: texte, media: media, iframe: iframe, type: type, source: source, vignette: vignette, identifiant: identifiant, nom: nom, modifie: date, couleur: couleur, colonne: colonne, visibilite: visibilite })
								socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
								socket.request.session.save()
							} else {
								if (objet.hasOwnProperty('media') && objet.media !== media && media !== '' && type !== 'embed' && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + media))) {
									await fs.copy(path.join(__dirname, '..', '/static/temp/' + media), path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad + '/' + media))
									await fs.remove(path.join(__dirname, '..', '/static/temp/' + media))
								}
								if (objet.hasOwnProperty('media') && objet.media !== media && objet.media !== '' && objet.type !== 'embed') {
									supprimerFichier(pad, objet.media)
								}
								if (vignette && objet.hasOwnProperty('vignette') && objet.vignette !== vignette && vignette !== '' && !String(vignette).includes('/img/') && !verifierURL(vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))) {
									await fs.copy(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)), path.join(__dirname, '..', '/static' + vignette))
									await fs.remove(path.join(__dirname, '..', '/static/temp/' + path.basename(vignette)))
								}
								if (objet.hasOwnProperty('vignette') && objet.vignette !== vignette && objet.vignette !== '' && !String(objet.vignette).includes('/img/') && !verifierURL(objet.vignette, ['https', 'http'])) {
									supprimerFichier(pad, path.basename(objet.vignette))
								}
								io.in('pad-' + pad).emit('modifierbloc', { bloc: bloc, titre: titre, texte: texte, media: media, iframe: iframe, type: type, source: source, vignette: vignette, identifiant: identifiant, nom: nom, modifie: date, couleur: couleur, colonne: colonne, visibilite: visibilite })
								socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
								socket.request.session.save()
							}
						} else {
							socket.emit('nonautorise')
						}
					}
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('copierbloc', async function (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne, visibilite, identifiant, nom, padOrigine) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('token') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (donnees.id === pad && donnees.token === token && (admins.includes(identifiant) || proprietaire === identifiant)) {
					const id = parseInt(donnees.bloc) + 1
					const date = dayjs().format()
					const activiteId = parseInt(donnees.activite) + 1
					let vignetteOrigine = ''
					if (vignette && vignette !== '' && !String(vignette).includes('/img/') && !verifierURL(vignette, ['https', 'http'])) {
						vignette = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(vignette)
						vignetteOrigine = '/' + definirDossierFichiers(padOrigine) + '/' + padOrigine + '/' + path.basename(vignette)
					}
					await db
					.multi()
					.HINCRBY('pads:' + pad, 'bloc', 1)
					.HSET('pad-' + pad + ':' + bloc, ['id', id, 'bloc', bloc, 'titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'date', date, 'identifiant', identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', colonne, 'visibilite', visibilite])
					.ZADD('blocs:' + pad, [{ score: id, value: bloc }])
					.HSET('dates-pads:' + pad, 'date', date)
					.exec()
					if (visibilite === 'visible') {
						// Enregistrer entrée du registre d'activité
						await db
						.multi()
						.HINCRBY('pads:' + pad, 'activite', 1)
						.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-ajoute' }) }])
						.exec()
					}
					if (media !== '' && type !== 'embed' && await fs.pathExists(path.join(__dirname, '..', '/static/' + definirDossierFichiers(padOrigine) + '/' + padOrigine + '/' + media))) {
						await fs.copy(path.join(__dirname, '..', '/static/' + definirDossierFichiers(padOrigine) + '/' + padOrigine + '/' + media), path.join(__dirname, '..', '/static/' + definirDossierFichiers(pad) + '/' + pad + '/' + media))
					}
					if (vignette && vignette !== '' && !String(vignette).includes('/img/') && !verifierURL(vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/static' + vignetteOrigine))) {
						await fs.copy(path.join(__dirname, '..', '/static' + vignetteOrigine), path.join(__dirname, '..', '/static' + vignette))
					}
					io.in('pad-' + pad).emit('ajouterbloc', { bloc: bloc, titre: titre, texte: texte, media: media, iframe: iframe, type: type, source: source, vignette: vignette, identifiant: identifiant, nom: nom, date: date, couleur: couleur, commentaires: 0, evaluations: [], colonne: colonne, visibilite: visibilite, activiteId: activiteId })
					socket.emit('copierbloc')
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('autoriserbloc', async function (pad, token, item, indexBloc, indexBlocColonne, moderation, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('token') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (donnees.id === pad && donnees.token === token && (admins.includes(identifiant) || proprietaire === identifiant)) {
					const resultat = await db.EXISTS('pad-' + pad + ':' + item.bloc)
					if (resultat === null) { socket.emit('erreur'); return false }
					if (resultat === 1) {
						const date = dayjs().format()
						const activiteId = parseInt(donnees.activite) + 1
						if (item.hasOwnProperty('modifie')) {
							await db.HDEL('pad-' + pad + ':' + item.bloc, 'modifie')
						}
						await db
						.multi()
						.HSET('pad-' + pad + ':' + item.bloc, ['visibilite', 'visible', 'date', date])
						.HSET('dates-pads:' + pad, 'date', date)
						// Enregistrer entrée du registre d'activité
						.HINCRBY('pads:' + pad, 'activite', 1)
						.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: item.bloc, identifiant: item.identifiant, titre: item.titre, date: date, couleur: item.couleur, type: 'bloc-ajoute' }) }])
						.exec()
						io.in('pad-' + pad).emit('autoriserbloc', { bloc: item.bloc, titre: item.titre, texte: item.texte, media: item.media, iframe: item.iframe, type: item.type, source: item.source, vignette: item.vignette, identifiant: item.identifiant, nom: item.nom, date: date, couleur: item.couleur, commentaires: 0, evaluations: [], colonne: item.colonne, visibilite: 'visible', activiteId: activiteId, moderation: moderation, admin: identifiant, indexBloc: indexBloc, indexBlocColonne: indexBlocColonne })
						socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
						socket.request.session.save()
					}
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('deplacerbloc', async function (items, pad, affichage, ordre, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
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
						const donneeBloc = new Promise(async function (resolve) {
							const resultat = await db.EXISTS('pad-' + pad + ':' + items[i].bloc)
							if (resultat === null) { resolve('erreur'); return false }
							if (resultat === 1) {
								await db
								.multi()
								.ZREM('blocs:' + pad, items[i].bloc)
								.ZADD('blocs:' + pad, [{ score: (i + 1), value: items[i].bloc }])
								.exec()
								if (affichage === 'colonnes') {
									await db.HSET('pad-' + pad + ':' + items[i].bloc, 'colonne', items[i].colonne)
								}
								resolve(i)
							} else {
								resolve('erreur')
							}
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
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('supprimerbloc', async function (bloc, pad, token, titre, couleur, colonne, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('token') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (donnees.id === pad && donnees.token === token) {
					const resultat = await db.EXISTS('pad-' + pad + ':' + bloc)
					if (resultat === null) { socket.emit('erreur'); return false }
					if (resultat === 1) {
						let objet = await db.HGETALL('pad-' + pad + ':' + bloc)
						objet = Object.assign({}, objet)
						if (objet === null) { socket.emit('erreur'); return false }
						const proprietaire = donnees.identifiant
						let admins = []
						if (donnees.hasOwnProperty('admins')) {
							admins = donnees.admins
						}
						if (objet.identifiant === identifiant || proprietaire === identifiant || admins.includes(identifiant)) {
							if (objet.hasOwnProperty('media') && objet.media !== '' && objet.type !== 'embed') {
								supprimerFichier(pad, objet.media)
							}
							if (objet.hasOwnProperty('vignette') && objet.vignette !== '' && !String(objet.vignette).includes('/img/') && !verifierURL(objet.vignette, ['https', 'http'])) {
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
								await db
								.multi()
								.DEL('pad-' + pad + ':' + bloc)
								.ZREM('blocs:' + pad, bloc)
								.DEL('commentaires:' + bloc)
								.DEL('evaluations:' + bloc)
								.HSET('dates-pads:' + pad, 'date', date)
								// Enregistrer entrée du registre d'activité
								.HINCRBY('pads:' + pad, 'activite', 1)
								.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-supprime' }) }])
								.exec()
								io.in('pad-' + pad).emit('supprimerbloc', { bloc: bloc, identifiant: identifiant, nom: nom, titre: titre, date: date, couleur: couleur, colonne: colonne, activiteId: activiteId })
								socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
								socket.request.session.save()
							}
						} else {
							socket.emit('nonautorise')
						}
					}
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('commenterbloc', async function (bloc, pad, titre, texte, couleur, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let resultat = await db.HGETALL('pads:' + pad)
				resultat = Object.assign({}, resultat)
				if (resultat === null || !resultat.hasOwnProperty('activite')) { socket.emit('erreur'); return false }
				let donnees = await db.HGETALL('pad-' + pad + ':' + bloc)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('commentaires')) { socket.emit('erreur'); return false }
				const commentaires = await db.ZRANGE('commentaires:' + bloc, 0, -1)
				if (commentaires === null) { socket.emit('erreur'); return false }
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
				const commentaire = { id: commentaireId, identifiant: identifiant, date: date, texte: texte }
				await db
				.multi()
				.HSET('pad-' + pad + ':' + bloc, 'commentaires', commentaireId)
				.HSET('dates-pads:' + pad, 'date', date)
				.ZADD('commentaires:' + bloc, [{ score: commentaireId, value: JSON.stringify(commentaire) }])
				// Enregistrer entrée du registre d'activité
				.HINCRBY('pads:' + pad, 'activite', 1)
				.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-commente' }) }])
				.exec()
				io.in('pad-' + pad).emit('commenterbloc', { id: commentaireId, bloc: bloc, identifiant: identifiant, nom: nom, texte: texte, titre: titre, date: date, couleur: couleur, commentaires: commentaires.length + 1, activiteId: activiteId })
				socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
				socket.request.session.save()
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercommentaire', async function (bloc, pad, id, texte, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				const resultats = await db.ZRANGEBYSCORE('commentaires:' + bloc, id, id)
				if (resultats === null) { socket.emit('erreur'); return false }
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
				await db
				.multi()
				.ZREMRANGEBYSCORE('commentaires:' + bloc, id, id)
				.ZADD('commentaires:' + bloc, [{ score: id, value: JSON.stringify(commentaire) }])
				.HSET('dates-pads:' + pad, 'date', dateModification)
				.exec()
				io.in('pad-' + pad).emit('modifiercommentaire', { id: id, texte: texte })
				socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
				socket.request.session.save()
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('supprimercommentaire', async function (bloc, pad, id, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				const date = dayjs().format()
				await db
				.multi()
				.ZREMRANGEBYSCORE('commentaires:' + bloc, id, id)
				.HSET('dates-pads:' + pad, 'date', date)
				.exec()
				const commentaires = await db.ZCARD('commentaires:' + bloc)
				if (commentaires === null) { socket.emit('erreur'); return false }
				io.in('pad-' + pad).emit('supprimercommentaire', { id: id, bloc: bloc, commentaires: commentaires })
				socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
				socket.request.session.save()
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('commentaires', async function (bloc, type) {
			const donneesCommentaires = []
			const commentaires = await db.ZRANGE('commentaires:' + bloc, 0, -1)
			if (commentaires === null) { socket.emit('erreur'); return false }
			for (let commentaire of commentaires) {
				const commentaireJSON = verifierJSON(commentaire)
				if (commentaireJSON === false) {
					socket.emit('erreur'); return false
				} else {
					commentaire = commentaireJSON
				}
				const donneeCommentaire = new Promise(async function (resolve) {
					const identifiant = commentaire.identifiant
					const resultat = await db.EXISTS('utilisateurs:' + identifiant)
					if (resultat === null) { resolve(); return false }
					if (resultat === 1) {
						let utilisateur = await db.HGETALL('utilisateurs:' + identifiant)
						utilisateur = Object.assign({}, utilisateur)
						if (utilisateur === null) { resolve(); return false }
						commentaire.nom = utilisateur.nom
						resolve(commentaire)
					} else {
						const reponse = await db.EXISTS('noms:' + identifiant)
						if (reponse === null) { resolve(); return false }
						if (reponse === 1) {
							const nom = await db.HGET('noms:' + identifiant, 'nom')
							if (nom === null) { resolve(); return false }
							commentaire.nom = nom
							resolve(commentaire)
						} else {
							commentaire.nom = ''
							resolve(commentaire)
						}
					}
				})
				donneesCommentaires.push(donneeCommentaire)
			}
			Promise.all(donneesCommentaires).then(function (resultat) {
				socket.emit('commentaires', { commentaires: resultat, type: type })
			})
		})

		socket.on('evaluerbloc', async function (bloc, pad, titre, etoiles, couleur, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let resultat = await db.HGETALL('pads:' + pad)
				resultat = Object.assign({}, resultat)
				if (resultat === null || !resultat.hasOwnProperty('activite')) { socket.emit('erreur'); return false }
				let donnees = await db.HGETALL('pad-' + pad + ':' + bloc)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('evaluations')) { socket.emit('erreur'); return false }
				const date = dayjs().format()
				const activiteId = parseInt(resultat.activite) + 1
				const evaluationId = parseInt(donnees.evaluations) + 1
				const evaluation = { id: evaluationId, identifiant: identifiant, date: date, etoiles: etoiles }
				await db
				.multi()
				.HINCRBY('pad-' + pad + ':' + bloc, 'evaluations', 1)
				.ZADD('evaluations:' + bloc, [{ score: evaluationId, value: JSON.stringify(evaluation) }])
				.HSET('dates-pads:' + pad, 'date', date)
				// Enregistrer entrée du registre d'activité
				.HINCRBY('pads:' + pad, 'activite', 1)
				.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'bloc-evalue' }) }])
				.exec()
				io.in('pad-' + pad).emit('evaluerbloc', { id: evaluationId, bloc: bloc, identifiant: identifiant, nom: nom, titre: titre, date: date, couleur: couleur, evaluation: evaluation, activiteId: activiteId })
				socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
				socket.request.session.save()
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierevaluation', async function (bloc, pad, id, etoiles, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				const date = dayjs().format()
				const evaluation = { id: id, identifiant: identifiant, date: date, etoiles: etoiles }
				await db
				.multi()
				.ZREMRANGEBYSCORE('evaluations:' + bloc, id, id)
				.ZADD('evaluations:' + bloc, [{ score: id, value: JSON.stringify(evaluation) }])
				.HSET('dates-pads:' + pad, 'date', date)
				.exec()
				io.in('pad-' + pad).emit('modifierevaluation', { id: id, bloc: bloc, date: date, etoiles: etoiles })
				socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
				socket.request.session.save()
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('supprimerevaluation', async function (bloc, pad, id, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				const date = dayjs().format()
				await db
				.multi()
				.HSET('dates-pads:' + pad, 'date', date)
				.ZREMRANGEBYSCORE('evaluations:' + bloc, id, id)
				.exec()
				io.in('pad-' + pad).emit('supprimerevaluation', { id: id, bloc: bloc })
				socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
				socket.request.session.save()
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiernom', async function (pad, nom, statut, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				if (statut === 'invite') {
					await db.HSET('noms:' + identifiant, 'nom', nom)
					io.in('pad-' + pad).emit('modifiernom', { identifiant: identifiant, nom: nom })
					socket.request.session.nom = nom
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else if (statut === 'auteur') {
					await db.HSET('utilisateurs:' + identifiant, 'nom', nom)
					io.in('pad-' + pad).emit('modifiernom', { identifiant: identifiant, nom: nom })
					socket.request.session.nom = nom
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercouleur', async function (pad, couleur, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				await db.HSET('couleurs:' + identifiant, 'pad' + pad, couleur)
				io.in('pad-' + pad).emit('modifiercouleur', { identifiant: identifiant, couleur: couleur })
				socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
				socket.request.session.save()
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiertitre', async function (pad, titre, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'titre', titre)
					io.in('pad-' + pad).emit('modifiertitre', titre)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercodeacces', async function (pad, code, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'code', code)
					io.in('pad-' + pad).emit('modifiercodeacces', code)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifieradmins', async function (pad, admins, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				let listeAdmins = []
				if (donnees.hasOwnProperty('admins') && donnees.admins.substring(0, 1) === '"') { // fix bug update 0.9.0
					listeAdmins = JSON.parse(JSON.parse(donnees.admins))
				} else if (donnees.hasOwnProperty('admins')) {
					listeAdmins = JSON.parse(donnees.admins)
				}
				const proprietaire = donnees.identifiant
				if (listeAdmins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'admins', JSON.stringify(admins))
					admins.forEach(async function (admin) {
						if (!listeAdmins.includes(admin)) {
							await db.SADD('pads-admins:' + admin, pad.toString())
						}
					})
					listeAdmins.forEach(async function (admin) {
						if (!admins.includes(admin)) {
							await db.SREM('pads-admins:' + admin, pad.toString())
						}
					})
					io.in('pad-' + pad).emit('modifieradmins', admins)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifieracces', async function (pad, acces, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
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
					await db.HSET('pads:' + pad, ['acces', acces, 'code', code])
					io.in('pad-' + pad).emit('modifieracces', { acces: acces, code: code })
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercontributions', async function (pad, contributions, contributionsPrecedentes, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'contributions', contributions)
					io.in('pad-' + pad).emit('modifiercontributions', { contributions: contributions, contributionsPrecedentes: contributionsPrecedentes })
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifieraffichage', async function (pad, affichage, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'affichage', affichage)
					io.in('pad-' + pad).emit('modifieraffichage', affichage)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierordre', async function (pad, ordre, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'ordre', ordre)
					io.in('pad-' + pad).emit('modifierordre', ordre)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierlargeur', async function (pad, largeur, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'largeur', largeur)
					io.in('pad-' + pad).emit('modifierlargeur', largeur)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierfond', async function (pad, fond, ancienfond, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'fond', fond)
					io.in('pad-' + pad).emit('modifierfond', fond)
					if (!ancienfond.includes('/img/') && ancienfond.substring(0, 1) !== '#' && ancienfond !== '') {
						supprimerFichier(pad, path.basename(ancienfond))
					}
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercouleurfond', async function (pad, fond, ancienfond, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'fond', fond)
					io.in('pad-' + pad).emit('modifiercouleurfond', fond)
					if (!ancienfond.includes('/img/') && ancienfond.substring(0, 1) !== '#' && ancienfond !== '') {
						supprimerFichier(pad, path.basename(ancienfond))
					}
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifieractivite', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'registreActivite', statut)
					io.in('pad-' + pad).emit('modifieractivite', statut)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierconversation', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'conversation', statut)
					io.in('pad-' + pad).emit('modifierconversation', statut)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierlisteutilisateurs', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'listeUtilisateurs', statut)
					io.in('pad-' + pad).emit('modifierlisteutilisateurs', statut)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiereditionnom', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'editionNom', statut)
					io.in('pad-' + pad).emit('modifiereditionnom', statut)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierfichiers', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'fichiers', statut)
					io.in('pad-' + pad).emit('modifierfichiers', statut)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierenregistrements', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'enregistrements', statut)
					io.in('pad-' + pad).emit('modifierenregistrements', statut)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierliens', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'liens', statut)
					io.in('pad-' + pad).emit('modifierliens', statut)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierdocuments', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'documents', statut)
					io.in('pad-' + pad).emit('modifierdocuments', statut)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercommentaires', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'commentaires', statut)
					io.in('pad-' + pad).emit('modifiercommentaires', statut)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierevaluations', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'evaluations', statut)
					io.in('pad-' + pad).emit('modifierevaluations', statut)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercopiebloc', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'copieBloc', statut)
					io.in('pad-' + pad).emit('modifiercopiebloc', statut)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
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

		socket.on('reinitialisermessages', async function (pad, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
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
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('reinitialiseractivite', async function (pad, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.DEL('activite:' + pad)
					io.in('pad-' + pad).emit('reinitialiseractivite')
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('ajoutercolonne', async function (pad, titre, colonnes, affichageColonnes, couleur, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('activite') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					const date = dayjs().format()
					const activiteId = parseInt(donnees.activite) + 1
					colonnes.push(titre)
					affichageColonnes.push(true)
					await db
					.multi()
					.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
					// Enregistrer entrée du registre d'activité
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'colonne-ajoutee' }) }])
					.exec()
					io.in('pad-' + pad).emit('ajoutercolonne', { identifiant: identifiant, nom: nom, titre: titre, colonnes: colonnes, affichageColonnes: affichageColonnes, date: date, couleur: couleur, activiteId: activiteId })
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiertitrecolonne', async function (pad, titre, index, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('colonnes') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					const colonnes = JSON.parse(donnees.colonnes)
					colonnes[index] = titre
					await db.HSET('pads:' + pad, 'colonnes', JSON.stringify(colonnes))
					io.in('pad-' + pad).emit('modifiertitrecolonne', colonnes)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})
		
		socket.on('modifieraffichagecolonne', async function (pad, valeur, index, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
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
					await db.HSET('pads:' + pad, 'affichageColonnes', JSON.stringify(affichageColonnes))
					io.in('pad-' + pad).emit('modifieraffichagecolonne', affichageColonnes, valeur, index)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('verifierblocscolonnes', async function (donnees) {
			const pad = donnees.pad
			const identifiant = donnees.identifiant
			if (socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null) { socket.emit('erreur'); return false }
				const donneesPad = await recupererDonneesPadProtege(donnees, pad, identifiant)
				socket.emit('verifierblocscolonnes', donneesPad.blocs)
			}
		})

		socket.on('supprimercolonne', async function (pad, titre, colonne, couleur, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('colonnes') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
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
					const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
					if (blocs === null) { socket.emit('erreur'); return false }
					for (const bloc of blocs) {
						const donneesBloc = new Promise(async function (resolve) {
							let resultat = await db.HGETALL('pad-' + pad + ':' + bloc)
							resultat = Object.assign({}, resultat)
							if (resultat === null) { resolve({}); return false }
							resolve(resultat)
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
							const donneesBlocSupprime = new Promise(async function (resolve) {
								const resultat = await db.EXISTS('pad-' + pad + ':' + blocSupprime)
								if (resultat === null) { resolve(); return false }
								if (resultat === 1) {
									let objet = await db.HGETALL('pad-' + pad + ':' + blocSupprime)
									objet = Object.assign({}, objet)
									if (objet === null) { resolve(); return false }
									if (objet.hasOwnProperty('media') && objet.media !== '' && objet.type !== 'embed') {
										supprimerFichier(pad, objet.media)
									}
									if (objet.hasOwnProperty('vignette') && objet.vignette !== '' && !String(objet.vignette).includes('/img/') && !verifierURL(objet.vignette, ['https', 'http'])) {
										supprimerFichier(pad, path.basename(objet.vignette))
									}
									if (objet.hasOwnProperty('bloc') && objet.bloc === blocSupprime) {
										await db
										.multi()
										.DEL('pad-' + pad + ':' + blocSupprime)
										.ZREM('blocs:' + pad, blocSupprime)
										.DEL('commentaires:' + blocSupprime)
										.DEL('evaluations:' + blocSupprime)
										.exec()
										resolve('supprime')
									} else {
										resolve()
									}
								} else {
									resolve()
								}
							})
							donneesBlocsSupprimes.push(donneesBlocSupprime)
						}
						const donneesBlocsRestants = []
						for (let i = 0; i < blocsRestants.length; i++) {
							const donneeBloc = new Promise(async function (resolve) {
								if (parseInt(blocsRestants[i].colonne) > parseInt(colonne)) {
									await db.HSET('pad-' + pad + ':' + blocsRestants[i].bloc, 'colonne', (parseInt(blocsRestants[i].colonne) - 1))
									resolve(i)
								} else {
									resolve(i)
								}
							})
							donneesBlocsRestants.push(donneeBloc)
						}
						Promise.all([donneesBlocsSupprimes, donneesBlocsRestants]).then(async function () {
							const date = dayjs().format()
							const activiteId = parseInt(donnees.activite) + 1
							await db
							.multi()
							.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
							// Enregistrer entrée du registre d'activité
							.HINCRBY('pads:' + pad, 'activite', 1)
							.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'colonne-supprimee' }) }])
							.exec()
							io.in('pad-' + pad).emit('supprimercolonne', { identifiant: identifiant, nom: nom, titre: titre, colonne: colonne, colonnes: colonnes, affichageColonnes: affichageColonnes, date: date, couleur: couleur, activiteId: activiteId })
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					})
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('deplacercolonne', async function (pad, titre, affichage, direction, colonne, couleur, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('colonnes') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
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
					const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
					if (blocs === null) { socket.emit('erreur'); return false }
					for (const bloc of blocs) {
						const donneesBloc = new Promise(async function (resolve) {
							let resultat = await db.HGETALL('pad-' + pad + ':' + bloc)
							resultat = Object.assign({}, resultat)
							if (resultat === null) { resolve({}); return false }
							resolve(resultat)
						})
						donneesBlocs.push(donneesBloc)
					}
					Promise.all(donneesBlocs).then(function (blocs) {
						const donneesBlocsDeplaces = []
						for (const item of blocs) {
							const donneesBlocDeplace = new Promise(async function (resolve) {
								if (item && item.hasOwnProperty('bloc')) {
									const resultat = await db.EXISTS('pad-' + pad + ':' + item.bloc)
									if (resultat === null) { resolve(); return false }
									if (resultat === 1 && parseInt(item.colonne) === parseInt(colonne) && direction === 'gauche') {
										await db.HSET('pad-' + pad + ':' + item.bloc, 'colonne', (parseInt(colonne) - 1))
										resolve('deplace')
									} else if (resultat === 1 && parseInt(item.colonne) === parseInt(colonne) && direction === 'droite') {
										await db.HSET('pad-' + pad + ':' + item.bloc, 'colonne', (parseInt(colonne) + 1))
										resolve('deplace')
									} else if (resultat === 1 && parseInt(item.colonne) === (parseInt(colonne) - 1) && direction === 'gauche') {
										await db.HSET('pad-' + pad + ':' + item.bloc, 'colonne', parseInt(colonne))
										resolve('deplace')
									} else if (resultat === 1 && parseInt(item.colonne) === (parseInt(colonne) + 1) && direction === 'droite') {
										await db.HSET('pad-' + pad + ':' + item.bloc, 'colonne', parseInt(colonne))
										resolve('deplace')
									} else {
										resolve()
									}
								} else {
									resolve()
								}
							})
							donneesBlocsDeplaces.push(donneesBlocDeplace)
						}
						Promise.all(donneesBlocsDeplaces).then(async function () {
							const date = dayjs().format()
							const activiteId = parseInt(donnees.activite) + 1
							await db
							.multi()
							.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
							// Enregistrer entrée du registre d'activité
							.HINCRBY('pads:' + pad, 'activite', 1)
							.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, couleur: couleur, type: 'colonne-deplacee' }) }])
							.exec()
							io.in('pad-' + pad).emit('deplacercolonne', { identifiant: identifiant, nom: nom, titre: titre, direction: direction, colonne: colonne, colonnes: colonnes, affichageColonnes: affichageColonnes, date: date, couleur: couleur, activiteId: activiteId })
							socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
							socket.request.session.save()
						})
					})
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('debloquerpad', async function (pad, identifiant, acces) {
			const resultat = await db.EXISTS('utilisateurs:' + identifiant)
			if (resultat === null) { socket.emit('erreur'); return false }
			if (resultat === 1) {
				let couleur = choisirCouleur()
				let utilisateur = await db.HGETALL('utilisateurs:' + identifiant)
				utilisateur = Object.assign({}, utilisateur)
				if (utilisateur === null) { socket.emit('erreur'); return false }
				const col = await db.HGET('couleurs:' + identifiant, 'pad' + pad)
				if (col !== null) {
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
					let donnees = await db.HGETALL('pads:' + pad)
					donnees = Object.assign({}, donnees)
					if (donnees === null ) { socket.emit('erreur'); return false }
					const donneesPad = await recupererDonneesPadProtege(donnees, pad, identifiant)
					socket.emit('debloquerpad', { identifiant: identifiant, nom: utilisateur.nom, langue: utilisateur.langue, couleur: couleur, pad: donneesPad.pad, blocs: donneesPad.blocs, activite: donneesPad.activite.reverse() })
				}
			} else {
				socket.emit('erreur')
			}
		})

		socket.on('modifiernotification', async function (pad, admins) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			await db.HSET('pads:' + pad, 'notification', JSON.stringify(admins))
			io.in('pad-' + pad).emit('modifiernotification', admins)
			socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
			socket.request.session.save()
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

		socket.on('supprimeractivite', async function (pad, id, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && socket.request.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				if (admins.includes(identifiant) || proprietaire === identifiant) {
					await db.ZREMRANGEBYSCORE('activite:' + pad, id, id)
					io.in('pad-' + pad).emit('supprimeractivite', id)
					socket.request.session.cookie.expires = new Date(Date.now() + dureeSession)
					socket.request.session.save()
				} else {
					socket.emit('nonautorise')
				}
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
		return new Promise(async function (resolve) {
			if (id === 1) {
				await db.SET('pad', 1)
			} else {
				await db.INCR('pad')
			}
			await db
			.multi()
			.HSET('pads:' + id, ['id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'fond', '/img/fond1.png', 'acces', 'public', 'contributions', 'ouvertes', 'affichage', 'mur', 'registreActivite', 'active', 'conversation', 'desactivee', 'listeUtilisateurs', 'activee', 'editionNom', 'desactivee', 'fichiers', 'actives', 'enregistrements', 'desactives', 'liens', 'actives', 'documents', 'desactives', 'commentaires', 'desactives', 'evaluations', 'desactivees', 'copieBloc', 'desactivee', 'ordre', 'croissant', 'largeur', 'normale', 'date', date, 'colonnes', JSON.stringify([]), 'affichageColonnes', JSON.stringify([]), 'bloc', 0, 'activite', 0, 'admins', JSON.stringify([])])
			.SADD('pads-crees:' + identifiant, id.toString())
			.SADD('utilisateurs-pads:' + id, identifiant)
			.HSET('dates-pads:' + id, 'date', date)
			.HSET('couleurs:' + identifiant, 'pad' + id, couleur)
			.exec()
			resolve(true)
		})
	}

	function creerPadSansCompte (id, token, titre, hash, date, identifiant, nom, langue, type) {
		return new Promise(async function (resolve) {
			if (id === 1) {
				await db.SET('pad', 1)
			} else {
				await db.INCR('pad')
			}
			await db
			.multi()
			.HSET('pads:' + id, ['id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'motdepasse', hash, 'fond', '/img/fond1.png', 'acces', 'public', 'contributions', 'ouvertes', 'affichage', 'mur', 'registreActivite', 'active', 'conversation', 'desactivee', 'listeUtilisateurs', 'activee', 'editionNom', 'desactivee', 'fichiers', 'actives', 'enregistrements', 'desactives', 'liens', 'actives', 'documents', 'desactives', 'commentaires', 'desactives', 'evaluations', 'desactivees', 'copieBloc', 'desactivee', 'ordre', 'croissant', 'largeur', 'normale', 'date', date, 'colonnes', JSON.stringify([]), 'affichageColonnes', JSON.stringify([]), 'bloc', 0, 'activite', 0])
			.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'date', date, 'nom', nom, 'langue', langue])
			.exec()
			if (type === 'api') {
				await db.SADD('pads-crees:' + identifiant, id.toString())
			}
			resolve(true)
		})
	}

	async function ajouterPadDansDb (id, donnees) {
		return new Promise(function (resolveMain) {
			const donneesBlocs = []
			for (const [indexBloc, bloc] of donnees.blocs.entries()) {
				const donneesBloc = new Promise(async function (resolve) {
					if (bloc.hasOwnProperty('id') && bloc.hasOwnProperty('bloc') && bloc.hasOwnProperty('titre') && bloc.hasOwnProperty('texte') && bloc.hasOwnProperty('media') && bloc.hasOwnProperty('iframe') && bloc.hasOwnProperty('type') && bloc.hasOwnProperty('source') && bloc.hasOwnProperty('vignette') && bloc.hasOwnProperty('identifiant') && bloc.hasOwnProperty('commentaires') && bloc.hasOwnProperty('evaluations') && bloc.hasOwnProperty('colonne') && bloc.hasOwnProperty('listeCommentaires') && bloc.hasOwnProperty('listeEvaluations')) {
						let visibilite = 'visible'
						if (bloc.hasOwnProperty('visibilite')) {
							visibilite = bloc.visibilite
						}
						await db
						.multi()
						.HSET('pad-' + id + ':' + bloc.bloc, ['id', bloc.id, 'bloc', bloc.bloc, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', bloc.vignette, 'date', bloc.date, 'identifiant', bloc.identifiant, 'commentaires', bloc.commentaires, 'evaluations', bloc.evaluations, 'colonne', bloc.colonne, 'visibilite', visibilite])
						.ZADD('blocs:' + id, [{ score: indexBloc, value: bloc.bloc }])
						.exec()
						for (const commentaire of bloc.listeCommentaires) {
							if (commentaire.hasOwnProperty('id') && commentaire.hasOwnProperty('identifiant') && commentaire.hasOwnProperty('date') && commentaire.hasOwnProperty('texte')) {
								await db.ZADD('commentaires:' + bloc.bloc, [{ score: commentaire.id, value: JSON.stringify(commentaire) }])
							}
						}
						for (const evaluation of bloc.listeEvaluations) {
							if (evaluation.hasOwnProperty('id') && evaluation.hasOwnProperty('identifiant') && evaluation.hasOwnProperty('date') && evaluation.hasOwnProperty('etoiles')) {
								await db.ZADD('evaluations:' + bloc.bloc, [{ score: evaluation.id, value: JSON.stringify(evaluation) }])
							}
						}
						resolve()
					} else {
						resolve()
					}
				})
				donneesBlocs.push(donneesBloc)
			}
			Promise.all(donneesBlocs).then(async function () {
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
				if (donnees.pad.hasOwnProperty('motdepasse') && donnees.pad.hasOwnProperty('code')) {
					await db.HSET('pads:' + id, ['id', id, 'token', donnees.pad.token, 'titre', donnees.pad.titre, 'identifiant', donnees.pad.identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'motdepasse', donnees.pad.motdepasse, 'code', donnees.pad.code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', donnees.pad.date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', affichageColonnes, 'bloc', donnees.pad.bloc, 'activite', donnees.pad.activite, 'admins', admins, 'vues', vues])
				} else if (donnees.pad.hasOwnProperty('motdepasse') && !donnees.pad.hasOwnProperty('code')) {
					await db.HSET('pads:' + id, ['id', id, 'token', donnees.pad.token, 'titre', donnees.pad.titre, 'identifiant', donnees.pad.identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'motdepasse', donnees.pad.motdepasse, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', donnees.pad.date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', affichageColonnes, 'bloc', donnees.pad.bloc, 'activite', donnees.pad.activite, 'admins', admins, 'vues', vues])
				} else if (donnees.pad.hasOwnProperty('code')) {
					await db.HSET('pads:' + id, ['id', id, 'token', donnees.pad.token, 'titre', donnees.pad.titre, 'identifiant', donnees.pad.identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'code', donnees.pad.code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', donnees.pad.date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', affichageColonnes, 'bloc', donnees.pad.bloc, 'activite', donnees.pad.activite, 'admins', admins, 'vues', vues])
				} else {
					await db.HSET('pads:' + id, ['id', id, 'token', donnees.pad.token, 'titre', donnees.pad.titre, 'identifiant', donnees.pad.identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', donnees.pad.date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', affichageColonnes, 'bloc', donnees.pad.bloc, 'activite', donnees.pad.activite, 'admins', admins, 'vues', vues])
				}
				for (const activite of donnees.activite) {
					if (activite.hasOwnProperty('bloc') && activite.hasOwnProperty('identifiant') && activite.hasOwnProperty('titre') && activite.hasOwnProperty('date') && activite.hasOwnProperty('couleur') && activite.hasOwnProperty('type') && activite.hasOwnProperty('id')) {
						await db.ZADD('activite:' + id, [{ score: activite.id, value: JSON.stringify(activite) }])
					}
				}
				if (pgdb === true && isNaN(parseInt(id)) === false) {
					const client = await pool.connect()
					await client.query('DELETE FROM pads WHERE pad = $1', [parseInt(id)])
					client.release()
					resolveMain('pad_ajoute_dans_db')
				} else {
					resolveMain('')
				}
			})
		})
	}

	function recupererDonneesUtilisateur (identifiant) {
		// Pads créés
		const donneesPadsCrees = new Promise(async function (resolveMain) {
			const pads = await db.SMEMBERS('pads-crees:' + identifiant)
			const donneesPads = []
			if (pads === null) { resolveMain(donneesPads); return false }
			for (const pad of pads) {
				const donneePad = new Promise(async function (resolve) {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { resolve({}); return false }
					if (resultat === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { resolve({}); return false }
						// Pour résoudre le problème de chemin pour les fichiers déplacés
						if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
							donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
						}
						const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
						if (reponse === 1) {
							let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
							utilisateur = Object.assign({}, utilisateur)
							if (utilisateur === null) {
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
						} else {
							donnees.nom = donnees.identifiant
							resolve(donnees)
						}
					} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
						const client = await pool.connect()
						const donneesQ = await client.query('SELECT donnees FROM pads WHERE pad = $1', [parseInt(pad)])
						client.release()
						if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 1) {
							const donnees = JSON.parse(donneesQ.rows[0].donnees)
							if (donnees.hasOwnProperty('identifiant')) {
								// Pour résoudre le problème de chemin pour les fichiers déplacés
								if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
									donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
								}
								const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
								if (reponse === 1) {
									let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
									utilisateur = Object.assign({}, utilisateur)
									if (utilisateur === null) {
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
								} else {
									donnees.nom = donnees.identifiant
									resolve(donnees)
								}
							} else {
								resolve({})
							}
						} else {
							resolve({})
						}
					} else {
						resolve({})
					}
				})
				donneesPads.push(donneePad)
			}
			Promise.all(donneesPads).then(function (resultat) {
				resolveMain(resultat)
			})
		})
		// Pads rejoints
		const donneesPadsRejoints = new Promise(async function (resolveMain) {
			const pads = await db.SMEMBERS('pads-rejoints:' + identifiant)
			const donneesPads = []
			if (pads === null) { resolveMain(donneesPads); return false }
			for (const pad of pads) {
				const donneePad = new Promise(async function (resolve) {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { resolve({}); return false }
					if (resultat === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { resolve({}); return false }
						// Pour résoudre le problème de chemin pour les fichiers déplacés
						if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
							donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
						}
						const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
						if (reponse === null) {
							donnees.nom = donnees.identifiant
							resolve(donnees)
							return false
						}
						if (reponse === 1) {
							let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
							utilisateur = Object.assign({}, utilisateur)
							if (utilisateur === null) {
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
						} else {
							donnees.nom = donnees.identifiant
							resolve(donnees)
						}
					} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
						const client = await pool.connect()
						const donneesQ = await client.query('SELECT donnees FROM pads WHERE pad = $1', [parseInt(pad)])
						client.release()
						if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 1) {
							const donnees = JSON.parse(donneesQ.rows[0].donnees)
							if (donnees.hasOwnProperty('identifiant')) {
								// Pour résoudre le problème de chemin pour les fichiers déplacés
								if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
									donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
								}
								const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
								if (reponse === 1) {
									let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
									utilisateur = Object.assign({}, utilisateur)
									if (utilisateur === null) {
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
								} else {
									donnees.nom = donnees.identifiant
									resolve(donnees)
								}
							} else {
								resolve({})
							}
						} else {
							resolve({})
						}
					} else {
						resolve({})
					}
				})
				donneesPads.push(donneePad)
			}
			Promise.all(donneesPads).then(function (resultat) {
				resolveMain(resultat)
			})
		})
		// Pads administrés
		const donneesPadsAdmins = new Promise(async function (resolveMain) {
			const pads = await db.SMEMBERS('pads-admins:' + identifiant)
			const donneesPads = []
			if (pads === null) { resolveMain(donneesPads); return false }
			for (const pad of pads) {
				const donneePad = new Promise(async function (resolve) {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { resolve({}); return false }
					if (resultat === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { resolve({}) }
						// Pour résoudre le problème de chemin pour les fichiers déplacés
						if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
							donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
						}
						const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
						if (reponse === 1) {
							let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
							utilisateur = Object.assign({}, utilisateur)
							if (utilisateur === null) {
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
						} else {
							donnees.nom = donnees.identifiant
							resolve(donnees)
						}
					} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
						const client = await pool.connect()
						const donneesQ = await client.query('SELECT donnees FROM pads WHERE pad = $1', [parseInt(pad)])
						client.release()
						if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 1) {
							const donnees = JSON.parse(donneesQ.rows[0].donnees)
							if (donnees.hasOwnProperty('identifiant')) {
								// Pour résoudre le problème de chemin pour les fichiers déplacés
								if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
									donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
								}
								const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
								if (reponse === 1) {
									let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
									utilisateur = Object.assign({}, utilisateur)
									if (utilisateur === null) {
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
								} else {
									donnees.nom = donnees.identifiant
									resolve(donnees)
								}
							} else {
								resolve({})
							}
						} else {
							resolve({})
						}
					} else {
						resolve({})
					}
				})
				donneesPads.push(donneePad)
			}
			Promise.all(donneesPads).then(function (resultat) {
				resolveMain(resultat)
			})
		})
		// Pads favoris
		const donneesPadsFavoris = new Promise(async function (resolveMain) {
			const pads = await db.SMEMBERS('pads-favoris:' + identifiant)
			const donneesPads = []
			if (pads === null) { resolveMain(donneesPads) }
			for (const pad of pads) {
				const donneePad = new Promise(async function (resolve) {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { resolve({}); return false }
					if (resultat === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { resolve({}); return false }
						// Pour résoudre le problème de chemin pour les fichiers déplacés
						if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
							donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
						}
						const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
						if (reponse === 1) {
							let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
							utilisateur = Object.assign({}, utilisateur)
							if (utilisateur === null) {
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
						} else {
							donnees.nom = donnees.identifiant
							resolve(donnees)
						}
					} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
						const client = await pool.connect()
						const donneesQ = await client.query('SELECT donnees FROM pads WHERE pad = $1', [parseInt(pad)])
						client.release()
						if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 1) {
							const donnees = JSON.parse(donneesQ.rows[0].donnees)
							if (donnees.hasOwnProperty('identifiant')) {
								// Pour résoudre le problème de chemin pour les fichiers déplacés
								if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '') {
									donnees.fond = '/' + definirDossierFichiers(pad) + '/' + pad + '/' + path.basename(donnees.fond)
								}
								const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
								if (reponse === 1) {
									let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
									utilisateur = Object.assign({}, utilisateur)
									if (utilisateur === null) {
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
								} else {
									donnees.nom = donnees.identifiant
									resolve(donnees)
								}
							} else {
								resolve({})
							}
						} else {
							resolve({})
						}
					} else {
						resolve({})
					}
				})
				donneesPads.push(donneePad)
			}
			Promise.all(donneesPads).then(function (resultat) {
				resolveMain(resultat)
			})
		})
		return Promise.all([donneesPadsCrees, donneesPadsRejoints, donneesPadsAdmins, donneesPadsFavoris])
	}

	function recupererDonneesAuteur (identifiant) {
		// Pads créés
		const donneesPadsCrees = new Promise(async function (resolveMain) {
			const pads = await db.SMEMBERS('pads-crees:' + identifiant)
			const donneesPads = []
			if (pads === null) { resolveMain(donneesPads) }
			for (const pad of pads) {
				const donneePad = new Promise(async function (resolve) {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { resolve({}); return false }
					if (resultat === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						resolve(donnees)
					} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
						const client = await pool.connect()
						const donneesQ = await client.query('SELECT donnees FROM pads WHERE pad = $1', [parseInt(pad)])
						client.release()
						if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 1) {
							const donnees = JSON.parse(donneesQ.rows[0].donnees)
							if (donnees.hasOwnProperty('identifiant')) {
								resolve(donnees)
							} else {
								resolve({})
							}
						} else {
							resolve({})
						}
					} else {
						resolve({})
					}
				})
				donneesPads.push(donneePad)
			}
			Promise.all(donneesPads).then(function (resultat) {
				resolveMain(resultat)
			})
		})
		// Pads administrés
		const donneesPadsAdmins = new Promise(async function (resolveMain) {
			const pads = await db.SMEMBERS('pads-admins:' + identifiant)
			const donneesPads = []
			if (pads === null) { resolveMain(donneesPads) }
			for (const pad of pads) {
				const donneePad = new Promise(async function (resolve) {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { resolve({}); return false }
					if (resultat === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { resolve({}); return false }
						resolve(donnees)
					} else if (resultat !== 1 && pgdb === true && isNaN(parseInt(pad)) === false) {
						const client = await pool.connect()
						const donneesQ = await client.query('SELECT donnees FROM pads WHERE pad = $1', [parseInt(pad)])
						client.release()
						if (donneesQ && donneesQ.hasOwnProperty('rows') && donneesQ.rows[0] && typeof donneesQ.rows[0] === 'object' && Object.keys(donneesQ.rows[0]).length === 1) {
							const donnees = JSON.parse(donneesQ.rows[0].donnees)
							if (donnees.hasOwnProperty('identifiant')) {
								resolve(donnees)
							} else {
								resolve({})
							}
						} else {
							resolve({})
						}
					} else {
						resolve({})
					}
				})
				donneesPads.push(donneePad)
			}
			Promise.all(donneesPads).then(function (resultat) {
				resolveMain(resultat)
			})
		})
		return Promise.all([donneesPadsCrees, donneesPadsAdmins])
	}

	async function recupererDonneesPad (id, token, identifiant, statut, res) {
		let pad = await db.HGETALL('pads:' + id)
		pad = Object.assign({}, pad)
		if (pad === null) { res.send('erreur'); return false }
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
				vues = parseInt(pad.vues)
				if (!admin && !accesPrive) {
					vues = vues + 1
				}
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
			const blocsPad = new Promise(async function (resolveMain) {
				const donneesBlocs = []
				if (admin || (!accesCode && !accesPrive)) {
					const blocs = await db.ZRANGE('blocs:' + id, 0, -1)
					if (blocs === null) { resolveMain(donneesBlocs); return false }
					for (const bloc of blocs) {
						const donneesBloc = new Promise(async function (resolve) {
							let donnees = await db.HGETALL('pad-' + id + ':' + bloc)
							donnees = Object.assign({}, donnees)
							if (donnees === null) { resolve({}); return false }
							if (Object.keys(donnees).length > 0) {
								// Pour résoudre le problème des capsules qui sont référencées dans une colonne inexistante
								if (parseInt(donnees.colonne) >= nombreColonnes) {
									donnees.colonne = nombreColonnes - 1
								}
								// Pour résoudre le problème de chemin pour les fichiers déplacés
								if (donnees.hasOwnProperty('vignette') && donnees.vignette !== '' && !String(donnees.vignette).includes('/img/') && !verifierURL(donnees.vignette, ['https', 'http'])) {
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
								// Ne pas ajouter les capsules dans les colonnes masquées
								if (pad.affichage === 'colonnes' && pad.affichageColonnes[donnees.colonne] === false && pad.identifiant !== identifiant && !pad.admins.includes(identifiant)) {
									resolve({})
									return false
								}
								const commentaires = await db.ZCARD('commentaires:' + bloc)
								if (commentaires === null) {
									donnees.commentaires = []
									resolve(donnees)
									return false
								}
								donnees.commentaires = commentaires
								const evaluations = await db.ZRANGE('evaluations:' + bloc, 0, -1)
								if (evaluations === null) {
									donnees.evaluations = []
									resolve(donnees)
									return false
								}
								const donneesEvaluations = []
								evaluations.forEach(function (evaluation) {
									donneesEvaluations.push(JSON.parse(evaluation))
								})
								donnees.evaluations = donneesEvaluations
								const resultat = await db.EXISTS('utilisateurs:' + donnees.identifiant)
								if (resultat === null) {
									donnees.nom = ''
									donnees.couleur = ''
									resolve(donnees)
									return false
								}
								if (resultat === 1) {
									let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
									utilisateur = Object.assign({}, utilisateur)
									if (utilisateur === null) {
										donnees.nom = ''
										donnees.couleur = ''
										resolve(donnees)
										return false
									}
									donnees.nom = utilisateur.nom
									const couleur = await db.HGET('couleurs:' + donnees.identifiant, 'pad' + id)
									if (couleur === null) {
										donnees.couleur = ''
									} else {
										donnees.couleur = couleur
									}
									resolve(donnees)
								} else {
									const reponse = await db.EXISTS('noms:' + donnees.identifiant)
									if (reponse === null) {
										donnees.nom = ''
										donnees.couleur = ''
										resolve(donnees)
										return false
									}
									if (reponse === 1) {
										const nom = await db.HGET('noms:' + donnees.identifiant, 'nom')
										if (nom === null) {
											donnees.nom = ''
											donnees.couleur = ''
											resolve(donnees)
											return false
										}
										donnees.nom = nom
										const couleur = await db.HGET('couleurs:' + donnees.identifiant, 'pad' + id)
										if (couleur === null) {
											donnees.couleur = ''
										} else {
											donnees.couleur = couleur
										}
										resolve(donnees)
									} else {
										donnees.nom = ''
										const couleur = await db.HGET('couleurs:' + donnees.identifiant, 'pad' + id)
										if (couleur === null) {
											donnees.couleur = ''
										} else {
											donnees.couleur = couleur
										}
										resolve(donnees)
									}
								}
							} else {
								resolve({})
							}
						})
						donneesBlocs.push(donneesBloc)
					}
					Promise.all(donneesBlocs).then(function (resultat) {
						resultat = resultat.filter(function (element) {
							return Object.keys(element).length > 0
						})
						resolveMain(resultat)
					})
				} else {
					resolveMain(donneesBlocs)
				}
			})
			const activitePad = new Promise(async function (resolveMain) {
				const donneesEntrees = []
				if (admin || (!accesCode && !accesPrive)) {
					const entrees = await db.ZRANGE('activite:' + id, 0, -1)
					if (entrees === null) { resolveMain(donneesEntrees); return false }
					for (let entree of entrees) {
						entree = JSON.parse(entree)
						const donneesEntree = new Promise(async function (resolve) {
							const resultat = await db.EXISTS('utilisateurs:' + entree.identifiant)
							if (resultat === null) {
								entree.nom = ''
								entree.couleur = ''
								resolve(entree)
								return false
							}
							if (resultat === 1) {
								let utilisateur = await db.HGETALL('utilisateurs:' + entree.identifiant)
								utilisateur = Object.assign({}, utilisateur)
								if (utilisateur === null) {
									entree.nom = ''
									entree.couleur = ''
									resolve(entree)
									return false
								}
								entree.nom = utilisateur.nom
								const couleur = await db.HGET('couleurs:' + entree.identifiant, 'pad' + id)
								if (couleur === null) {
									entree.couleur = ''
								} else {
									entree.couleur = couleur
								}
								resolve(entree)
							} else {
								const reponse = await db.EXISTS('noms:' + entree.identifiant)
								if (reponse === null) {
									entree.nom = ''
									entree.couleur = ''
									resolve(entree)
									return false
								}
								if (reponse === 1) {
									const nom = await db.HGET('noms:' + entree.identifiant, 'nom')
									if (nom === null) {
										entree.nom = ''
										entree.couleur = ''
										resolve(entree)
										return false
									}
									entree.nom = nom
									const couleur = await db.HGET('couleurs:' + entree.identifiant, 'pad' + id)
									if (couleur === null) {
										entree.couleur = ''
									} else {
										entree.couleur = couleur
									}
									resolve(entree)
								} else {
									entree.nom = ''
									const couleur = await db.HGET('couleurs:' + entree.identifiant, 'pad' + id)
									if (couleur === null) {
										entree.couleur = ''
									} else {
										entree.couleur = couleur
									}
									resolve(entree)
								}
							}
						})
						donneesEntrees.push(donneesEntree)
					}
					Promise.all(donneesEntrees).then(function (resultat) {
						resolveMain(resultat)
					})
				} else {
					resolveMain(donneesEntrees)
				}
			})
			Promise.all([blocsPad, activitePad]).then(async function ([blocs, activite]) {
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
				await db.HSET('pads:' + id, 'vues', vues)
				// Ajouter dans pads rejoints
				if (pad.identifiant !== identifiant && statut === 'utilisateur') {
					const padsRejoints = await db.SMEMBERS('pads-rejoints:' + identifiant)
					if (padsRejoints === null) { res.send('erreur'); return false }
					let padDejaRejoint = false
					for (const padRejoint of padsRejoints) {
						if (padRejoint === id) {
							padDejaRejoint = true
						}
					}
					if (padDejaRejoint === false && pad.acces !== 'prive') {
						await db
						.multi()
						.SADD('pads-rejoints:' + identifiant, id.toString())
						.SADD('pads-utilisateurs:' + identifiant, id.toString())
						.HSET('couleurs:' + identifiant, 'pad' + id, choisirCouleur())
						.SADD('utilisateurs-pads:' + id, identifiant)
						.exec()
						res.json({ pad: pad, blocs: blocs, activite: activite.reverse() })
					} else {
						// Vérifier notification mise à jour pad
						if (pad.hasOwnProperty('notification') && pad.notification.includes(identifiant) && Array.isArray(pad.notification)) {
							pad.notification.splice(pad.notification.indexOf(identifiant), 1)
							await db.HSET('pads:' + id, 'notification', JSON.stringify(pad.notification))
							res.json({ pad: pad, blocs: blocs, activite: activite.reverse() })
						} else {
							res.json({ pad: pad, blocs: blocs, activite: activite.reverse() })
						}
					}
				} else {
					// Vérifier notification mise à jour pad
					if (pad.hasOwnProperty('notification') && pad.notification.includes(identifiant) && Array.isArray(pad.notification)) {
						pad.notification.splice(pad.notification.indexOf(identifiant), 1)
						await db.HSET('pads:' + id, 'notification', JSON.stringify(pad.notification))
						res.json({ pad: pad, blocs: blocs, activite: activite.reverse() })
					} else {
						res.json({ pad: pad, blocs: blocs, activite: activite.reverse() })
					}
				}
			})
		} else {
			res.send('erreur')
		}
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
			const blocsPad = new Promise(async function (resolveMain) {
				const donneesBlocs = []
				const blocs = await db.ZRANGE('blocs:' + id, 0, -1)
				if (blocs === null) { resolveMain(donneesBlocs); return false }
				for (const bloc of blocs) {
					const donneesBloc = new Promise(async function (resolve) {
						let donnees = await db.HGETALL('pad-' + id + ':' + bloc)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { resolve({}); return false }
						if (donnees && Object.keys(donnees).length > 0) {
							if (parseInt(donnees.colonne) >= nombreColonnes) {
								donnees.colonne = nombreColonnes - 1
							}
							if (donnees.hasOwnProperty('vignette') && donnees.vignette !== '' && !String(donnees.vignette).includes('/img/') && !verifierURL(donnees.vignette, ['https', 'http'])) {
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
							if (pad.affichage === 'colonnes' && pad.affichageColonnes[donnees.colonne] === false) {
								resolve({})
								return false
							}
							const commentaires = await db.ZCARD('commentaires:' + bloc)
							if (commentaires === null) {
								donnees.commentaires = []
								resolve(donnees)
								return false
							}
							donnees.commentaires = commentaires
							const evaluations = await db.ZRANGE('evaluations:' + bloc, 0, -1)
							if (evaluations === null) {
								donnees.evaluations = []
								resolve(donnees)
								return false
							}
							const donneesEvaluations = []
							evaluations.forEach(function (evaluation) {
								donneesEvaluations.push(JSON.parse(evaluation))
							})
							donnees.evaluations = donneesEvaluations
							const resultat = await db.EXISTS('utilisateurs:' + donnees.identifiant)
							if (resultat === null) {
								donnees.nom = ''
								donnees.couleur = ''
								resolve(donnees)
								return false
							}
							if (resultat === 1) {
								let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
								utilisateur = Object.assign({}, utilisateur)
								if (utilisateur === null) {
									donnees.nom = ''
									donnees.couleur = ''
									resolve(donnees)
									return false
								}
								donnees.nom = utilisateur.nom
								const couleur = await db.HGET('couleurs:' + donnees.identifiant, 'pad' + id)
								if (couleur === null) {
									donnees.couleur = ''
								} else {
									donnees.couleur = couleur
								}
								resolve(donnees)
							} else {
								const reponse = await db.EXISTS('noms:' + donnees.identifiant)
								if (reponse === null) {
									donnees.nom = ''
									donnees.couleur = ''
									resolve(donnees)
									return false
								}
								if (reponse === 1) {
									const nom = await db.HGET('noms:' + donnees.identifiant, 'nom')
									if (nom === null) {
										donnees.nom = ''
										donnees.couleur = ''
										resolve(donnees)
										return false
									}
									donnees.nom = nom
									const couleur = await db.HGET('couleurs:' + donnees.identifiant, 'pad' + id)
									if (couleur === null) {
										donnees.couleur = ''
									} else {
										donnees.couleur = couleur
									}
									resolve(donnees)
								} else {
									donnees.nom = ''
									const couleur = await db.HGET('couleurs:' + donnees.identifiant, 'pad' + id)
									if (couleur === null) {
										donnees.couleur = ''
									} else {
										donnees.couleur = couleur
									}
									resolve(donnees)
								}
							}
						} else {
							resolve({})
						}
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
			const activitePad = new Promise(async function (resolveMain) {
				const donneesEntrees = []
				const entrees = await db.ZRANGE('activite:' + id, 0, -1)
				if (entrees === null) { resolveMain(donneesEntrees); return false }
				for (let entree of entrees) {
					entree = JSON.parse(entree)
					const donneesEntree = new Promise(async function (resolve) {
						const resultat = await db.EXISTS('utilisateurs:' + entree.identifiant)
						if (resultat === null) {
							entree.nom = ''
							entree.couleur = ''
							resolve(entree)
							return false
						}
						if (resultat === 1) {
							let utilisateur = await db.HGETALL('utilisateurs:' + entree.identifiant)
							utilisateur = Object.assign({}, utilisateur)
							if (utilisateur === null) {
								entree.nom = ''
								entree.couleur = ''
								resolve(entree)
								return false
							}
							entree.nom = utilisateur.nom
							const couleur = await db.HGET('couleurs:' + entree.identifiant, 'pad' + id)
							if (couleur === null) {
								entree.couleur = ''
							} else {
								entree.couleur = couleur
							}
							resolve(entree)
						} else {
							const reponse = await db.EXISTS('noms:' + entree.identifiant)
							if (reponse === null) {
								entree.nom = ''
								entree.couleur = ''
								resolve(entree)
								return false
							}
							if (reponse === 1) {
								const nom = await db.HGET('noms:' + entree.identifiant, 'nom')
								if (nom === null) {
									entree.nom = ''
									entree.couleur = ''
									resolve(entree)
									return false
								}
								entree.nom = nom
								const couleur = await db.HGET('couleurs:' + entree.identifiant, 'pad' + id)
								if (couleur === null) {
									entree.couleur = ''
								} else {
									entree.couleur = couleur
								}
								resolve(entree)
							} else {
								entree.nom = ''
								const couleur = await db.HGET('couleurs:' + entree.identifiant, 'pad' + id)
								if (couleur === null) {
									entree.couleur = ''
								} else {
									entree.couleur = couleur
								}
								resolve(entree)
							}
						}
					})
					donneesEntrees.push(donneesEntree)
				}
				Promise.all(donneesEntrees).then(function (resultat) {
					resolveMain(resultat)
				})
			})
			Promise.all([blocsPad, activitePad]).then(async function ([blocs, activite]) {
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
				if (pad.hasOwnProperty('notification') && pad.notification.includes(identifiant) && Array.isArray(pad.notification)) {
					pad.notification.splice(pad.notification.indexOf(identifiant), 1)
					await db.HSET('pads:' + id, 'notification', JSON.stringify(pad.notification))
					resolveData({ pad: pad, blocs: blocs, activite: activite.reverse() })
				} else {
					resolveData({ pad: pad, blocs: blocs, activite: activite.reverse() })
				}
			})
		})
	}

	async function verifierAcces (req, pad, identifiant, motdepasse) {
		return new Promise(async function (resolve) {
			let donnees = await db.HGETALL('pads:' + pad)
			donnees = Object.assign({}, donnees)
			if (donnees === null || !donnees.hasOwnProperty('identifiant')) { resolve('erreur'); return false }
			if (identifiant === donnees.identifiant && donnees.hasOwnProperty('motdepasse') && await bcrypt.compare(motdepasse, donnees.motdepasse)) {
				let utilisateur = await db.HGETALL('utilisateurs:' + identifiant)
				utilisateur = Object.assign({}, utilisateur)
				if (utilisateur === null || !utilisateur.hasOwnProperty('id') || !utilisateur.hasOwnProperty('nom') || !utilisateur.hasOwnProperty('langue')) { resolve('erreur'); return false }
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
			} else if (identifiant === donnees.identifiant && !donnees.hasOwnProperty('motdepasse')) {
				const resultat = await db.EXISTS('utilisateurs:' + identifiant)
				if (resultat === null) { resolve('erreur'); return false }
				if (resultat === 1) {
					let utilisateur = await db.HGETALL('utilisateurs:' + identifiant)
					utilisateur = Object.assign({}, utilisateur)
					if (utilisateur === null || !utilisateur.hasOwnProperty('id') || !utilisateur.hasOwnProperty('motdepasse') || !utilisateur.hasOwnProperty('nom') || !utilisateur.hasOwnProperty('langue')) { resolve('erreur'); return false }
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
				} else {
					resolve('erreur')
				}
			} else {
				resolve('erreur')
			}
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
		case 'en':
			if (donnees.hasOwnProperty('modifie')) {
				dateFormattee = 'Created on ' + dayjs(new Date(donnees.date)).locale('en').format('L') + ' at ' + dayjs(new Date(donnees.date)).locale('en').format('LT') + ' by ' + donnees.nom + '. Modified on ' + dayjs(new Date(donnees.modifie)).locale('en').format('L') + ' at ' + dayjs(new Date(donnees.modifie)).locale('en').format('LT') + '.'
			} else {
				dateFormattee = 'Created on ' + dayjs(new Date(donnees.date)).locale('en').format('L') + ' at ' + dayjs(new Date(donnees.date)).locale('en').format('LT') + ' by ' + donnees.nom + '.'
			}
			break
		case 'hr':
			if (donnees.hasOwnProperty('modifie')) {
				dateFormattee = 'Stvoreno na ' + dayjs(new Date(donnees.date)).locale('hr').format('L') + ' u ' + dayjs(new Date(donnees.date)).locale('hr').format('LT') + ' po ' + donnees.nom + '. Izmijenjeno na ' + dayjs(new Date(donnees.modifie)).locale('hr').format('L') + ' u ' + dayjs(new Date(donnees.modifie)).locale('hr').format('LT') + '.'
			} else {
				dateFormattee = 'Stvoreno na ' + dayjs(new Date(donnees.date)).locale('hr').format('L') + ' u ' + dayjs(new Date(donnees.date)).locale('hr').format('LT') + ' po ' + donnees.nom + '.'
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
											<img role="button" tabindex="0" v-if="item.type === 'image'" :src="'./fichiers/' + item.media" @click="afficherMedia(item)" @keydown.enter="afficherMedia(item)">
											<img role="button" tabindex="0" v-else-if="item.type === 'lien-image'" :src="item.media" @click="afficherMedia(item)" @keydown.enter="afficherMedia(item)">
											<span role="button" tabindex="0" v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'document' || item.type === 'pdf' || item.type === 'office' || item.type === 'embed'" @click="afficherMedia(item)" @keydown.enter="afficherMedia(item)"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></span>
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
											<span role="button" tabindex="0" class="bouton" @click="ouvrirModaleCommentaires(item.bloc, item.titre)" @keydown.enter="ouvrirModaleCommentaires(item.bloc, item.titre)" v-if="pad.commentaires === 'actives'"><i class="material-icons">comment</i><span class="badge">{{ item.commentaires }}</span></span>
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
											<img role="button" tabindex="0" v-if="item.type === 'image'" :src="'./fichiers/' + item.media" @click="afficherMedia(item)" @keydown.enter="afficherMedia(item)">
											<img role="button" tabindex="0" v-else-if="item.type === 'lien-image'" :src="item.media" @click="afficherMedia(item)" @keydown.enter="afficherMedia(item)">
											<span role="button" tabindex="0" v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'document' || item.type === 'pdf' || item.type === 'office' || item.type === 'embed'" @click="afficherMedia(item)" @keydown.enter="afficherMedia(item)"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></span>
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
											<span role="button" tabindex="0" class="bouton" @click="ouvrirModaleCommentaires(item.bloc, item.titre)" @keydown.enter="ouvrirModaleCommentaires(item.bloc, item.titre)" v-if="pad.commentaires === 'actives'"><i class="material-icons">comment</i><span class="badge">{{ item.commentaires }}</span></span>
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
													<img role="button" tabindex="0" v-if="item.type === 'image'" :src="'./fichiers/' + item.media" @click="afficherMedia(item)" @keydown.enter="afficherMedia(item)">
													<img role="button" tabindex="0" v-else-if="item.type === 'lien-image'" :src="item.media" @click="afficherMedia(item)" @keydown.enter="afficherMedia(item)">
													<span role="button" tabindex="0" v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'document' || item.type === 'pdf' || item.type === 'office' || item.type === 'embed'" @click="afficherMedia(item)" @keydown.enter="afficherMedia(item)"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></span>
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
													<span role="button" tabindex="0" class="bouton" @click="ouvrirModaleCommentaires(item.bloc)" @keydown.enter="ouvrirModaleCommentaires(item.bloc)" v-if="pad.commentaires === 'actives'"><i class="material-icons">comment</i><span class="badge">{{ item.commentaires }}</span></span>
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
									<span role="button" tabindex="0" class="fermer" @click="fermerModaleCommentaires" @keydown.enter="fermerModaleCommentaires"><i class="material-icons">close</i></span>
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
									this.$nextTick(function () {
										document.querySelector('.modale .fermer').focus()
									})
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
								if (item.vignette && item.vignette !== '' && this.verifierURL(item.vignette) === false && String(item.vignette).includes('/img/')) {
									vignette = './static/img/' + item.vignette.split('/').pop()
								} else if (item.vignette && item.vignette !== '' && this.verifierURL(item.vignette) === false && !String(item.vignette).includes('/img/')) {
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
