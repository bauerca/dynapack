var router = require('./router');

function onChange(path) {
  router(path, function(msg) {
    document.getElementById('msg').innerHTML = msg;
  });
}

window.go = function(path) {
  history.pushState(null, null, path);
  onChange(path);
};

window.onpopstate = function(event) {
  onChange(document.location.pathname);
};
