var dynapack = require('../');
var through = require('through2');
var expect = require('expect.js');

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
