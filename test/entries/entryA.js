var other = require('./other');
if (other === 'other module') {
  document.location = iso.route + '/b';
}
else iso.fail('no require from entry A');
