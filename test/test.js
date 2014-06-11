var dynapack = require('../');
var through = require('through2');
var expect = require('expect.js');
var express = require('express');
var fs = require('fs');
var http = require('http');
var async = require('async');

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
    
    var browserTests = require('./browser-tests');
    var app = express();

    async.each(
      browserTests,
      function(test, callback) {
        var testDir = __dirname + test.path + '/';

        var packer = dynapack(testDir + test.entry, {
          output: testDir + 'bundles',
          prefix: test.path
        });
        packer.run(function(chunks) { 
          packer.write(callback);
        });
      },
      function() {
        
        var results = '';

        function getResults(query) {
          if (Object.keys(query).length) {
            results += (
              '<li>' +
                query.test + ': ' +
                query.result +
              '</li>'
            );
          }
        }

        var firstVisit = true;

        var app = express();
        app.use(function(req, res, next) {
          console.log('request for', req.originalUrl);
          next();
        });
        app.get('/', function(req, res) {
          res.send(
            '<html><head></head><body>' +
            (
              firstVisit ?
              (
                '<script>location = "' +
                browserTests[0].path +
                '";</script>'
              ) :
              '<ul>' + results + '</ul>'
            ) +
            '</script></body></html>'
          );
          !firstVisit && done();
          firstVisit = false;
        });
        app.get('/finished', function(req, res) {
          getResults(req.query);
          res.redirect('/');
        });

        browserTests.forEach(function(test) {
          app.use(test.path, function(req, res) {
            getResults(req.query);
            test.middleware(req, res);
          });
        });

        var port = 3333;
        server = http.createServer(app);
        server.listen(port, function() {
          console.log(
            '\n\nPoint browser to localhost:' + port,
            'to complete testing. CTRL-C to abort.'
          );
        });
      }
    );

    process.on('SIGINT', function() {
      console.log('Stopping server...');
      server && server.close();
      process.exit();
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
