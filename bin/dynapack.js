#!/usr/bin/env node

var argv = require('minimist')(process.argv.slice(2));
var dynapack = require('../');
var path = require('path');
var streamArray = require('stream-array');
var dest = require('vinyl-fs').dest;
var cwd = process.cwd();

console.log('\nDynapack!! Pow!\n');
console.log('Entries:\n');

var entries = [];
argv._.forEach(function(entry) {
  console.log('  -', entry);
  entries.push(path.join(cwd, entry));
});

entries = streamArray(entries);

console.log('');

var output = path.join(cwd, argv.o || argv.output || './bundles');

var opts = {
  prefix: (argv.p || argv.prefix || '/').replace(/\/$/, '') + '/',
  debug: !!(argv.d || argv.debug)
};

if (opts.debug) {
  console.log('- Development/Debugging mode enabled.');
}

console.log('\nbundling...');

var pack = dynapack(opts);

pack.on('error', function(err) {
  throw err;
});

pack.on('bundled', function(graph) {
  console.log(
    '\n- Bundles have been saved to ' + output + '.\n' +
      '- Prefix for <script> src attribute is: ' + opts.prefix + '.\n'
  ); 

  console.log(
    '\n' +
      'Entry info\n' +
      '----------\n\n' +
      'Each key is a given entry point. Each value is an\n' +
      'array of bundles that should be downloaded by the\n' +
      'associated entry point html page (assuming you serve\n' +
      '.js files on the root path).\n\n' +
      JSON.stringify(graph.entries, null, 2) +
      '\n'
  );

  console.log('Like this:\n');

  for (var entry in graph.entries) {
    console.log(entry + ':\n');
    graph.entries[entry].forEach(function(src) {
      console.log('  <script src="' + opts.prefix + src + '"></script>');
    });
    console.log('');
  }
});

entries.pipe(pack).pipe(
  dest(output)
);
