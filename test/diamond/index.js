var latency = require('./latency');
var fs = require('fs');
var dynapack = require('../..');
var BundleSaver = require('../bundle-saver');

module.exports = function(app, done) {
  var iso = this;
  var scripts;

  app.use(function(req, res) {

    // Try to serve javascript files with delay.
    if (/\.js$/.test(req.path)) {
      var jsFile = __dirname + '/bundles' + req.path.replace(iso.route, '');
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

  var pack = dynapack({
    prefix: iso.route + '/',
    debug: false
  });

  pack.on('readable', BundleSaver({dir: output}));

  pack.once('end', function() {
    scripts = pack.scripts('a');
    done();
  });

  pack.once('error', done);
  pack.end(__dirname + '/a.js');
};
