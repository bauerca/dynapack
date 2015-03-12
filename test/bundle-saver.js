var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');

/**
 *  Create a callback for dynapack.on('readable') that saves
 *  all bundles to the given directory.
 *
 *  @param {String} opts.dir The bundle directory.
 */

function BundleSaver(opts) {
  return function() {
    var bundle;
    var file;

    while (bundle = this.read()) {
      file = opts.dir + '/' + bundle.id;
      mkdirp.sync(
        path.dirname(file)
      );
      fs.writeFileSync(file, bundle.source);
    }
  };
}

module.exports = BundleSaver;
