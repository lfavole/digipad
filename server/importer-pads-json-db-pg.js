import 'dotenv/config'
import path from 'path'
import fs from 'fs-extra'
import pg from 'pg'
import dayjs from 'dayjs'
import { fileURLToPath } from 'url'

const { Client, Query } = pg
const client = new Client({
	user: process.env.PG_DB_USER,
	password: process.env.PG_DB_PWD,
	host: process.env.PG_DB_HOST,
	port: process.env.PG_DB_PORT,
	database: process.env.PG_DB_NAME
})
await client.connect()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

importer()

async function importer () {
	for (let i = 0; i < 900000; i++) {
		const chemin = path.join(__dirname, '..', '/static/pads')
		if (await fs.pathExists(path.normalize(chemin + '/' + i + '.json'))) {
			try {
				const donnees = await fs.readJson(path.normalize(chemin + '/' + i + '.json'))
				if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite')) {
					let requete
					const date = dayjs().format()
					if ((await client.query('SELECT id FROM pads WHERE pad = $1', [i])).rowCount > 0) {
						requete = new Query('UPDATE pads SET donnees = $1, blocs = $2, activite = $3, date = $4 WHERE pad = $5', [JSON.stringify(donnees.pad), JSON.stringify(donnees.blocs), JSON.stringify(donnees.activite), date, i])
						client.query(requete)
						requete.on('end', async function () {
							await fs.remove(path.normalize(chemin + '/' + i + '.json'))
							await fs.remove(path.normalize(chemin + '/pad-' + i + '.json'))
							console.log(i)
						})
						
						requete.on('error', function () {
							console.log('erreur : pad-' + i)
						})
					} else {
						requete = new Query('INSERT INTO pads (pad, donnees, blocs, activite, date) VALUES ($1, $2, $3, $4, $5)', [i, JSON.stringify(donnees.pad), JSON.stringify(donnees.blocs), JSON.stringify(donnees.activite), date])
						client.query(requete)
						requete.on('end', async function () {
							await fs.remove(path.normalize(chemin + '/' + i + '.json'))
							await fs.remove(path.normalize(chemin + '/pad-' + i + '.json'))
							console.log(i)
						})
						
						requete.on('error', function () {
							console.log('erreur : pad-' + i)
						})
					}
				}
			} catch (e) {
				console.log('erreur : pad-' + i)
			}
		}
	}
}
