var ensure = require('node-ensure');
var latency = require('./latency');
var b = './b' /*js*/;
var c = './c' /*js*/;

var notify = document.getElementById('notify');

// Inside the dynapack test suite, a js bundle fetch is delayed by
// 200 ms. The following module c fetch should lead to 2 bundle
// downloads (b/c we have a dyn dep diamond situation); these downloads
// should happen IN PARALLEL. This means it should take roughly 200ms
// for the fetch callback to run.

//setTimeout(function() {
  notify.textContent = 'fetching module c...';
  var start = (new Date()).getTime();
  ensure([c], function(err) {
    console.log('got here???');
    var msg = (
      'Expect ' + latency.toString() + 'ms load time. ' +
      'Time taken: ' +
      ((new Date()).getTime() - start).toString() +
      'ms'
    );
    notify.textContent = msg;
    iso.ok(msg);
  });
//}, 20);
