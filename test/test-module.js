var Module = require('../lib/module');
var File = require('vinyl');
var expect = require('expect.js');
var fs = require('fs');

describe('Module', function() {
  describe('findDeps()', function() {
    it('should override dynamic with static dep', function(done) {
      var path = __dirname + '/diamond/a.js';
      var src = 'require("' + path + '");' +
        'var a = "' + path + '"/*js*/;';
      var file = new File({path: path, contents: new Buffer(src)});
      var module = new Module({file: file});

      module.parse(function(err) {
        expect(module.deps.static.length).to.be(1);
        expect(module.deps.dynamic.length).to.be(0);
        done(err);
      });
    });
  });

  describe('loadSource()', function() {
    it('should load from a stream', function(done) {
      var path = __dirname + '/diamond/a.js';
      var src = fs.createReadStream(path);
      var file = new File({path: path, contents: src});
      var module = new Module({file: file});

      module.loadSource(function(err, source) {
        if (!err) {
          expect(typeof source).to.be('string');
        }
        done(err);
      });
    });

    it('should load from a filename', function(done) {
      var path = __dirname + '/diamond/a.js';
      var file = new File({path: path});
      var module = new Module({file: file});

      module.loadSource(function(err, source) {
        if (!err) {
          expect(typeof source).to.be('string');
        }
        done(err);
      });
    });
  });
});
