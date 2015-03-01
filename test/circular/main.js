var ensure = require('node-ensure');
var a = './a.js' /*js*/;

var canceled;
var sync1;

ensure([a], function(err) {
  var a1 = require(a);
  sync1 = true;
  if (a1 !== 'a') {
    iso.fail('on first fetch');
  }
  else {
    var sync2;

    ensure([a], function(err) {
      var a2 = require(a);
      sync2 = true;
      iso.report(
        a1 === a2 ? 'Success' : 'Failure: modules were different'
      );
    });

    if (sync2) {
      iso.fail('second fetch was synchronous.');
    }
  }
});

if (sync1) {
  iso.fail('first fetch was synchronous.');
}

setTimeout(function() {
  iso.fail('timeout.');
}, 1000);
