var latency = require('./latency');
var fs = require('fs');
var Dynapack = require('../..');
var mkdirp = require('mkdirp');
var path = require('path');

module.exports = function(app, done) {
  var iso = this;
  var scripts;

  app.use(function(req, res) {

    // Try to serve javascript files with delay.
    var jsFile = __dirname + '/bundles' + req.path;
    if (req.path !== '/' && fs.existsSync(jsFile)) {
      // Send js after some lag and finish test if 3
      // bundles have been sent (a, c, and d).
      setTimeout(function() {
        res.sendFile(jsFile, function(err) {
          if (err) throw err;
        });
      }, latency);
      return;
    }

    // Otherwise send testing page.
    res.send(
      '<!DOCTYPE html><html><head></head><body>' +
      '<h2 id="notify">Downloading main.js...</h2>' +
      iso.iso +
      scripts +
      '</body></html>'
    );
  });

  var output = __dirname + '/bundles';

  mkdirp.sync(output);

  var packer = Dynapack({
    prefix: iso.route + '/',
    debug: false
  });

  packer.on('data', function(bundle) {
    var file = output + '/' + bundle.id;

    mkdirp.sync(
      path.dirname(file)
    );

    fs.writeFileSync(
      output + '/' + bundle.id,
      bundle.source
    );
  });

  packer.once('finish', function() {
    scripts = packer.scripts('main');
    done();
  });

  packer.once('error', done);

  packer.writeEntry('main', __dirname + '/a.js');
  packer.end();
};
