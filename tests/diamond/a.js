var __b = './b' /*js*/;
var __c = './c' /*js*/;
var fetch = require('dynafetch')(require);

var notify = document.getElementById('notify');

// Inside the dynapack test suite, a js bundle fetch is delayed by
// 200 ms. The following module c fetch should lead to 2 bundle
// downloads (b/c we have a dyn dep diamond situation); these downloads
// should happen IN PARALLEL. This means it should take roughly 200ms
// for the fetch callback to run.

setTimeout(function() {
  notify.innerHTML = 'fetching module c...';
  fetch([__c], function(c) {
    notify.innerHTML = 'done';
  });
}, 20);
