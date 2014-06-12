var report = require('../report');

// We depend statically on b, AND a depends statically on b.
// We should get 3 "bundles": main.js, a.js, and b.js, because b
// is shared by main and a. However, dynapack will create only 2
// true bundles; the main bundle will include main.js and b.js.

// So, main.js and b.js will be passed to two separate calls to
// the dynapack bundle loader. main.js should execute ONLY after both
// bundles have been passed to the loader.
var __a = './a' /*js*/;

try {
  var b = require('./b'); // This should not throw an error.
  report('passed');
} catch (e) {
  report(e.message);
}
