var Dynapack = require('../..');
var serveStatic = require('serve-static');
var latency = require('./latency');

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

  // Add artificial latency to all javascript
  app.get(/^\/.+\.js$/, function(req, res, next) {
    setTimeout(next, latency);
  });

  app.use(serveStatic(__dirname + '/bundles'));

  var packer = Dynapack({
    entries: {main: __dirname + '/main.js'},
    output: __dirname + '/bundles',
    prefix: this.route + '/'
  });

  packer.run(function() {
    packer.write(function(err, entryInfo) {
      scripts += entryInfo.main.map(function(script) {
        return '<script async src="' + script + '"></script>';
      }).join('');
      done();
    });
  });
};
