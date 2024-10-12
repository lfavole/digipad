module.exports = {
	apps: [{
		name: 'Digipad',
		script: 'server/index.js',
		node_args: [
			'--nouse-idle-notification',
			'--expose-gc'
		],
		autorestart: true,
		max_restarts: 10,
		exec_interpreter: 'node',
		env: {
			'NODE_ENV': 'development'
		},
		env_production: {
			'NODE_ENV': 'production'
		}
	}]
}
