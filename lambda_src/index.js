require('dotenv').config()


exports.handler = function(event, context, callback) {
  console.log("I'm a lambda!")
  callback()
}