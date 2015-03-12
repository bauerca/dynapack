var Dynapack = require('../..');
var serveStatic = require('serve-static');
var expect = require('expect.js');
var BundleSaver = require('../bundle-saver');

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

  var packer = Dynapack({
    prefix: this.route + '/'
  });

  packer.on('readable', BundleSaver({dir: __dirname + '/bundles'}));
  packer.once('error', done);
  packer.once('end', done);

  packer.on('bundled', function(graph) {
    scriptsA = iso.iso + graph.entries.a.map(function(script) {
      return '<script async src="' + script + '"></script>';
    }).join('');
    scriptsB += iso.iso + graph.entries.b.map(function(script) {
      return '<script async src="' + script + '"></script>';
    }).join('');

    expect(graph.entries.a.length).to.be(3);
    expect(graph.entries.b.length).to.be(3);
  });

  packer.write({name: 'a', id: __dirname + '/entryA.js'});
  packer.write({name: 'b', id: __dirname + '/entryB.js'});
  packer.end();
};
