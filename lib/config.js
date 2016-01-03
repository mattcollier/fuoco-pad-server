var config = require('bedrock').config;

config['fuoco-server'] = {};
config['fuoco-server'].baseUrl = 'https://sterns.t4k.org:3000';
config['fuoco-server'].documentBasePath = '/document';
config['fuoco-server'].historyQuery = '/history';
config['fuoco-server'].mongodb = {};
config['fuoco-server'].mongodb.collections = {};
config['fuoco-server'].mongodb.collections.rawDocuments = 'rawDocs';

config.mongodb.name = 'fuoco_dev';
config.mongodb.host = 'localhost';
config.mongodb.port = 27017;
config.mongodb.local.collection = 'fuoco_dev';
config.mongodb.username = 'fuoco';
config.mongodb.password = 'password';
config.mongodb.adminPrompt = true;

// express info
config.express.session.secret = 'NOTASECRET';
config.express.session.key = 'fuoco-pad-server.sid';
config.express.session.prefix = 'fuoco-pad-server.';
