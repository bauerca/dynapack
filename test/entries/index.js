var Dynapack = require('../..');
var serveStatic = require('serve-static');
var expect = require('expect.js');
var BundleSaver = require('../bundle-saver');

module.exports = function(app, done) {
  var scriptsA = this.iso;
  var scriptsB = this.iso;
  var iso = this;
  var scripts = [];

  app.get('/', function(req, res) {
    res.redirect('/a');
  });
  app.get('/a', function(req, res) {
    res.send(
      '<html><body>' +
      iso.iso + 
      scripts[0] +
      '</body></html>'
    );
  });
  app.get('/b', function(req, res) {
    res.send(
      '<html><body>' +
      iso.iso + 
      scripts[1] +
      '</body></html>'
    );
  });
  app.use(serveStatic(__dirname + '/bundles'));

  var packer = Dynapack({
    prefix: '/'
  });
  var ss = packer.scripts();

  ss.on('data', function(file) {
    scripts.push(file.contents.toString());
  });
  ss.once('end', done);
  ss.once('error', done);

  packer.on('readable', BundleSaver({dir: __dirname + '/bundles'}));
  packer.once('error', done);
  packer.once('end', ss.end.bind(ss));

  //packer.on('bundled', function(graph) {
  //  scriptsA = iso.iso + graph.entries.entryA.map(function(script) {
  //    return '<script async src="' + script + '"></script>';
  //  }).join('');
  //  scriptsB += iso.iso + graph.entries.entryB.map(function(script) {
  //    return '<script async src="' + script + '"></script>';
  //  }).join('');

  //  expect(graph.entries.entryA.length).to.be(3);
  //  expect(graph.entries.entryB.length).to.be(3);
  //});

  packer.write(__dirname + '/entryA.js');
  packer.write(__dirname + '/entryB.js');
  packer.end();
};
