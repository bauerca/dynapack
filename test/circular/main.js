var fetch = require('dynafetch')(require);
var __a = __dirname + '/a.js' /*js*/;

var canceled;

var sync1;

fetch([__a], function(a1) {
  sync1 = true;
  if (a1 !== 'a') {
    iso.fail('on first fetch');
  }
  else {
    var sync2;

    fetch([__a], function(a2) {
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
