var mdeps = require('module-deps');
var builtins = require('browserify/lib/builtins');
var browserResolve = require('browser-resolve');
var through2 = require('through2');
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var extend = require('xtend');
var async = require('async');
var _ = require('underscore');
var encodeBits = require('./lib/encode-bits');
var insertGlobals = require('insert-module-globals');
var commondir = require('commondir');
//var Transform = require('./lib/transform');
//var JSONStream = require('JSONStream');

var processPath = require.resolve('process/browser.js');

function Dynapack(entries, opts) {
  if (!(this instanceof Dynapack)) {
    return new Dynapack(entries, opts);
  }

  var self = this;

  // Normalize entries to array and set self.entryIds.

  if ('string' == typeof entries) {
    self.entryIds = [entries];
    entries = [entries];
  }
  else if (Array.isArray(entries)) {
    self.entryIds = [].concat(entries);
  }
  else {
    self.entryIds = Object.keys(entries);
    entries = self.entryIds.map(function(entryId) {
      return entries[entryId];
    });
  }

  // Entries should be absolute filepaths.

  entries.forEach(function(entry) {
    if (entry[0] !== '/') {
      throw new Error('Entry modules must be specified by absolute paths');
    }
  });

  self.entries = entries;

  self.opts = extend(
    {
      modules: [],
      dynamicLabels: 'js',
      builtins: builtins,
      output: './bundles',
      obfuscate: false,
      globalTransforms: [],
      prefix: '/' // needs trailing slash!
    },
    opts
  );

  if (self.opts.prefix[self.opts.prefix.length - 1] !== '/') {
    self.opts.prefix += '/';
  }

  self.builtins = self.opts.builtins;

  var labels = self.opts.dynamicLabels;
  labels = Array.isArray(labels) ? labels : [labels];

  self.dynRegexp = new RegExp(
    '(__dirname\\s+\\+\\s+)?' +
    '([\'"])([^\'"]+)\\2\\s*[,;]?\\s*/\\*\\s*(' + 
    labels.join('|') +
    ')\\s*\\*/', 'g'
  );

  self.globalTransforms = self.opts.globalTransforms.concat(
    function(file) {
      return insertGlobals(file, {
        vars: {
          process: function() {
            return 'require(' + JSON.stringify(processPath) + ')';
          }
        }
        //basedir: path.dirname(entry)
      });
    }
  );

  //self.transform = Transform({
  //  moduleLabel: labels[0]
  //});

  self.modules = {};

  // A mapping from bundle id to a subset of modules. The bundle id is formed
  // from the set of entry points that touch the subset of modules. That is,
  // the bundle module subset is the intersection of all static
  // dependency trees identified by the group of entry points encoded into
  // the bundle id.
  self.bundles = {};

  // This will include the given entry points. Roots are entry points and
  // dynamic modules. They define static dependency trees, the union of which
  // cover all modules.
  self.roots = [];

  // Every module that is a dynamic dependency is given a unique integer
  // index. This is so we can id our bundles.
  self.dynamicModuleCount = 0;
  self.moduleCount = 0;
}

Dynapack.prototype.run = function(callback) {
  var self = this;
  async.each(
    self.entries,
    self.processRoot.bind(self),
    function(err) {
      if (callback) callback(err, self.bundles);
      else if (err) throw err;
    }
  );
};


Dynapack.prototype.bundleId = function(module) {
  //console.log('bundle id for', module);
  return encodeBits(module.roots, 32);
};


/**
 *  Given a module from a call to module-deps, parse the source for
 *  dynamic dependencies. Add a 'dynamic' property to the module object
 *  containing ...
 *
 *  {
 *    dynamic: {
 *      '/user/name/project/node_modules/blah/index.js': 'blah'
 *    }
 *  }
 *
 *  The module source is modified so that dynamic deps that look like
 *  e.g.
 *
 *    var blah = 'blah'/^module^/;
 *
 *  (where carets are actually stars in the above) become
 *
 *    var blah = '/user/name/project/node_modules/blah/index.js';
 *
 */
