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

  var packer = Dynapack({prefix: '/'});
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
