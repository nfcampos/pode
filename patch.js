const {patch} = require('.')

patch({history: false})

console.log('boo')

require('child_process').exec('node -i', {stdio: 'inherit'})
