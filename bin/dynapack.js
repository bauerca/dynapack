#!/usr/bin/env node

var argv = require('minimist')(process.argv.slice(2));
var dynapack = require('../');
var path = require('path');

var entry = path.join(process.cwd(), argv._[0]);
var opts = {
  output: path.join(path.dirname(entry), 'chunks')
};

var packer = dynapack(entry, opts);
packer.run(function() {
  packer.write(function(err, entryInfo) {
    if (err) throw err;

    console.log(
      'Entry info\n' +
      '----------\n\n' +
      'Each key is a given entry point. Each value is an ' +
      'array of scripts that should be downloaded by the ' +
      'associated entry point html page.\n\n' +
      JSON.stringify(entryInfo, null, 2)
    );

    console.log('Like this:\n');

    for (var entry in entryInfo) {
      console.log(entry + ':');
      entryInfo[entry].forEach(function(src) {
        console.log('  <script src="' + src + '"></script>');
      });
    }
  });
});
