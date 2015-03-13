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
      '<h2 id="notify">Failed if you are still reading this.</h2>' +
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

  var ss = pack.scripts();

  ss.on('data', function(file) {
    scripts = file.contents.toString();
  });
  ss.once('end', done);
  ss.once('error', done);

  pack.on('readable', BundleSaver({dir: output}));
  pack.once('end', function() {
    //fs.renameSync(output + '/a.entry.js', output + '/a.entry.min.js');
    fs.renameSync(output + '/1.js', output + '/1.min.js');
    ss.end({
      //'a.entry.js': 'a.entry.min.js',
      '1.js': '1.min.js'
    });
  });
  pack.once('error', done);
  pack.end(__dirname + '/a.js');
};
