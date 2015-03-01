var ensure = require('node-ensure');
var __a = './a.js' /*js*/;
var latency = require('./latency');


var a1;
var a2;

ensure([__a], function(err) {
  var a = require(__a);
  if (a !== 'a') {
    iso.report('Failure: on first ensure');
  }
  else if (a === a2) iso.report('Success');
  a1 = a;
});

setTimeout(function() {
  ensure([__a], function(err) {
    var a = require(__a);
    if (a !== 'a') {
      iso.report('Failure: on second ensure');
    }
    else if (a === a1) iso.report('Success');
    a2 = a;
  });
}, latency / 2);
