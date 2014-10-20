var Dynapack = require('../..');
var serveStatic = require('serve-static');

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

  var packer = Dynapack(
    {main: __dirname + '/main.js'},
    {output: __dirname + '/bundles', prefix: this.route + '/'}
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
