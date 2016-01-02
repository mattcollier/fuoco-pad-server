// var Firebase = require('firebase');
var Firepad = require('firepad');

var headless = Firepad.Headless('https://burning-heat-2167.firebaseio.com/fuocopads/e9e51be6-c6dd-4637-a226-2b06484e8d1f');

headless.getDocument(function(document) {
  console.log('DOCUMENT:', document);
});
