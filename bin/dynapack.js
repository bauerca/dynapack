#!/usr/bin/env node

var argv = require('minimist')(process.argv.slice(2));
var dynapack = require('../');
var path = require('path');
var cwd = process.cwd();

console.log('\nDynapack!! Pow!\n');
console.log('Entries:\n');

var entries = {};
argv._.forEach(function(entry) {
  console.log('  -', entry);
  entries[entry] = path.join(cwd, entry);
});

console.log('');

var opts = {
  entries: entries,
  output: path.join(cwd, argv.o || argv.output || './bundles'),
  prefix: (argv.p || argv.prefix || '/').replace(/\/$/, '') + '/',
  bundle: !(argv.d || argv.debug)
};

if (!opts.bundle) {
  console.log('- Development/Debugging mode enabled.');
}

console.log('\nbundling...');

var packer = dynapack(opts);
packer.run(function(err) {
  if (err) throw err;
  packer.write(function(err, entryInfo) {
    if (err) throw err;


    console.log(
      '\n- Bundles have been saved to ' + opts.output + '.\n' +
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
      JSON.stringify(entryInfo, null, 2) +
      '\n'
    );

    console.log('Like this:\n');

    for (var entry in entryInfo) {
      console.log(entry + ':\n');
      entryInfo[entry].forEach(function(src) {
        console.log('  <script src="' + opts.prefix.replace(/\/$/, '') + src + '"></script>');
      });
      console.log('');
    }
  });
});
