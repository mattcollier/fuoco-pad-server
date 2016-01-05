var async = require('async');
var bedrock = require('bedrock');
var config = bedrock.config;
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
var ioChannels = {};
require('fuoco-index-server');

var KEY_SPACE = {
  DELIMITER: ':',
  HISTORY: 'h',
  META: 'm',
  DOCUMENTS: 'd',
  REVISIONS: 'r',
  UPDATES: 'u'
};

// track when bedrock is ready to attach io
bedrock.events.on('bedrock.ready', function() {
  io = require('socket.io')(brServer.servers.https);
  ioChannels.documentsMeta =
    io.of(config['fuoco-server'].documentsMeta.channel);
});

bedrock.events.on('bedrock-redis.ready', function() {
  store = brRedis.client;
});

bedrock.events.on('bedrock.start', function() {
  init();
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
  app.delete(config['fuoco-server'].documentBasePath + '/:documentId',
    function(req, res) {
      var documentId = req.params.documentId;
      // pipleline the deletion
      store.multi()
        .srem(KEY_SPACE.DOCUMENTS, documentId)
        .del(historyKey(documentId))
        .del(metaHash(documentId))
        .del(revisionKey(documentId))
        .exec(function(err, results) {
          // emit a the deletion immediately
          ioChannels.documentsMeta.emit('documentDelete', {id: documentId});
        });
    });

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
              async.auto({
                store: function(callback) {
                  store.hmset(metaHash(documentId), {title: e.title}, callback);
                },
                emit: ['store', function(callback) {
                  doc[documentId].channel.emit('titleChange', e);
                  callback();
                }],
                queueUpdate: ['store', function(callback) {
                  store.sadd(KEY_SPACE.UPDATES, documentId, callback);
                }]
              });
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
        var documentMeta = {
          id: documentId,
          title: 'Untitled document',
          lastModified: timeStamp
        };
        store.hmset(metaHash(documentId), documentMeta, function(err, result) {
          if(err) {
            return callback(err);
          }
          if(result === 0) {
            // FIXME: replace with Bedrock Error
            return callback(null, {statusCode: 400});
          }
          callback(null, {statusCode: 201, meta: documentMeta});
        });
      }],
      queueUpdate: ['initDocument', function(callback, results) {
        if(!results.initDocument.meta) {
          return callback();
        }
        store.sadd(KEY_SPACE.UPDATES, results.initDocument.meta.id, callback);
      }]
    }, function(err, results) {
      if(err) {
        console.log(err, results);
        throw new Error('Document initialization failed:', err);
      }
      res.sendStatus(results.initDocument.statusCode);
    });
  });

  app.get(
    config['fuoco-server'].documentBasePath + '/:documentId/history',
    function(req, res) {
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

function init() {
  // TODO: this should probably be handled with a job queue
  // transmit changed documents to subscribed listeners
  // get a list of documents that have been updated from a queue and broadcast
  processUpdatesQueue();
  setInterval(
    processUpdatesQueue,
    config['fuoco-server'].documentsMeta.processingInterval);
}

function processRevision(documentId, revision) {
  // NOTE: write the revision *ONLY* if it doesn't already exist
  // there will always be only one key per revision
  async.auto({
    storeId: function(callback) {
      store.sadd(
        revisionKey(documentId), Object.keys(revision)[0], callback);
    },
    storeRevision: ['storeId', function(callback, results) {
      // console.log('REVISION STATUS', results.storeId);
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

function processUpdatesQueue() {
  var multiRequest = store.multi();
  async.auto({
    getIds: function(callback) {
      // note get ALL updates by specifying a large number for `count`
      store.spop(KEY_SPACE.UPDATES, 10000, callback);
    },
    getMeta: ['getIds', function(callback, results) {
      // pipeline the meta request
      // multi commands are queued until exec is called
      if(results.getIds.length === 0) {
        return callback();
      }
      results.getIds.forEach(function(documentId) {
        multiRequest.hgetall(metaHash(documentId));
      });
      multiRequest.exec(callback);
    }]
  }, function(err, results) {
    if(err) {
      throw new Error('UpdatesQueue: ', err, results);
    }
    if(results.getIds.length > 0) {
      ioChannels.documentsMeta.emit('documentsMeta', results.getMeta);
    }
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
