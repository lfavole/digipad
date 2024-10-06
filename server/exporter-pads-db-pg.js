import 'dotenv/config'
import { createClient } from 'redis'
import pg from 'pg'
import dayjs from 'dayjs'
let db
let db_port = 6379
if (process.env.DB_PORT) {
	db_port = process.env.DB_PORT
}
if (process.env.NODE_ENV === 'production') {
	db = await createClient({ host: process.env.DB_HOST, port: db_port, password: process.env.DB_PWD }).on('error', function (err) {
		console.log('redis: ', err)
	}).connect()
} else {
	db = await createClient({ port: db_port }).on('error', function (err) {
		console.log('redis: ' + err)
	}).connect()
}
const { Client, Query } = pg
const client = new Client({
	user: process.env.PG_DB_USER,
	password: process.env.PG_DB_PWD,
	host: process.env.PG_DB_HOST,
	port: process.env.PG_DB_PORT,
	database: process.env.PG_DB_NAME
})
await client.connect()

exporter(10)

async function exporter (jours) {
	const pad = await db.GET('pad')
	for (let i = 0; i < pad + 1; i++) {
		const id = i
		const resultat = await db.EXISTS('pads:' + id)
		if (resultat === 1) {
			const donnees = await db.HGETALL('pads:' + id)
			if ((donnees.hasOwnProperty('modifie') && dayjs(new Date(donnees.modifie)).isBefore(dayjs().subtract(jours, 'days'))) || (donnees.hasOwnProperty('date') && dayjs(new Date(donnees.date)).isBefore(dayjs().subtract(jours, 'days')))) {
				const donneesPad = new Promise(async function (resolveMain) {
					const resultats = await db.HGETALL('pads:' + id)
					if (resultats === null) { resolveMain({}); return false }
					resolveMain(resultats)
				})
				const blocsPad = new Promise(async function (resolveMain) {
					const donneesBlocs = []
					const blocs = await db.ZRANGE('blocs:' + id, 0, -1)
					if (blocs === null) { resolveMain(donneesBlocs); return false }
					for (const bloc of blocs) {
						const donneesBloc = new Promise(async function (resolve) {
							const donnees = await db.HGETALL('pad-' + id + ':' + bloc)
							if (donnees === null) { resolve({}); return false }
							if (donnees && Object.keys(donnees).length > 0) {
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
								resolve(donnees)
							} else {
								resolve({})
							}
						})
						donneesBlocs.push(donneesBloc)
					}
					Promise.all(donneesBlocs).then(function (resultat) {
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
						resolveMain(resultat)
					})
				})
				Promise.all([donneesPad, blocsPad, activitePad]).then(function (donnees) {
					if (donnees.length === 3 && donnees[0].id) {
						const date = dayjs().format()
						const requete = new Query('INSERT INTO pads (pad, donnees, blocs, activite, date) VALUES ($1, $2, $3, $4, $5)', [parseInt(id), JSON.stringify(donnees[0]), JSON.stringify(donnees[1]), JSON.stringify(donnees[2]), date])
						client.query(requete)
						requete.on('end', async function () {
							// Suppression données redis
							const blocs = await db.ZRANGE('blocs:' + id, 0, -1)
							for (let i = 0; i < blocs.length; i++) {
								await db
								.multi()
								.DEL('commentaires:' + blocs[i])
								.DEL('evaluations:' + blocs[i])
								.DEL('pad-' + id + ':' + blocs[i])
								.exec()
							}
							await db
							.multi()
							.DEL('blocs:' + id)
							.DEL('pads:' + id)
							.DEL('activite:' + id)
							exec()
							console.log(id)
						})
						
						requete.on('error', function () {
							console.log('erreur : pad-' + id)
						})
					}
				})
			}
		}
	}
}
