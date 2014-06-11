var __other = './other' /*js*/;
var fetch = require('dynafetch')(require);
var report = require('../report');

fetch([__other], function(other) {
  if (other === 'other module') {
    report('passed');
  } else {
    report('failed');
  }
});
