var config = require('bedrock').config;

config['fuoco-server'] = {};
config['fuoco-server'].documentBasePath = '/document';
config['fuoco-server'].historyQuery = '/history';
config['fuoco-server'].documentsMeta = {};
config['fuoco-server'].documentsMeta.channel = '/documents-meta';
// emit meta updates at interval in ms
config['fuoco-server'].documentsMeta.processingInterval = 2500;

// express info
config.express.session.secret = 'NOTASECRET';
config.express.session.key = 'fuoco-pad-server.sid';
config.express.session.prefix = 'fuoco-pad-server.';
