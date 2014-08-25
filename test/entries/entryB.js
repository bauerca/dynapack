var other = require('./other');
var report = require('../report');
if (other === 'other module') {
  report('passed');
}
else report('failed');
