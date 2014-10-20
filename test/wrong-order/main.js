var __other = './other' /*js*/;
var fetch = require('dynafetch')(require);

fetch([__other], function(other) {
  if (other === 'other module') {
    iso.report('passed');
  } else {
    iso.report('failed');
  }
});
