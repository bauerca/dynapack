var __other = './other' /*js*/;
var ensure = require('node-ensure');

ensure([__other], function(err) {
  var other = require(__other);
  if (other === 'other module') {
    iso.report('passed');
  } else {
    iso.report('failed');
  }
});
