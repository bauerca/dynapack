var Dynapack = require('../..');
var serveStatic = require('serve-static');
var BundleSaver = require('../bundle-saver');

module.exports = function(app, done) {
  var scripts = this.iso;
  var iso = this;

  app.get('/', function(req, res) {
    res.send(
      '<html><body>' +
      scripts +
      '</body></html>'
    );
  });

  app.use(serveStatic(__dirname + '/bundles'));

  var packer = Dynapack({prefix: this.route + '/'});

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
