module.exports = {
	apps: [{
    	name: 'Digipad',
    	script: 'npm -- run server:prod',
		autorestart: true,
		max_restarts: 10
	}]
}
