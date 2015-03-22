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
  var bundles = saveBundle.bundles = [];

  return saveBundle;

  function saveBundle() {
    var bundle;
    var file;

    while (bundle = this.read()) {
      bundles.push(bundle);
      file = opts.dir + '/' + bundle.relative;
      mkdirp.sync(
        path.dirname(file)
      );
      fs.writeFileSync(file, bundle.contents);
    }
  };
}

module.exports = BundleSaver;
