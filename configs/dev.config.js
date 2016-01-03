var config = require('bedrock').config;

// server info
config.server.port = 3443;
config.server.httpPort = 3000;
config.server.bindAddr = ['localhost'];
config.server.domain = '127.0.0.1';
config.server.host = '127.0.0.1:' + config.server.httpPort;
config.server.baseUri = 'http://' + config.server.host;
