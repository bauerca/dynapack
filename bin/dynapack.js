#!/usr/bin/env node

var argv = require('minimist')(process.argv.slice(2));
var dynapack = require('../');
var path = require('path');
var cwd = process.cwd();

var entries = {};
argv._.forEach(function(entry) {
  entries[entry] = path.join(cwd, entry);
});

var opts = {
  output: path.join(cwd, argv.o || 'dynapack-chunks')
};

var packer = dynapack(entries, opts);
packer.run(function() {
  packer.write(function(err, entryInfo) {
    if (err) throw err;

    console.log(
      '\n' +
      'Entry info\n' +
      '----------\n\n' +
      'Each key is a given entry point. Each value is an\n' +
      'array of scripts that should be downloaded by the\n' +
      'associated entry point html page (assuming you serve\n' +
      '.js files on the root path).\n\n' +
      JSON.stringify(entryInfo, null, 2) +
      '\n'
    );

    console.log('Like this:\n');

    for (var entry in entryInfo) {
      console.log(entry + ':\n');
      entryInfo[entry].forEach(function(src) {
        console.log('  <script src="' + src + '"></script>');
      });
      console.log('');
    }
  });
});
