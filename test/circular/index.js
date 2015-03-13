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
