var __b = './b' /*js*/;
var __c = './c' /*js*/;
var fetch = require('dynafetch')(require);
var latency = require('./latency');

var notify = document.getElementById('notify');

// Inside the dynapack test suite, a js bundle fetch is delayed by
// 200 ms. The following module c fetch should lead to 2 bundle
// downloads (b/c we have a dyn dep diamond situation); these downloads
// should happen IN PARALLEL. This means it should take roughly 200ms
// for the fetch callback to run.


setTimeout(function() {
  notify.innerHTML = 'fetching module c...';
  var start = (new Date()).getTime();
  fetch([__c], function(c) {
    notify.innerHTML = (
      'Expect ' + latency.toString() + 'ms load time. ' +
      'Time taken: ' +
      ((new Date()).getTime() - start).toString() +
      'ms'
    );
    iso.report(notify.textContent);
  });
}, 20);
