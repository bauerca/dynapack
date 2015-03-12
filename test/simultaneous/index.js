var Dynapack = require('../..');
var serveStatic = require('serve-static');
var latency = require('./latency');
var BundleSaver = require('../bundle-saver');

module.exports = function(app, done) {
  var iso = this;
  var scripts;

  app.get('/', function(req, res) {
    res.send(
      '<html><body>' +
      scripts +
      '</body></html>'
    );
  });

  // Add artificial latency to all javascript
  app.get(/^\/.+\.js$/, function(req, res, next) {
    setTimeout(next, latency);
  });

  app.use(serveStatic(__dirname + '/bundles'));

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
