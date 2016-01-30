var config = require('bedrock').config;
var path = require('path');

// location of logs
var _logdir = path.join('/var', 'log', 'fuoco-pad-server');

// core configuration
config.core.workers = 1;
config.core.worker.restart = true;

// master process while starting
config.core.starting.groupId = 'adm';
config.core.starting.userId = 'root';

// master and workers after starting
config.core.running.groupId = 'fuoco';
config.core.running.userId = 'fuoco';

// logging
config.loggers.app.filename = path.join(_logdir, 'app.log');
config.loggers.access.filename = path.join(_logdir, 'access.log');
config.loggers.error.filename = path.join(_logdir, 'error.log');
// config.loggers.email.silent = true;
// config.loggers.email.to = ['cluster@fuoco.floydcommons.com'];
// config.loggers.email.from = 'cluster@fuoco.floydcommons.com';

// server info
config.server.port = 3000;
config.server.httpPort = 23080;
config.server.bindAddr = ['fuoco.floydcommons.com'];
config.server.domain = 'fuoco.floydcommons.com';
config.server.host = 'fuoco.floydcommons.com:' + config.server.port;
config.server.baseUri = 'https://' + config.server.host;

// secrets
require('./secrets.js');
