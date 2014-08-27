module.exports = [
  {
    path: '/diamond',
    entries: ['a.js'],
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
        //'<script type="text/javascript" async src="/diamond/entry.0.js"></script>' +
        this.scripts('a.js') +
        '</body></html>'
      );
    }
  },

  /**
   *  In this test, the entry bundle arrives at the client much later than
   *  a chunk on which it depends dynamically.
   */

  {
    path: '/wrong-order',
    entries: ['main.js'],
    middleware: function(req, res) {
      var fs = require('fs');
      var bundle = __dirname + '/wrong-order/bundles' + req.path;

      if (req.path === '/entry.0.js') {
        setTimeout(function() {
          res.sendfile(bundle, function(err) {
            if (err) throw err;
            console.log('sent', bundle);
          });
        }, 200);
      } else if (/\.js$/.test(req.path)) {
        res.sendfile(bundle, function(err) {
          if (err) throw err;
          console.log('sent', bundle);
        });
      } else {
        res.send(
          '<!DOCTYPE html><html><head></head><body>' +
          this.scripts('main.js') + 
          '</body></html>'
        );
      }
    }
  },
  {
    path: '/many-in-main',
    entries: ['main.js'],
    middleware: function(req, res) {
      var bundle = __dirname + '/many-in-main/bundles' + req.path;
      if (req.path === '/') {
        res.send(
          '<!DOCTYPE html><html><head></head><body>' +
          //'<script type="text/javascript" async src="/many-in-main/entry.0.js"></script>' +
          this.scripts('main.js') +
          '</body></html>'
        );
      } else {
        res.sendfile(bundle, function(err) {
          if (err) throw err;
        });
      }
    }
  },
  {
    path: '/entries',
    entries: ['entryA.js', 'entryB.js'],
    middleware: function(req, res) {
      var bundle = __dirname + '/entries/bundles' + req.path;
      if (req.path === '/') {
        res.send(
          '<!DOCTYPE html><html><head></head><body>' +
          this.scripts('entryA.js') +
          //'<script type="text/javascript" async src="/entries/entry.0.js"></script>' +
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
