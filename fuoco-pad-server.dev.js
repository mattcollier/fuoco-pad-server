var bedrock = require('bedrock');
var path = require('path');

require('./lib/server.js');

require(path.join(__dirname, 'configs/dev.config'));

bedrock.start();
