import Vue from 'vue'
import moment from 'moment'

Vue.prototype.$formaterDate = function (date, langue) {
	let dateFormattee = ''
	switch (langue) {
	case 'fr':
		dateFormattee = moment(date).locale('fr').format('L') + ' à ' + moment(date).locale('fr').format('LT')
		break
	case 'en':
		dateFormattee = moment(date).locale('en').format('L') + ' at ' + moment(date).locale('en').format('LT')
		break
	}
	return dateFormattee
}

Vue.prototype.$formaterDateRelative = function (date, langue) {
	return moment(date).locale(langue).fromNow()
}
