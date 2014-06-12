module.exports = [
  {
    path: '/diamond',
    entry: 'a.js',
    middleware: function(req, res) {
      var fs = require('fs');

      // Try to serve javascript files with delay.
      var jsFile = __dirname + '/diamond/bundles' + req.path;
      if (req.path !== '/' && fs.existsSync(jsFile)) {
        console.log('sending script', jsFile);
        // Send js after some lag and finish test if 3
        // bundles have been sent (a, c, and d).
        setTimeout(function() {
          res.sendfile(jsFile, function(err) {
            if (err) throw err;
          });
        }, require('./latency'));
        return;
      }

      // Otherwise send testing page.
      console.log('sending testing page');
      res.send(
        '<!DOCTYPE html><html><head></head><body>' +
        '<h2 id="notify">Downloading main.js...</h2>' +
        '<script type="text/javascript" async src="/diamond/main.js"></script>' +
        '</body></html>'
      );
    }
  },
  {
    path: '/wrong-order',
    entry: 'main.js',
    middleware: function(req, res) {
      var fs = require('fs');
      var bundle = __dirname + '/wrong-order/bundles' + req.path;

      if (req.path === '/main.js') {
        setTimeout(function() {
          res.sendfile(bundle, function(err) {
            if (err) throw err;
          });
        }, 200);
      } else if (req.path === '/2.js') {
        setTimeout(function() {
          res.sendfile(bundle, function(err) {
            if (err) throw err;
          });
        }, 20);
      } else {
        res.send(
          '<!DOCTYPE html><html><head></head><body>' +
          '<script type="text/javascript" async src="/wrong-order/main.js"></script>' +
          '<script type="text/javascript" async src="/wrong-order/2.js"></script>' +
          '</body></html>'
        );
      }
    }
  },
  {
    path: '/many-in-main',
    entry: 'main.js',
    middleware: function(req, res) {
      var bundle = __dirname + '/many-in-main/bundles' + req.path;
      if (req.path === '/') {
        res.send(
          '<!DOCTYPE html><html><head></head><body>' +
          '<script type="text/javascript" async src="/many-in-main/main.js"></script>' +
          '</body></html>'
        );
      } else {
        res.sendfile(bundle, function(err) {
          if (err) throw err;
        });
      }
    }
  }
];
