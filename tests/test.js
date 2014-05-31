var combopack = require('../');
var through = require('through2');
var expect = require('expect.js');

describe('combopack', function() {
  it('should exclude repeats across bundles', function(done) {
    //var mods = [];

    combopack(__dirname + '/a.js', function(chunks) {
      console.log(JSON.stringify(chunks, null, 2));
      done();
    });

    //  .on('data', function(mod) {
    //    mods.push(mod);
    //    console.log(JSON.stringify(mod, null, 2));
    //  })
    //  .on('end', function() {
    //    //expect(mods.length).to.be(3);
    //    assert(mods.length === 3);
    //    done();
    //  });
  });
});

xdescribe('dyna-fetch', function() {
  //var fetch = require('../require')(require);
  it('should work', function(done) {
    fetch(['http', 'fs'], function(http, fs) {
      expect(http.createServer).to.be.ok();
      expect(fs.readFile).to.be.ok();
      done();
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
