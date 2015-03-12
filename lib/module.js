var fs = require('fs');
var async = require('async');
var browserResolve = require('browser-resolve');
var concat = require('concat-stream');
var assign = require('lodash/object/assign');
var invert = require('lodash/object/invert');
var values = require('lodash/object/values');
var difference = require('lodash/array/difference');
var union = require('lodash/array/union');
var DynamicRegExp = require('./dynamic-regexp');
var detective = require('detective');

/**
 *  A Module is a wrapper around a vinyl File that adds dependency
 *  parsing and inspection methods.
 */

function Module(opts) {
  assign(this, {
    path: opts.file.path,
    file: opts.file,
    _dynamicRegexp: DynamicRegExp(opts.dynamic)
  });
}

Module.prototype.loadSource = function(callback) {
  var module = this;
  var file = this.file;

  if (file.isNull()) {
    // Read it from the file.
    fs.readFile(this.path, function(err, source) {
      if (err) handleError(err);
      else {
        file.contents = source;
        handleSource(source.toString('utf8'));
      }
    });
  }
  else {
    // It's a stream. Buffer it all.
    var concatStream = concat({encoding: 'string'}, handleSource);

    concatStream.once('error', handleError);
    file.pipe(concatStream);
  }

  function handleSource(source) {
    module.source = source;
    callback(null, source);
  }

  function handleError(err) {
    err.message = 'Module could not load source from ' + file.path + '. ' + err.message;
    module.source = null;
    callback(err);
  }
};


Module.prototype.parse = function(callback) {
  var module = this;

  this.loadSource(function(err) {
    if (err) callback(err);
    else {
      module.findDeps(callback);
    }
  });
};


Module.prototype.resolveDeps = function(deps, callback) {
  var resolved = {};

  var resolveOpts = {
    filename: this.path,
    modules: this.builtins
  };

  async.each(
    deps,
    function(dep, callback) {
      //console.log('resolving', name, 'with', resolveOpts);
      browserResolve(dep, resolveOpts, function(err, path) {
        if (!err) {
          resolved[dep] = path;
        }
        callback(err);
      });
    },
    function(err) {
      callback(err, resolved);
    }
  );
};

Module.prototype.findDynamicDeps = function(callback) {
  var deps = [];

  this.source = this.source.replace(
    this._dynamicRegexp,
    function(match, dirname, quote, relpath, type) {
      //console.log('dynamic dep:');
      //console.log('  match', match);
      //console.log('  dirname', dirname);
      //console.log('  quote', quote);
      //console.log('  relpath', relpath);
      //console.log('  type', type);
      var dep = (dirname ? '.' : '') + relpath;
      deps.push(dep);
      return quote + dep + quote;
    }
  );

  this.resolveDeps(deps, callback);
};

Module.prototype.findStaticDeps = function(callback) {
  // Static deps might already exist from substack/module-deps
  this.resolveDeps(
    detective(this.source),
    callback
  );
};


Module.prototype.isDynamicDependencyOf = function(parent) {
  return values(parent.deps.dynamic).indexOf(this.path) >= 0;
};


Module.prototype.findDeps = function(callback) {
  var module = this;

  async.parallel(
    {
      static: this.findStaticDeps.bind(this),
      dynamic: this.findDynamicDeps.bind(this)
    },
    function(err, deps) {
      if (!err) {
        module.refs = assign(
          invert(deps.static),
          invert(deps.dynamic)
        );

        module.deps = {
          static: values(deps.static),
          dynamic: values(deps.dynamic)
        };

        module.deps.set = union(
          module.deps.static,
          module.deps.dynamic
        );
      }

      callback(err);
    }
  );
};


Module.prototype.subtractDeps = function(other) {
  var deps = {};

  deps.static = difference(this.deps.static, other.deps.static);
  deps.dynamic = difference(this.deps.dynamic, other.deps.dynamic);
  deps.set = union(deps.static, deps.dynamic);

  return deps;
};


Module.prototype.getSortedDepSet = function() {
  var deps = [];

  Array.prototype.push.apply(deps, values(this._dynamic));
  Array.prototype.push.apply(deps, values(this._static));

  return deps.sort();
};

Module.prototype.depsMatch = function(module) {
  return this.deps.set.join('') === module.deps.set.join('');
};


module.exports = Module;
