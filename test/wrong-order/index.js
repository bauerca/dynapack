var fs = require('fs');
var Dynapack = require('../..');
var BundleSaver = require('../bundle-saver');

/**
 *  In this test, the entry bundle arrives at the client much later than
 *  a chunk on which it depends dynamically.
 */

module.exports = function(app, done) {
  var iso = this;
  var scripts;

  app.use(function(req, res) {
    var bundle = __dirname + '/bundles' + req.path;

    if (req.path === '/entry.0.js') {
      setTimeout(function() {
        res.sendFile(bundle, function(err) {
          if (err) throw err;
        });
      }, 200);
    } else if (/\.js$/.test(req.path)) {
      res.sendFile(bundle, function(err) {
        if (err) throw err;
      });
    } else {
      res.send(
        '<!DOCTYPE html><html><head></head><body>' +
        scripts +
        '</body></html>'
      );
    }
  });

  var packer = Dynapack({prefix: iso.route + '/'});

  packer.on('readable', BundleSaver({dir: __dirname + '/bundles'}));
  packer.once('end', done);
  packer.once('error', done);
  packer.end({name: 'main', id: __dirname + '/main.js'});

  packer.on('bundled', function(graph) {
    scripts = iso.iso + graph.entries.main.map(function(script) {
      return '<script async src="' + packer.opts.prefix + script + '"></script>';
    }).join('');
  });
};

