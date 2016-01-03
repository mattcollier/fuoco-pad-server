var async = require('async');
var bedrock = require('bedrock');
var bodyParser = require('body-parser');
var config = bedrock.config;
var cors = require('cors');
var database = require('bedrock-mongodb');
var fs = require('fs');
var _ = require('lodash');
require('bedrock-express');
var brServer = require('bedrock-server');
io = require('socket.io')(brServer.servers.https);

// var server = https.createServer({
//   key: fs.readFileSync('privkey.pem'),
//   cert: fs.readFileSync('fullchain.pem')
// }, app).listen(3000);

// load config
require('./config');

var collectionName = config['fuoco-server'].mongodb.collections.rawDocuments;
var collection = null;
var doc = {};

// open some collections once the database is ready
bedrock.events.on('bedrock-mongodb.ready', function(callback) {
  async.auto({
    openCollections: function(callback) {
      database.openCollections([collectionName], function(err) {
        if(!err) {
          collection = database.collections[collectionName];
        }
        callback(err);
      });
    },
    createIndexes: ['openCollections', function(callback) {
      // background indexing should be OK
      database.createIndexes([{
        collection: collectionName,
        fields: {content: 'text', title: 'text'},
        options: {unique: false, background: true}
      }], callback);
    }]
  }, callback);
});

bedrock.events.on('bedrock-express.configure.routes', addRoutes);

function addRoutes(app) {
  app.use(cors());

  app.get(config['fuoco-server'].documentBasePath, function(req, res) {
    var docKeys = Object.keys(doc);
    // model docs as an array
    var docs = [];
    for(var key in docKeys) {
      var keyName = docKeys[key];
      docs.push({
        id: keyName,
        title: doc[keyName].title,
        lastModified: doc[keyName].lastModified
      });
    }
    res.json(docs);
  });

  app.put(
    config['fuoco-server'].documentBasePath + '/:documentId',
    function(req, res) {
    console.log('UPDATE DOCUMENT', req.params.documentId, req.body);
    // FIXME: only update acceptable properties
    if(doc[req.params.documentId] && req.body.title) {
      doc[req.params.documentId].title = req.body.title;
    }
    res.sendStatus(204);
  });

  app.post(
    config['fuoco-server'].documentBasePath + '/:documentId',
    function(req, res) {
    // documentId was not supplied
    if(!req.params.documentId) {
      return res.json({});
    }
    var documentId = req.params.documentId;
    // documentId already exists in memory
    if(doc[documentId]) {
      console.log('Request for existing document:', documentId);
      return res.sendStatus(409);
    }
    // create new document
    console.log('Creating new document:', documentId);
    doc[documentId] = {};
    doc[documentId].title = 'Untitled document';
    doc[documentId].lastModified = new Date().toJSON();
    doc[documentId].history = {};
    doc[documentId].channel = io.of('/' + documentId);
    doc[documentId].channel.on('connection', function(socket) {
      socket.on('cursor', function(e) {
        doc[documentId].channel.emit('cursor', e);
      });
      socket.on('revision', function(revision) {
        // write the revision ONLY if it doesn't already exist
        _.assign(
          doc[documentId].history, revision, function(objVal, sourceVal, key) {
          if(_.isUndefined(objVal)) {
            var newObj = {};
            newObj[key] = sourceVal;
            doc[documentId].channel.emit('revision', revision);
            return sourceVal;
          }
          console.log('HISTORY COLLISION:', key);
          return objVal;
        });
        // _.assign(doc[documentId].history, e);
      });
      socket.on('titleChange', function(e) {
        doc[documentId].title = e.title;
        doc[documentId].channel.emit('titleChange', e);
      });
    });
    res.sendStatus(201);
  });

  app.get(
    config['fuoco-server'].documentBasePath + '/:documentId/history',
    function(req, res) {
    if(!doc[req.params.documentId]) {
      return res.json({});
    }
    console.log('SENDING HISTORY', req.params.documentId);
    res.json(doc[req.params.documentId].history);
  });
}
