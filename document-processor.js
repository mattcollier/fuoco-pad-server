// var Firebase = require('firebase');
var Firepad = require('firepad');
var request = require('request');
request = request.defaults({json: true});
var lodash = require('lodash');

// var headless = Firepad.Headless('https://burning-heat-2167.firebaseio.com/fuocopads/e9e51be6-c6dd-4637-a226-2b06484e8d1f');
var headless = new Firepad.Headless({
    server: 'https://sterns.t4k.org:3000',
    document: 'e92a637b-94e1-4005-b94d-e80c8acb53d3',
    // socket: socket,
    push: function() {
      return {key: function() {return 'VALUE_NOT_USED';}};
    },
    headless: true,
    request: request,
    lodash: lodash
  });

headless.getDocument(function(document) {
  console.log('DOCUMENT:', document);
});
