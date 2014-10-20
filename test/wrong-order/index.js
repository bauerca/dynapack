var fs = require('fs');
var Dynapack = require('../..');

  /**
   *  In this test, the entry bundle arrives at the client much later than
   *  a chunk on which it depends dynamically.
   */

module.exports = function(app, done) {
  var iso = this;
  var scripts = iso.iso;

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

  var packer = Dynapack(
    {main: __dirname + '/main.js'},
    {
      output: __dirname + '/bundles',
      prefix: iso.route + '/'
    }
  );
  packer.run(function() {
    packer.write(function(err, entryInfo) {
      scripts += entryInfo.main.map(function(script) {
        return '<script async src="' + script + '"></script>';
      }).join('');
      done();
    });
  });
};

