
function DynamicRegExp(labels) {
  labels = labels || ['js'];

  return new RegExp(
    '(__dirname\\s+\\+\\s+)?' +
    '([\'"])([^\'"]+)\\2\\s*[,;]?\\s*/\\*\\s*(' + 
    labels.join('|') +
    ')\\s*\\*/', 'g'
  );
}

module.exports = DynamicRegExp;