Dynapack.prototype.processModule = function(module, rootIndex, callback) {
  var id = module.id;

  if (id in this.modules) {
    // Module has been processed before with a different entry point.
    module = this.modules[id];

    // Verify.
    var err;
    if (module.roots.indexOf(rootIndex) > -1) {
      err = new Error(
        'Root ' + rootIndex + ' already exists in module ' + id
      );
      return;
    }

    // Must move module to another bundle. Remove from current bundle.
    var bundleId = this.bundleId(module);
    var oldBundle = this.bundles[bundleId];
    delete oldBundle[id];

    if (Object.keys(oldBundle).length == 0) {
      delete this.bundles[bundleId];
    }

    // Add new root to existing module.
    module.roots.push(rootIndex);

    process.nextTick(callback.bind(null, err, module));
  } else {
    // New module! Initialize.
    this.modules[id] = module;
    module.roots = [rootIndex];
    module.index = this.moduleCount++;

    // Parse source for dynamic dependencies/new entry points.
    this.findDynamic(module, callback);
  }
  //console.log('module', id, 'roots:', module.roots);

  // Put the module in a bundle.
  var bundleId = this.bundleId(module);
  var bundle;
  if (bundleId in this.bundles) {
    bundle = this.bundles[bundleId];
  } else {
    bundle = this.bundles[bundleId] = {};
  }
  bundle[id] = module;
};

/**
 *  Find all dynamic dependencies in module source and add to 'dynamic'
 *  property on module.
 */

Dynapack.prototype.findDynamic = function(module, callback) {
  var match;
  var modulePaths = [];

  module.source = module.source.replace(
    this.dynRegexp,
    function(match, dirname, quote, relpath, type) {
      //console.log('dynamic dep:');
      //console.log('  match', match);
      //console.log('  dirname', dirname);
      //console.log('  quote', quote);
      //console.log('  relpath', relpath);
      //console.log('  type', type);
      var modulePath = (dirname ? '.' : '') + relpath;
      modulePaths.push(modulePath);
      return quote + modulePath + quote;
    }
  );

  var resolveOpts = {
    filename: module.id,
    modules: this.builtins
  };

  // Maps relative module paths to absolute module paths (or 'id's as
  // we/browserify call them).
  module.dynamic = {};

  async.each(
    modulePaths,
    function(modulePath, callback) {
      //console.log('resolving', name, 'with', resolveOpts);
      browserResolve(modulePath, resolveOpts, function(err, id) {
        if (err) {
          callback(err);
          return;
        }
        module.dynamic[modulePath] = id;
        callback();
      });
    },
    function(err) {
      //if (!err) {
      //  matches.forEach(function(match) {
      //    var quote = match[1];
      //    module.source = module.source.replace(match[0], function() {
      //      return quote + match.id + quote;
      //    });
      //  });
      //}
      callback(err, module);
    }
  );
};

/**
 *  Return an array of dynamic dependency ids that are referenced
 *  but not contained in the given group of modules.
 *
 *  @param {Object<String, Module>} have The modules the "client" has.
 *
 */
Dynapack.prototype._dynDeps = function(have) {
  var self = this;
  var deps = {};
  var moduleId;
  var depId;
  for (moduleId in have) {
    module = have[moduleId];
    for (depId in module.dynamic) {
      if (!(depId in have)) {
        deps[depId] = true;
      }
    }
  }
  return Object.keys(deps);
};

/**
 *  Recursively fetch all dependencies, static and dynamic.
 *
 *  @param {Function} callback
 */
