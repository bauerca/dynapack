var browserTests = require('./browser-tests');

module.exports = function(msg) {
  for (var i = 0; i < browserTests.length; i++) {
    if (browserTests[i].path === location.pathname) {
      break;
    }
  }
  var newPath = (
    (i === browserTests.length - 1) ?
    '/finished' : browserTests[i + 1].path
  );
  document.location = (
     newPath + '?' +
    'test=' + location.pathname + '&' +
    'result=' + encodeURIComponent(msg)
  );
};
