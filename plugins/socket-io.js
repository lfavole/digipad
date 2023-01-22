import Vue from 'vue'
import { io } from 'socket.io-client'

let hote = 'http://localhost:3000'
if (process.env.PORT) {
	hote = 'http://localhost:' + process.env.PORT
}
if (process.env.NODE_ENV === 'production') {
	hote = process.env.DOMAIN
}

Vue.prototype.$socket = io(hote, {
	transports: ['websocket', 'polling'],
	closeOnBeforeunload: false
})