Dynapack.prototype.processRoot = function(root, callback) {
  var self = this;

  // Add root point to set of followed.
  // self.roots[root] = true;
  var rootIndex = self.roots.push(root) - 1;

  // The set of new roots parsed from this root's
  // bundle.
  var newRoots = [];

  var mdepOpts = {
    modules: self.builtins,
    //transform: self.transform
    globalTransform: self.globalTransforms
  };

  var depStream = mdeps(root, mdepOpts).pipe(through2.obj(handle));
  depStream.resume();
  depStream.on('end', function() {
    // Pack up the bundle asynchronously.

    // Recurse.
    async.each(
      newRoots,
      self.processRoot.bind(self),
      callback
    );
  });

  function handle(module, encoding, callback) {
    self.processModule(module, rootIndex, function(err) {
      // After processing, scan the dynamic dependencies found in the
      // module
      var id;
      var relId;
      for (relId in module.dynamic) {
        id = module.dynamic[relId];
        if (self.roots.indexOf(id) < 0) {
          newRoots.push(id);
        }
      }
      callback();
    });
  }
};


function replaceAll(src, remove, insert) {
  var re = new RegExp(
    remove.replace(/\\/g, '\\\\')
      .replace(/\./g, '\\.')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]'),
    'g'
  );
  return src.replace(re, insert);
}

function replaceAllString(src, remove, insert) {
  insert = '"' + insert + '"';
  src = replaceAll(src, '\'' + remove + '\'', insert);
  src = replaceAll(src, '"' + remove + '"', insert);
  return src;
}

/**
 *  Change all ids from full path names to integer strings. This also changes
 *  the module string in the source code of each module. Serious obfuscation here;
 *  errors after this point make debugging difficult.
 */
Dynapack.prototype.reId = function() {
  var self = this;
  var base = commondir(Object.keys(self.modules));
  //console.log('base directory for ids', base);

  // First change dependencies.
  _.each(self.modules, function(module, id) {
    var oldDeps = module.deps;
    module.deps = [];
    _.each(oldDeps, function(depId, name) {
      var newId = reIdModule(depId);
      // Replace in module source.
      module.source = replaceAllString(module.source, name, newId);
      module.deps.push(newId);
    });
    var oldDynamic = module.dynamic;
    module.dynamic = [];
    _.each(oldDynamic, function(depId, name) {
      var newId = reIdModule(depId);
      // Replace in module source.
      module.source = replaceAllString(module.source, name, newId);
      module.dynamic.push(newId);
    });
  });

  // Then change entries.
  self.entries = self.entries.map(reIdModule);
  self.roots = self.roots.map(reIdModule);

  // Then change modules themselves.
  var oldModules = self.modules;
  self.modules = {};
  _.each(oldModules, function(module, oldId) {
    var newId = (
      self.opts.obfuscate ?
      module.index.toString() :
      oldId.slice(base.length)
    );
    module.path = oldId;
    module.id = newId;
    self.modules[newId] = module;
  });

  // Now bundles.
  var oldBundles = self.bundles;
  self.bundles = {};
  _.each(oldBundles, function(modules, bundleId) {
    var newModules = {};
    _.each(modules, function(module, oldId) {
      newModules[module.id] = module;
    });
    self.bundles[bundleId] = newModules;
  });

  // Now dance.


  function reIdModule(id) {
    return (
      self.opts.obfuscate ?
      self.modules[id].index.toString() :
      id.slice(base.length)
    );
  }
};

/**
 *  When a module is required asynchronously, all of the bundles on
 *  which it depends (statically) must be downloaded immediately by
 *  the client. This function
 *  finds those bundles given a root module. We could gather this
 *  information on the fly as modules are read from module-deps, but
 *  oh well.
 */

Dynapack.prototype.requiredBundles = function(rootModuleId) {
  var self = this;
  var rootIndex = self.roots.indexOf(rootModuleId);
  if (rootIndex === -1) {
    throw new Error(rootModuleId, 'is not in the roots list.');
  }
  // Loop through all bundles.
  var required = [];
  _.each(self.bundles, function(modules, bundleId) {
    // Grab random module in bundle, all modules in bundle will have
    // same 'roots' property. That's what defines a bundle. :|
    var module = modules[Object.keys(modules)[0]];
    if (module.roots.indexOf(rootIndex) !== -1) {
      required.push(bundleId);
    }
  });
  return required;
};


