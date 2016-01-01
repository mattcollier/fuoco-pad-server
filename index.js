var _ = require('lodash');
var bodyParser = require('body-parser');
var cors = require('cors');
var express = require('express');
var fs = require('fs');
var app = require('express')();
app.use(cors());
app.use(bodyParser.json());
var https = require('https');
var doc = {};

var server = https.createServer({
  key: fs.readFileSync('privkey.pem'),
  cert: fs.readFileSync('fullchain.pem')
}, app).listen(3000);

var io = require('socket.io')(server);

app.get('/document', function(req, res) {
  var docKeys = Object.keys(doc);
  var docs = {};
  for(var key in docKeys) {
    var keyName = docKeys[key];
    docs[keyName] = {
      id: keyName,
      title: doc[keyName].title,
      lastModified: doc[keyName].lastModified
    };
  }
  res.json(docs);
});

app.put('/document/:documentId', function(req, res) {
  console.log('UPDATE DOCUMENT', req.params.documentId, req.body);
  // FIXME: only update acceptable properties
  if(doc[req.params.documentId] && req.body.title) {
    doc[req.params.documentId].title = req.body.title;
  }
  res.sendStatus(204);
});

app.post('/document/:documentId', function(req, res) {
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
    socket.on('revision', function(e) {
      _.assign(doc[documentId].history, e);
      doc[documentId].channel.emit('revision', e);
    });
  });
  res.sendStatus(201);
});

app.get('/document/:documentId/history', function(req, res) {
  if(!doc[req.params.documentId]) {
    return res.json({});
  }
  console.log('SENDING HISTORY', req.params.documentId);
  res.json(doc[req.params.documentId].history);
});
