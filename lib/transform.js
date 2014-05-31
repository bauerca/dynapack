var through = require('through');
var esprima = require('esprima');


// Executes visitor on the object and its children (recursively).
function traverse(object, visitor) {
  var key, child;
  if (visitor.call(null, object) === false) {
    return;
  }
  for (key in object) {
    if (object.hasOwnProperty(key)) {
      child = object[key];
      if (typeof child === 'object' && child !== null) {
        traverse(child, visitor);
      }
    }
  }
}

/**
 *  Returns the argument (the esprima node) to require call if successful match.
 */
function matchRequire(node) {
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require'
  ) {
    return node.arguments[0];
  }
}

/**
 *  If node is a call to process.nextTick, return a {@link NextTick}
 *  object. Nope, return the location of the nextTick callback function
 *  body.
 */
function matchProcessNextTick(node) {
  if (node.type !== 'ExpressionStatement') {
    return;
  }
    
  // Stash last nextTick
  var nextTick = {
    deps: [],
    depVars: [],
    requires: []
  };

  // Bounds of the process.nextTick call
  nextTick.loc = node.loc;

  var call = node.expression;
  if (
    call.type !== 'CallExpression' ||
    call.callee.type !== 'MemberExpression'
  ) {
    return;
  }

  var callee = call.callee;
  if (
    callee.object.name !== 'process' ||
    callee.property.name !== 'nextTick'
  ) {
    return;
  }

  var fn = call.arguments[0];
  nextTick.fnBody = fn.body.loc;

  return fn.body.loc;
}

module.exports = function(opts) {
  return function(file) {
    var data = '';

    return through(write, end);

    function write(buf) {
      data += buf;
    }

    function end() {
      var self = this;

      var nextTicks = []; // Finished.
      var nextTickStack = []; // In progress.
      var currentNextTick;

      var lines = data.split('\n');

      var syntax = esprima.parse(data, {loc: true});

      traverse(syntax, parseNode);
      nextTicks = nextTicks.concat(nextTickStack);

      if (nextTicks.length) {

        // A replacement object has a loc and a source.
        var replacements = [];

        nextTicks.forEach(function(nextTick) {
          var requires = nextTick.requires;
          if (requires.length === 0) {
            return;
          }

          replacements.push({
            loc: {
              start: nextTick.loc.start, // p in process
              end: nextTick.bodyLoc.start   // left-brace callback def
            },
            src: (
              'require([' +
                requires.map(function(req) {
                  var dep = req.dep;
                  return (
                    getRange(dep.loc) +
                    (
                      (dep.type === 'Literal' && typeof dep.value === 'string') ?
                      '/*' + opts.moduleLabel + '*/' : ''
                    )
                  );
                }).join(', ') +
              '], function(' +
                requires.map(function(req, index) {
                  return '$$' + index;
                }).join(', ') +
              ') '
            )
          });

          requires.forEach(function(req, index) {
            replacements.push({
              loc: req.loc,
              src: '$$' + index
            });
          });
        });

        replacements.sort(function(r1, r2) {
          return isBefore(r1.loc, r2.loc) ? -1 : 1;
        });

        //console.log('REPLACING');
        //console.log(replacements.map(function(r) {return getRange(r.loc);}));
        //console.log('WITH');
        //console.log(replacements.map(function(r) {return r.src;}));

        /**
         *  Get the stuff between replacements.
         *  This code will be kept as is.
         */
        var originals = [getTo(replacements[0].loc)];
        var first, second;
        for (var i = 0, len = replacements.length - 1; i < len; i++) {
          first = replacements[i].loc;
          second = replacements[i + 1].loc;
          originals.push(
            getRange(first.end, second.start)
          );
        }
        originals.push(
          getFrom(
            replacements[replacements.length - 1].loc
          )
        );

        /**
         *  Rejoin the pieces.
         */
        data = '';
        replacements.forEach(function(replacement, index) {
          data += originals[index] + replacement.src;
        });
        data += originals.pop();
      }

      console.log('THE CODEZ:\n"""' + data + '"""');

      self.queue(data);
      self.queue(null);

      function parseNode(node) {
        if (node.loc === undefined) {
          return;
        }

        var nextTickBody = matchProcessNextTick(node);
        if (nextTickBody) {
          // Push a new nextTick onto the stack
          currentNextTick = {
            loc: node.loc,
            bodyLoc: nextTickBody,
            requires: []
          };
          nextTickStack.push(currentNextTick);
          return;
        }

        // Always match a require so that we can raise an error if
        // a dynamic require is called outside of a process.nextTick.
        var dependency = matchRequire(node);
        if (dependency) {
          if (currentNextTick) {
            currentNextTick.requires.push({
              loc: node.loc,
              dep: dependency
            });

            // Check if we've traversed out of the current nextTick
            // call.
            var nloc = node.loc;
            var tloc = currentNextTick.loc;
            if (isBefore(nloc, tloc) || isBefore(tloc, nloc)) {
              // Pop off the stack and save.
              nextTicks.push(nextTickStack.pop());
              currentNextTick = nextTickStack[nextTickStack.length - 1];
            }
          } else if (dependency.type !== 'Literal') {
            self.emit('error', new Error(
              'Requiring a dynamic module outside of a process.nextTick ' +
              'context at: "' + getRange(dependency.loc) + '" in module ' +
              file + '.'
            ));
          }

          return;
        }
      }


      function getTo(loc) {
        return getRange({line: 1, column: 0}, loc.start);
      }

      function getFrom(loc) {
        return getRange(
          loc.end,
          {
            line: lines.length,
            column: lines[lines.length - 1].length
          }
        );
      }

      function getRange(start, end) {
        if (end === undefined) {
          loc = start;
          start = loc.start;
          end = loc.end;
        }
        if (start.line === end.line) {
          return lines[start.line - 1].slice(start.column, end.column);
        }
        var s = lines[start.line - 1].slice(start.column);
        for (var line = start.line; line < end.line - 1; line++) {
          s += '\n' + lines[line];
        }
        return s + '\n' + lines[end.line - 1].slice(0, end.column);
      }
    }
  };
};


function isBefore(loc1, loc2) {
  return (
    (loc1.end.line < loc2.start.line) ||
    (
      (loc1.end.line === loc2.start.line) &&
      (loc1.end.column < loc2.start.column)
    )
  );
}