Dynapack.prototype.wrapModule = function(module) {
      // Should offer some transform API here like browserify.
  return (
    'function(module, exports, require) {' +
      module.source +
    '}'
  );
};


/**
 */
Dynapack.prototype.createBundle = function(bundleId, modules) {
  var self = this;

  // A bundle brings with it a new set of dynamic deps (roots), not defined
  // in any other bundle. The client must be informed of the new bundles
  // this introduces. 'roots' is a mapping from root module id
  // to an array of bundles.
  var roots = {};
  _.each(modules, function(module) {
    _.each(module.dynamic, function(id) {
      roots[id] = self.requiredBundles(id);
    });
  });

  if (!self.bundleHeader) {
    self.bundleHeader = fs.readFileSync(__dirname + '/lib/bundle.js');
  }

  return (
    self.bundleHeader + '("' + bundleId + '", [{' +
      Object.keys(modules).map(function(moduleId) {
        return (
          '"' + moduleId + '":' +
          self.wrapModule(modules[moduleId])
        );
      }).join(',') + '},' +
    JSON.stringify(roots) +
    ']);'
  );
};


/**
 *  Write bundles to files.
 */
Dynapack.prototype.write = function(done) {
  var self = this;

  self.reId();

  var files = {};

  var output = self.opts.output;
  try {
    fs.mkdirSync(output);
  } catch (e) {
    if (!/EEXIST/.test(e.message)) {
      throw e;
    }
  }

  var entryHeader = fs.readFileSync(__dirname + '/lib/entry.js');

  // Mapping from original entry path string to array of
  // output-dir-relative js files that should be included in the entry
  // point's page.
  var entryInfo = {};

  var prefix = self.opts.prefix;

  if (!self.opts.obfuscate) {
    // Undo our bundling work.
    self.bundles = {};
    _.each(self.modules, function(module, id) {
      var bundleId = id.replace(/\.js$/, '').replace(/^\//, '');
      var bundle = self.bundles[bundleId] = {};
      bundle[id] = module;
    });
  }

  //var entriesBundles = [];
  //var entriesBundles = self.entries.map(function(entry) {
  self.entries.forEach(function(entry, index) {
    var entryBundles = self.requiredBundles(entry);
    //entriesBundles.push(entryBundles);
    //if (!self.opts.obfuscate) {
    //  var entryModuleIds = [];
    //  entryBundles.forEach(function(bundleId) {
    //    for (var moduleId in self.bundles[bundleId]) {
    //      entryModuleIds.push(moduleId.replace(/^\//, ''));
    //    }
    //  });
    //  entryBundles = entryModuleIds;
    //}

    var entryId = self.entryIds[index];
    var entryFiles = entryInfo[entryId] = [];

    var entryBasename = 'entry.' + index + '.js';
    entryFiles.push(prefix + entryBasename);

    entryBundles.forEach(function(bundleId) {
      entryFiles.push(prefix + bundleId + '.js');
    });

    var name = path.join(output, entryBasename);
    files[name] = (
      entryHeader +
      '("' + entry + '",' +
      JSON.stringify(entryBundles) + ',"' +
      prefix + '");'
    );
  });

  _.each(self.bundles, function(modules, bundleId) {
    var bundle = self.createBundle(bundleId, modules);
    var name = path.join(output, bundleId + '.js');
    files[name] = bundle;

    //for (var i = 0; i < entriesBundles.length; i++) {
    //  if (entriesBundles[i].indexOf(bundleId) > -1) {
    //    entriesBundles[i] += bundle;
    //  }
    //}
  });

  async.each(
    Object.keys(files),
    function(file, written) {
      try {
        mkdirp.sync(path.dirname(file));
        fs.writeFile(file, files[file], written);
      }
      catch (err) {
        written(err);
      }
    },
    function(err) {
      if (done) done(err, entryInfo);
      else if (err) throw err;
    }
  );
};

module.exports = Dynapack;
