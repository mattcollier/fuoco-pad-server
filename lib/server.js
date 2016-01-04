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
  DOCUMENTS: 'd',
  REVISIONS: 'r'
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
    var multiRequest = store.multi();
    async.auto({
      getIds: function(callback) {
        store.smembers(KEY_SPACE.DOCUMENTS, callback);
      },
      getMeta: ['getIds', function(callback, results) {
        // pipeline the meta request
        // multi commands are queued until exec is called
        results.getIds.forEach(function(documentId) {
          multiRequest.hgetall(metaHash(documentId));
        });
        multiRequest.exec(callback);
      }]
    }, function(err, results) {
      if(err) {
        throw new Error('DocumentList: ', err);
      }
      res.json(results.getMeta);
    });
  });

  // FIXME: this endpoint is unused at the moment because title changes
  // are handled with a socket
  /*
  app.put(
    config['fuoco-server'].documentBasePath + '/:documentId',
    function(req, res) {
    // FIXME: add appropriate response for document not found or
    // wrong update parameters specified
    console.log('UPDATE DOCUMENT', req.params.documentId, req.body);
    if(req.body.title) {
      store.hmset(metaHash(req.params.documentId), {title: req.body.title});
    }
    res.sendStatus(204);
  });
  */

  app.post(
    config['fuoco-server'].documentBasePath + '/:documentId',
    function(req, res) {
    // FIXME: is it possible for documentId to be falsey?
    // documentId was not supplied
    if(!req.params.documentId) {
      return res.json({});
    }
    var documentId = req.params.documentId;
    async.auto({
      setupSocket: function(callback) {
        doc[documentId] = {};
        doc[documentId].channel = io.of('/' + documentId);
        doc[documentId].channel.on('connection', function(socket) {
          socket.on('cursor', function(e) {
            doc[documentId].channel.emit('cursor', e);
          });
          socket.on('revision', function(revision) {
            processRevision(documentId, revision);
          });
          socket.on('titleChange', function(e) {
            if(e.title) {
              if(store.hmset(metaHash(documentId), {title: e.title})) {
                doc[documentId].channel.emit('titleChange', e);
              }
            }
          });
        });
        callback();
      },
      storeId: function(callback) {
        store.sadd(KEY_SPACE.DOCUMENTS, documentId, callback);
      },
      initDocument: ['storeId', function(callback, results) {
        // 1 = new document, 0 = existing document
        if(results.storeId === 0) {
          // FIXME: replace with Bedrock Error
          return callback(null, {statusCode: 409});
        }
        console.log('Creating new document:', documentId);
        var timeStamp = new Date().toJSON();
        store.hmset(metaHash(documentId), {
          id: documentId,
          title: 'Untitled document',
          lastModified: timeStamp
        }, function(err, result) {
          if(err) {
            return callback(err);
          }
          if(result === 0) {
            // FIXME: replace with Bedrock Error
            return callback(null, {statusCode: 400});
          }
          callback(null, {statusCode: 201});
        });
      }]
    }, function(err, results) {
      if(err) {
        throw new Error('Document initialization failed:', err);
      }
      res.sendStatus(results.initDocument.statusCode);
    });
  });

  app.get(
    config['fuoco-server'].documentBasePath + '/:documentId/history',
    function(req, res) {
    console.log('SENDING HISTORY', req.params.documentId);
    var history = {};
    store.smembers(historyKey(req.params.documentId), function(err, results) {
      if(err) {
        throw new Error('SMEMBERS HISTORY failure', err);
      }
      results.forEach(function(rev) {
        _.assign(history, JSON.parse(rev));
      });
      res.json(history);
    });
  });
}

function processRevision(documentId, revision) {
  // NOTE: write the revision *ONLY* if it doesn't already exist
  // there will always be only one key per revision
  async.auto({
    storeId: function(callback) {
      console.log('REVISION KEY', Object.keys(revision)[0]);
      store.sadd(
        revisionKey(documentId), Object.keys(revision)[0], callback);
    },
    storeRevision: ['storeId', function(callback, results) {
      console.log('REVISION STATUS', results.storeId);
      if(results.storeId === 0) {
        // FIXME: Remove, this logging is only for testing
        console.log('REVISION CONFLICT', revision);
        return callback();
      }
      store.sadd(
        historyKey(documentId), JSON.stringify(revision), callback);
    }],
    emitRevision: ['storeRevision', function(callback, results) {
      // only emit if save was successful
      if(results.storeRevision === 1) {
        doc[documentId].channel.emit('revision', revision);
      }
      callback();
    }]
  });
}

function metaHash(documentId) {
  return KEY_SPACE.META + KEY_SPACE.DELIMITER + documentId;
}

function historyKey(documentId) {
  return documentId + KEY_SPACE.DELIMITER + KEY_SPACE.HISTORY;
}

function revisionKey(documentId) {
  return documentId + KEY_SPACE.DELIMITER + KEY_SPACE.REVISIONS;
}
