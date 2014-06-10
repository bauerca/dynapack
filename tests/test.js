var dynapack = require('../');
var through = require('through2');
var expect = require('expect.js');
var express = require('express');
var fs = require('fs');
var http = require('http');

describe('dynapack', function() {
  it('should produce 4 bundles from a dep diamond', function(done) {
    var packer = dynapack(__dirname + '/diamond/a.js');
    packer.run(function(chunks) { 
      //console.log(JSON.stringify(chunks, null, 2));
      expect(Object.keys(chunks).length).to.be(4);
      done();
    });
  });

  it('should inject process global', function(done) {
    var packer = dynapack(__dirname + '/usesProcess.js');
    packer.run(function(chunks) { 
      //console.log(JSON.stringify(chunks, null, 2));
      expect(Object.keys(chunks[1]).length).to.be(2);
      done();
    });
  });

  var server;

  afterEach(function() {
    server && server.close();
  });


  it('should pass browser tests', function(done) {
    this.timeout(0);

    var packer = dynapack(__dirname + '/diamond/a.js', {
      output: __dirname + '/diamond/bundles'
    });
    packer.run(function(chunks) { 
      packer.write(function() {
        
        var jsSendCount = 0;

        var app = express();
        app.use(function(req, res) {
          // Try to serve javascript files with delay.
          var jsFile = __dirname + '/diamond/bundles' + req.path;
          if (req.path !== '/' && fs.existsSync(jsFile)) {
            console.log('sending script', jsFile);
            // Send js 200 ms later and finish test if all 4
            // bundles have been sent.
            setTimeout(function() {
              res.sendfile(jsFile, function(err) {
                if (err) {
                  done(err);
                }
                if (++jsSendCount === 4) {
                  done();
                }
              });
            }, 200);

            return;
          }

          // Otherwise send testing page.
          console.log('sending testing page');
          res.send(
            '<!DOCTYPE html><html><head></head><body>' +
            '<h2 id="notify">Downloading main.js...</h2>' +
            '<script type="text/javascript" src="/main.js"></script>' +
            '</body></html>'
          );
        });

        process.on('SIGINT', function() {
          console.log('Stopping server...');
          server && server.close();
          process.exit();
        });

        var port = 3333;
        server = http.createServer(app);
        server.listen(port, function() {
          console.log(
            '\n\nPoint browser to localhost:' + port,
            'to complete testing. CTRL-C to abort.'
          );
        });
      });
    });
  });


});

xdescribe('encode-bits', function() {
  var enc = require('../lib/encode-bits');

  it('should work', function() {
    expect(enc([0,1,2,3])).to.be('f');
    console.log(enc([1,5,6,9,13,19,23], 64));
    console.log(enc([1,5,6,9,13,19,23], 32));
    console.log(enc([1,5,6,9,13,19,23], 16));
    console.log(enc([0,1,5,6,9,13,19,23], 64));
    console.log(enc([2,5,6,9,13,19,23], 64));
    console.log(enc([2,5,6,9,13,19,2300], 64));
    console.log(enc([23], 64));
    console.log(enc([0,1,2,3,4,5,6,7]));
    console.log(enc([0,1,2]));
  });

});
