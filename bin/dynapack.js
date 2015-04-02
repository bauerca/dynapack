#!/usr/bin/env node

var argv = require('minimist')(process.argv.slice(2));
var dynapack = require('../');
var path = require('path');
var streamArray = require('stream-array');
var dest = require('vinyl-fs').dest;
var cwd = process.cwd();
var fs = require('fs');
var mkdirp = require('mkdirp');

console.log(
  '\n' +
    '-------------------- Dynapack --------------------' +
    '\n'
);
console.log('Entries:');

var entries = [];
argv._.forEach(function(entry) {
  console.log('  -', entry);
  entries.push(path.join(cwd, entry));
});

entries = streamArray(entries);

console.log('');

var relOutput = argv.o || argv.output || './bundles';
var output = path.join(cwd, relOutput);

mkdirp.sync(output);

var opts = {
  prefix: (argv.p || argv.prefix || '/').replace(/\/$/, '') + '/',
  debug: !!(argv.d || argv.debug)
};

if (opts.debug) {
  console.log('- Development/Debugging mode enabled.');
}

var pack = dynapack(opts);
var scripts = pack.scripts();

entries.pipe(pack).pipe(dest(output));
scripts.pipe(dest(output));

pack.on('graph', function(graph) {
  fs.writeFileSync(
    path.join(output, 'graph.dot'),
    graph.to_dot()
  );

  graph.output(
    'pdf',
    path.join(output, 'graph.pdf')
  );
});

pack.on('error', function(err) {
  throw err;
});

pack.on('end', function() {
  scripts.end();

  var msg = [
    'Bundles, HTML, and (possibly) graphs have been',
    'saved to ' + relOutput + '. Each HTML file is',
    'named after an entry module and contains <script>',
    'blocks for the bundle loader and any bundles that',
    'are statically required by the entry module.',
    'Include each HTML snippet in the appropriate',
    'webpage HTML (for example, in a single-page-app',
    'with entry point: main.js, main.html might go in',
    'the <body> element of every page).',
    '',
    'Javascript bundle names are hexidecimal gobbledigook',
    '(created from a hash of the bundle contents).',
    '',
    '--------------------------------------------------'
  ];

  console.log(
    '\n' + msg.join('\n') + '\n'
  );
});

//pack.on('bundled', function(graph) {
//  console.log(
//    '\n- Bundles have been saved to ' + output + '.\n' +
//      '- Prefix for <script> src attribute is: ' + opts.prefix + '.\n'
//  );
//
//  console.log(
//    '\n' +
//      'Entry info\n' +
//      '----------\n\n' +
//      'Each key is a given entry point. Each value is an\n' +
//      'array of bundles that should be downloaded by the\n' +
//      'associated entry point html page (assuming you serve\n' +
//      '.js files on the root path).\n\n' +
//      JSON.stringify(graph.entries, null, 2) +
//      '\n'
//  );
//
//  console.log('Like this:\n');
//
//  for (var entry in graph.entries) {
//    console.log(entry + ':\n');
//    graph.entries[entry].forEach(function(src) {
//      console.log('  <script src="' + opts.prefix + src + '"></script>');
//    });
//    console.log('');
//  }
//});
