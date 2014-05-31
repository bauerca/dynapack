var fetch = require('dyna-fetch')(require);

var __secret = './secret'/*js*/;
var __nope = './nope'/*js*/;

module.exports = function(path, callback) {
  var __page = (path === '/secret') ? __secret : __nope;
  fetch([__page], function(page) {
    // 'page' is an html string.
    callback(page);
  });
};
