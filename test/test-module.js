var Module = require('../lib/module');
var File = require('vinyl');
var expect = require('expect.js');
var fs = require('fs');

describe('Module', function() {
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
