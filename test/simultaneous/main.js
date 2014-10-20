var fetch = require('dynafetch')(require);
var __a = __dirname + '/a.js' /*js*/;
var latency = require('./latency');


var a1;
var a2;

fetch([__a], function(a) {
  if (a !== 'a') {
    iso.report('Failure: on first fetch');
  }
  else if (a === a2) iso.report('Success');
  a1 = a;
});

setTimeout(function() {
  fetch([__a], function(a) {
    if (a !== 'a') {
      iso.report('Failure: on second fetch');
    }
    else if (a === a1) iso.report('Success');
    a2 = a;
  });
}, latency / 2);
