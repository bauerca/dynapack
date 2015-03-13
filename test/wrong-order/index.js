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
    var bundle = __dirname + '/bundles' + req.path.replace(iso.route, '');

    if (req.path === (iso.route + '/main.entry.js')) {
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
  var ss = packer.scripts();

  ss.on('data', function(file) {
    scripts = iso.iso + file.contents.toString();
  });
  ss.once('end', done);
  ss.once('error', done);

  packer.on('readable', BundleSaver({dir: __dirname + '/bundles'}));
  packer.once('end', ss.end.bind(ss));
  packer.once('error', done);
  packer.end(__dirname + '/main.js');
};

