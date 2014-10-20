var Dynapack = require('../..');
var serveStatic = require('serve-static');
var expect = require('expect.js');

module.exports = function(app, done) {
  var scriptsA = this.iso;
  var scriptsB = this.iso;
  var iso = this;

  app.get('/', function(req, res) {
    res.redirect(iso.route + '/a');
  });
  app.get('/a', function(req, res) {
    res.send(
      '<html><body>' +
      scriptsA +
      '</body></html>'
    );
  });
  app.get('/b', function(req, res) {
    res.send(
      '<html><body>' +
      scriptsB +
      '</body></html>'
    );
  });
  app.use(serveStatic(__dirname + '/bundles'));

  var packer = Dynapack(
    {
      a: __dirname + '/entryA.js',
      b: __dirname + '/entryB.js'
    },
    {
      output: __dirname + '/bundles',
      prefix: this.route + '/'
    }
  );
  packer.run(function() {
    packer.write(function(err, entryInfo) {
      scriptsA += entryInfo.a.map(function(script) {
        return '<script async src="' + script + '"></script>';
      }).join('');
      scriptsB += entryInfo.b.map(function(script) {
        return '<script async src="' + script + '"></script>';
      }).join('');

      try {
        expect(entryInfo.a.length).to.be(3);
        expect(entryInfo.b.length).to.be(3);
        done();
      }
      catch (err) {
        done(err);
      }
    });
  });
};
