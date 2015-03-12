var Module = require('../lib/module');
var expect = require('expect.js');
var fs = require('fs');

describe('Module', function() {
  describe('loadSource()', function() {
    it('should load from a stream', function(done) {
      var id = __dirname + '/diamond/a.js';
      var src = fs.createReadStream(id);
      var module = new Module({id: id, source: src});

      module.loadSource(function(err, source) {
        if (!err) {
          expect(typeof source).to.be('string');
        }
        done(err);
      });
    });

    it('should load from a filename', function(done) {
      var id = __dirname + '/diamond/a.js';
      var module = new Module({id: id});

      module.loadSource(function(err, source) {
        if (!err) {
          expect(typeof source).to.be('string');
        }
        done(err);
      });
    });
  });
});
