#!/bin/node

var argv = require('minimist')(process.argv.slice(2));
var dynapack = require('../');
var path = require('path');

var entry = path.join(process.cwd(), argv._[0]);
var opts = {
  output: path.join(path.dirname(entry), 'chunks')
};

dynapack(entry, opts);
