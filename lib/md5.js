var crypto = require('crypto');

function md5(string, length) {
  return (
    crypto
    .createHash('md5')
    .update(string)
    .digest('hex')
    .slice(0, length || 8)
  );
}

module.exports = md5;
