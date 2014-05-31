var connect = require('connect');
var serveStatic = require('serve-static');
var fs = require('fs');
var router = require('./router');
var parseurl = require('parseurl');

var words = 'hey do you want to know a secret';
var index = function(msg) {
  return (
    '<html>' +
    '<head></head>' +
    '<body>' +
      '<h1 id="msg">' + msg + '</h1>' +
      '<ul>' +
      words.split(' ').map(function(word) {
        return '<li onclick="go(\'/' + word + '\')">secret</li>';
      }).join('') +
      '</ul>' +
      '<script src="/main.js"></script>' +
    '</body>' +
    '</html>'
  );
};

var app = connect();
app.use(serveStatic(__dirname + '/chunks'));
app.use(function(req, res) {
  router(parseurl(req).path, function(msg) {
    var html = index(msg);
    res.end(html);
  });
});
app.listen(3333);
