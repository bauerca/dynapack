var dynapack = require('../');
var through = require('through2');
var expect = require('expect.js');
var express = require('express');
var fs = require('fs');
var path = require('path');
var http = require('http');
var async = require('async');
var envify = require('envify/custom');
var morgan = require('morgan');
var iso = require('osh-iso-test');
var through2 = require('through2');
var InsertGlobals = require('insert-module-globals');

describe('dynapack', function() {
  it('should produce single bundle and entry', function(done) {
    var packer = dynapack();
    var mcount = 0;
    var bcount = 0;

    packer.on('readable', function() {
      var bundle;

      while (bundle = this.read()) {
        bcount++;
        if (!bundle.entry) mcount += bundle.modules.length;
      }
    });

    packer.once('error', done);
    packer.once('end', function() {
      expect(mcount).to.be(1);
      expect(bcount).to.be(2); // 1 entry, and 1 bundle
      done();
    });

    packer.write(__dirname + '/diamond/d.js');
    packer.end();
  });

  it('should produce 4 bundles from a dep diamond', function(done) {
    var packer = dynapack();
    var bcount = 0;

    packer.on('readable', function() {
      var bundle;

      while (bundle = this.read()) {
        bcount++;
      }
    });

    packer.once('error', done);
    packer.once('end', function() {
      expect(bcount).to.be(5); // plus one entry.
      done();
    });

    packer.end(__dirname + '/diamond/a.js');
  });

  it('should emit the graph', function(done) {
    var packer = dynapack();

    //var expectedGraph = JSON.parse(
    //  fs.readFileSync(
    //    __dirname + '/diamond/graph.json',
    //    {encoding: 'utf8'}
    //  )
    //  .replace(
    //    /DIR/g,
    //    path.resolve(__dirname, '..')
    //  )
    //);

    packer.on('bundled', function(graph) {
      //console.log(JSON.stringify(graph, null, 2));
      //expect(graph).to.eql(expectedGraph);
      expect(Object.keys(graph.modules).length).to.be(6);
      expect(Object.keys(graph.bundles).length).to.be(4);
      expect(Object.keys(graph.entries).length).to.be(1);
      expect(graph.entries.a.length).to.be(2);
    });

    packer.once('error', done);
    packer.once('end', done);
    packer.end(__dirname + '/diamond/a.js');
    packer.resume();
  });

  it('should handle twice-written entry', function(done) {
    var packer = dynapack();
    var bcount = 0;

    packer.on('readable', function() {
      var bundle;

      while (bundle = this.read()) {
        bcount++;
      }
    });

    packer.once('error', done);
    packer.once('end', function() {
      expect(bcount).to.be(5);
      done();
    });

    packer.write(__dirname + '/diamond/a.js');
    packer.write(__dirname + '/diamond/a.js');
    packer.end();
  });

  /**
   *  Bundle the diamond, then "change" the base of the diamond by
   *  resubmitting d.js to the pack. Only the d.js-containing bundle
   *  should be re-emitted by the pack.
   */

  it('should handle updates', function(done) {
    var packer = dynapack();
    var deps = packer.deps();
    var bcount = 0;

    deps.pipe(packer.mods());

    packer.on('readable', function() {
      var bundle;

      while (bundle = this.read()) {
        bcount++;
      }

      if (bcount === 3) {
        deps.write({id: __dirname + '/diamond/d.js'});
      }
    });

    packer.once('error', done);
    packer.once('end', function() {
      expect(bcount).to.be(5);
      done();
    });

    packer.write(__dirname + '/diamond/a.js');
    packer.end();
  });

  it('should handle entry source', function(done) {
    var pack = dynapack();
    var bcount = 0;

    pack.on('readable', function() {
      while (this.read()) {bcount++}
    });

    pack.on('error', done);

    pack.on('end', function() {
      expect(bcount).to.be(2);
      done();
    });

    pack.end({id: __dirname + '/dne.js', source: 'module.exports=function(){};'});
    pack.resume();
  });

  it('should not error on bad js', function(done) {
    var pack = dynapack();
    pack.on('error', done);
    pack.on('end', done);
    pack.end({id: __dirname + '/dne.js', source: 'module.exports=function(){;'});
    pack.resume();
  });

  it('should allow dep transforms', function(done) {
    var pack = dynapack();
    var deps = pack.deps();
    var mods = pack.mods();
    var output = '';

    var transform = through2.obj(function(dep, encoding, callback) {
      dep.source = dep.source.replace('-=BAD=-', '-=GOOD=-');
      this.push(dep);
      callback();
    });

    deps.pipe(transform).pipe(mods);

    pack.on('readable', function() {
      var bundle;
      while (bundle = this.read()) {
        output += bundle.source;
      }
    });

    pack.on('error', done);

    pack.on('end', function() {
      expect(output).to.match(/-=GOOD=-/);
      done();
    });

    pack.end({
      id: __dirname + '/dne.js',
      source: '-=BAD=-'
    });
  });

  it('should fail on nonexistent module', function(done) {
    var pack = dynapack();
    pack.on('error', function(err) {
      done();
    });
    pack.on('end', function() {
      done(new Error('did not error'));
    });
    pack.end({
      id: __dirname + '/dne.js',
      source: 'require("fake");'
    });
    pack.resume();
  });

  xit('should be simple to use with browserify transforms?', function(done) {
    pack.deps().pipe(pick).pipe(insertGlobals).pipe(pick).pipe(pack.mods());
  });

  xit('should write graph.json', function(done) {
    var output = __dirname + '/diamond/bundles';
    var entry = __dirname + '/diamond/a.js';

    var packer = dynapack({
      entries: entry,
      output: output,
      bundle: true
    });

    packer.run(function(err, chunks) { 
      if (err) done(err);
      else {
        //console.log(JSON.stringify(chunks, null, 2));
        expect(Object.keys(chunks).length).to.be(4);
        packer.write(function(err, entryInfo) {
          if (err) done(err);
          else {
            var graph = JSON.parse(
              fs.readFileSync(output + '/graph.json')
            );
            //console.log(JSON.stringify(graph, null, 2));
            expect(graph.prefix).to.be.ok();
            expect(Object.keys(graph.entries).length).to.be(1);
            expect(graph.entries[entry].length).to.be(2);
            // Test the diamond.
            expect(Object.keys(graph.bundles).length).to.be(4);
            expect(Object.keys(graph.bundles['1.js']).length).to.be(2);
          }
          done();
        });
      }
    });
  });


  var server;

  afterEach(function() {
    server && server.close();
  });

  it('should pass browser tests', function(done) {
    this.timeout(0);
    iso({
      basedir: __dirname,
      tests: [
        'diamond',
        'circular',
        'wrong-order',
        'simultaneous',
        'entries'
      ],
      manual: false
    }, done);
  });

  //    var browserTests = require('./browser-tests');
  //    var app = express();
  //
  //    async.each(
  //      browserTests,
  //      function(test, callback) {
  //        var testDir = __dirname + test.path + '/';
  //        var entries = {};
  //
  //        test.entries.forEach(function(entry) {
  //          entries[entry] = testDir + entry;
  //        });
  //
  //        var packer = dynapack(
  //          entries,
  //          {
  //            output: testDir + 'bundles',
  //            prefix: test.path
  //          }
  //        );
  //        packer.run(function(chunks) { 
  //          packer.write(function(err, entryInfo) {
  //            console.log(JSON.stringify(entryInfo, null, 2));
  //            test.entryInfo = entryInfo;
  //            test.scripts = function(entry) {
  //              return entryInfo[entry].map(function(script) {
  //                return '<script type="text/javascript" async src="' + script + '"></script>';
  //              }).join('')
  //            };
  //            callback(err);
  //          });
  //        });
  //      },
  //      function() {
  //        
  //        var results = '';
  //
  //        function getResults(query) {
  //          if (Object.keys(query).length) {
  //            results += (
  //              '<li>' +
  //                query.test + ': ' +
  //                query.result +
  //              '</li>'
  //            );
  //          }
  //        }
  //
  //        var firstVisit = true;
  //
  //        var app = express();
  //        app.use(morgan('combined'));
  //        app.get('/', function(req, res) {
  //          res.send(
  //            '<html><head></head><body>' +
  //            (
  //              firstVisit ?
  //              (
  //                '<script>location = "' +
  //                browserTests[0].path +
  //                '";</script>'
  //              ) :
  //              '<ul>' + results + '</ul>'
  //            ) +
  //            '</script></body></html>'
  //          );
  //          !firstVisit && done();
  //          firstVisit = false;
  //        });
  //        app.get('/finished', function(req, res) {
  //          getResults(req.query);
  //          res.redirect('/');
  //        });
  //
  //        browserTests.forEach(function(test) {
  //          app.use(test.path, function(req, res) {
  //            getResults(req.query);
  //            test.middleware(req, res);
  //          });
  //        });
  //
  //        var port = 3333;
  //        server = http.createServer(app);
  //        server.listen(port, function() {
  //          console.log(
  //            '\n\nPoint browser to localhost:' + port,
  //            'to complete testing. CTRL-C to abort.'
  //          );
  //        });
  //      }
  //    );
  //
  //    process.on('SIGINT', function() {
  //      console.log('Stopping server...');
  //      server && server.close();
  //      process.exit();
  //    });
  //  });

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
