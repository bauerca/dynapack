var b = './b';
process.nextTick(function() {
  var a = require('./a');
  func(require(b));
  process.nextTick(function() {
    func(require(b));
    var c = require('./c');
  });
});
