import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { createServer } from 'http'
import compression from 'compression'

const app = express()
app.use(compression())
const httpServer = createServer(app)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, '..', '/static/maintenance/maintenance.html'))
})

const port = process.env.PORT || 3000
httpServer.listen(port)
