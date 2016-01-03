var config = require('bedrock').config;

config['fuoco-server'] = {};
config['fuoco-server'].documentBasePath = '/document';
config['fuoco-server'].historyQuery = '/history';

// express info
config.express.session.secret = 'NOTASECRET';
config.express.session.key = 'fuoco-pad-server.sid';
config.express.session.prefix = 'fuoco-pad-server.';
