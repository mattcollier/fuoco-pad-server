var async = require('async');
var bedrock = require('bedrock');
var bodyParser = require('body-parser');
var config = bedrock.config;
var cors = require('cors');
var fs = require('fs');
var _ = require('lodash');
var brExpress = require('bedrock-express');
var brServer = require('bedrock-server');
var brRedis = require('bedrock-redis');
var store = null;
var io = null;

var KEY_SPACE = {
  DELIMITER: ':',
  HISTORY: 'h',
  META: 'm',
  DOCUMENTS: 'd'
};

// track when bedrock is ready to attach io
bedrock.events.on('bedrock.ready', function() {
  io = require('socket.io')(brServer.servers.https);
});

bedrock.events.on('bedrock-redis.ready', function() {
  store = brRedis.client;
});

// load config
require('./config');

var doc = {};

bedrock.events.on('bedrock-express.configure.routes', addRoutes);

function addRoutes(app) {
  app.use(cors());

  app.get(config['fuoco-server'].documentBasePath, function(req, res) {
    var documents = [];
    var test = store.smembers(KEY_SPACE.DOCUMENTS, function(err, results) {
      if(err) {
        throw new Error('SMEMBERS failure', err);
      }
      results.forEach(function(doc) {
        documents.push(JSON.parse(doc));
      });
      console.log('SMEMBERS', JSON.stringify(documents, null, 2));
      res.json(documents);
    });
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
    store.sadd(KEY_SPACE.DOCUMENTS, JSON.stringify({
      id: documentId,
      title: 'Untitled document',
      lastModified: new Date().toJSON()
    }));
    doc[documentId] = {};
    doc[documentId].channel = io.of('/' + documentId);
    doc[documentId].channel.on('connection', function(socket) {
      socket.on('cursor', function(e) {
        doc[documentId].channel.emit('cursor', e);
      });
      socket.on('revision', function(revision) {
        console.log('REVISION', revision);
        // write the revision ONLY if it doesn't already exist CRITICAL!
        store.set(historyKey(documentId, revision.id), revision);
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
    var history = {};
    var test = store.smembers(historyKey(req.params.documentId), function(err, results) {
      if(err) {
        throw new Error('SMEMBERS HISTORY failure', err);
      }
      results.forEach(function(rev, key) {
        console.log('HISTORY', rev, key);
        // history[rev.id] =
        // documents.push(JSON.parse(doc));
      });
      console.log('SMEMBERS HISTORY', JSON.stringify(history, null, 2));
      res.json(history);
    });
    // res.json(doc[req.params.documentId].history);
  });
}

function metaKey(documentId) {
  return documentId + KEY_SPACE.DELIMITER + KEY_SPACE.META;
}

function historyKey(documentId, revisionId) {
  return documentId + KEY_SPACE.DELIMITER + KEY_SPACE.HISTORY;
}
