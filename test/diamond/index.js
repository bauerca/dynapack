var latency = require('./latency');
var fs = require('fs');
var Dynapack = require('../..');

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

  var packer = Dynapack({
    entries: {main: __dirname + '/a.js'},
    output: __dirname + '/bundles',
    prefix: iso.route + '/'
  });

  packer.run(function(err) {
    if (err) done(err);
    else {
      packer.write(function(err, entryInfo) {
        if (err) return done(err);
        scripts = entryInfo.main.map(function(script) {
          return '<script async src="' + script + '"></script>';
        }).join('');
        done();
      });
    }
  });
};
