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
var forEach = require('lodash/collection/forEach');
var union = require('lodash/array/union');
var last = require('lodash/array/last');
var values = require('lodash/object/values');
var clone = require('lodash/lang/cloneDeep');
var mapValues = require('lodash/object/mapValues');
var assign = require('lodash/object/assign');
var encodeBits = require('./lib/encode-bits');
var insertGlobals = require('insert-module-globals');
var commondir = require('commondir');
var Module = require('./lib/module');
var DynamicRegExp = require('./lib/dynamic-regexp');
var inherits = require('inherits');
var Transform = require('readable-stream').Transform;
//var Transform = require('./lib/transform');
//var JSONStream = require('JSONStream');

var processPath = require.resolve('process/browser.js');

inherits(Dynapack, Transform);

function Dynapack(opts) {
  if (!(this instanceof Dynapack)) {
    return new Dynapack(opts);
  }

  Transform.call(this, {objectMode: true});
  this.modules = {};
  this.entries = {};
  this.entryIds = [];
  this.entryNames = [];
  this.opts = opts;

  return this;

  var self = this;
  var pack = this;
  // LIFO queue for processing added modules.
  var queue = this._queue = [];

  var entries = opts.entries;

  if (!entries) {
    throw new Error('Must supply app entry point(s). Check the "entries" option.');
  }

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
      bundle: true,
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


Dynapack.prototype.resolveDeps = function(moduleId, deps, callback) {
  var resolved = {};

  var resolveOpts = {
    filename: moduleId,
    modules: this.builtins
  };

  async.each(
    deps,
    function(dep, callback) {
      //console.log('resolving', name, 'with', resolveOpts);
      browserResolve(dep, resolveOpts, function(err, id) {
        if (!err) {
          resolved[dep] = id;
        }
        callback(err);
      });
    },
    function(err) {
      callback(err, resolved);
    }
  );
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




Dynapack.prototype.traverse = function(iterator) {
  var visited = [];
  var modules = this.modules;

  forEach(this.entryIds, visitModule);

  function visitModule(id) {
    var module = modules[id];

    if (!module) {
      throw new Error('TODO: What if module does not exist on traverse?');
    }
    else {
      visited.push(module);
      iterator(visited);
    }

    module.deps.set.forEach(function(depId) {
      var dep = modules[depId];

      if (!dep || visited.indexOf(dep) < 0) {
        visitModule(depId);
      }
    });

    visited.pop();
  }
};

/**
 *  Returns javascript for bundle, which includes module sources, and
 *  pulled in roots.
 */

Dynapack.prototype.renderBundle = function(bundle) {
  var pack = this;
  var bundleRoots = pack.getBundleRoots(bundle.id);

  // Re-id bundleRoots
  for (var rootId in bundleRoots) {
    bundleRoots[pack.ids[rootId]] = bundleRoots[rootId];
    delete bundleRoots[rootId];
  }

  if (!pack.bundleHeader) {
    pack.bundleHeader = fs.readFileSync(__dirname + '/browser/bundle.js');
  }

  return (
    pack.bundleHeader + '("' + bundle.id + '", [{' +
    bundle.modules.map(function(moduleId) {
      return (
        '"' + pack.ids[moduleId] + '":' +
        pack.renderModule(moduleId)
      );
    }).join(',') + '},' +
    JSON.stringify(bundleRoots) +
    ']);'
  );
};

/**
 *  @param {String} id Module id; it better be from dynapack.entries sucka.
 */

Dynapack.prototype.renderEntry = function(id, bundles) {
  if (!this._entryHeader) {
    this._entryHeader = fs.readFileSync(__dirname + '/browser/entry.js');
  }

  return (
    this._entryHeader +
    '("' + this.ids[id] + '",' +
    JSON.stringify(bundles) + ',' +
    JSON.stringify({
      prefix: this.opts.prefix || '/'
    }) +
    ');'
  );
};


Dynapack.prototype.scripts = function(entryName) {
  var index = this.entryNames.indexOf(entryName);
  var id = this.entryIds[index];
  var entryBundles = this.requiredBundles(id);
  var prefix = this.opts.prefix || '/';
  var scripts = '<script async src="' + prefix + 'entry.' + index + '.js"></script>';

  entryBundles.forEach(function(bundleId) {
    scripts += '<script async src="' + prefix + bundleId + '.js"></script>';
  });

  return scripts;
};


Dynapack.prototype.bundle = function(opts) {
  var pack = this;
  var roots = {};
  var bundle;
  var bundles;
  var index = 0;

  var baseId = commondir(
    Object.keys(pack.modules)
  );

  pack.traverse(function(visited) {
    var module = last(visited);
    var root;
    var parent;

    if (module.index === undefined) {
      module.index = index++;
    }

    // Find closest ancestor that is a root.
    for (var len = visited.length, i = len - 1; i > 0; i--) {
      parent = visited[i - 1];

      if (visited[i].isDynamicDependencyOf(parent)) {
        root = visited[i];
        break;
      }
    }

    root = root || visited[0];
    module.roots = union([root.id], module.roots);

    if (root.id === module.id) {
      roots[module.id] = 1;
    }
  });

  roots = pack.roots = Object.keys(roots);
  bundles = pack.bundles = {};
  ids = pack.ids = {};

  /**
   *  Form the bundles. Shorten the module ids.
   */

  forEach(pack.modules, function(module) {
    var bundle;
    var bundleId;

    ids[module.id] = (
      pack.opts.debug ?
        module.id.slice(baseId.length + 1) : // remove leading slash.
        module.index.toString()
    );

    bundleId = pack.opts.debug ? ids[module.id] : encodeBits(
      module.roots.map(function(rootId) {
        return roots.indexOf(rootId);
      }),
      32
    );

    bundle = bundles[bundleId] || {id: bundleId, modules: []};
    bundle.modules.push(module.id);

    if (!module.bundled) {
      bundle.render = true;
      module.bundled = true;
    }

    bundles[bundleId] = bundle;
  });

  /**
   *  Push only the bundles that need to be rendered.
   */

  forEach(bundles, function(bundle) {
    if (bundle.render) {
      pack.push({
        id: bundle.id + '.js',
        modules: bundle.modules,
        source: pack.renderBundle(bundle)
      });
    }
  });

  /**
   *  Push only the entries that depend on bundles that have been
   *  rerendered or rendered for the first time.
   */

  pack.entryIds.forEach(function(id, index) {
    var name = pack.entryNames[index];
    var entryBundles = pack.requiredBundles(id);
    var render;

    entryBundles.forEach(function(bundleId) {
      if (bundles[bundleId].render) {
        render = true;
      }
    });

    if (render) {
      pack.push({
        entry: name,
        id: 'entry.' + index + '.js',
        module: id,
        bundles: entryBundles,
        source: pack.renderEntry(id, entryBundles)
      });
    }
  });
};


/**
 *  Inherit configuration options from pack.
 */

Dynapack.prototype.createModule = function(opts) {
  return new Module(
    assign({}, this.opts, opts)
  );
};

Dynapack.prototype.writeEntry = function(name, file) {
  var id;

  if (!file) {
    file = name;
  }

  id = (typeof file === 'string' ? file : file.id);
  name = name || id;
  this.entries[name] = id;
  this.entryNames.push(name);
  this.entryIds.push(id);
  this.write(file);
};

Dynapack.prototype._transform = function(file, encoding, callback) {
  var pack = this;

  if (typeof file === 'string') {
    file = {id: file};
  }

  pack._add(file, function(err) {
    if (!err && pack._writableState.buffer.length === 0) {
      pack.bundle();
    }

    callback(err);
  });
};

Dynapack.prototype._add = function(file, callback) {
  var pack = this;
  var modules = pack.modules;
  var module = pack.createModule(file);
  var old = modules[module.id];
  //console.log('adding', module.id);

  modules[module.id] = module;

  module.parse(function(err) {
    var newDeps = old ? module.subtractDeps(old) : module.deps;
    var removedDeps = old && old.subtractDeps(module);

    async.each(
      newDeps.set,
      function(depId, done) {
        pack._add({id: depId}, done);
      },
      callback
    );

    if (removedDeps && removedDeps.set.length > 0) {
      pack._dirty = true;
    }
  });
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
      self.opts.bundle ?
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
      self.opts.bundle ?
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
  var pack = this;
  var required = [];

  if (pack.roots.indexOf(rootModuleId) < 0) {
    throw new Error(rootModuleId, 'is not in the roots list.');
  }

  forEach(pack.bundles, function(bundle) {
    // Grab random module in bundle, all modules in bundle will have
    // same 'roots' property. That's what defines a bundle. :|
    var module = pack.modules[bundle.modules[0]];

    if (module.roots.indexOf(rootModuleId) >= 0) {
      required.push(bundle.id);
    }
  });

  return required;
};


Dynapack.prototype.renderModule = function(id) {
  var pack = this;
  var module = pack.modules[id];
  var source = module.source;

  module.deps.set.forEach(function(depId) {
    source = replaceAllString(
      source,
      module.refs[depId],
      pack.ids[depId]
    );
  });

  return (
    'function(module, exports, require) {' +
      source +
    '}'
  );
};


/**
 *  A bundle brings with it a set of dynamic deps (roots).  The client must be
 *  informed of the new bundles these dynamic deps would introduce if
 *  asynchronously required.  'roots' is a mapping from root module id to an
 *  array of bundles.
 *
 *  @param {String} bundleId The array of module ids.
 *  @param {Array<String>} bundle The array of module ids.
 */

Dynapack.prototype.getBundleRoots = function(bundleId) {
  var pack = this;
  var roots = {};
  var bundle = pack.bundles[bundleId];

  bundle.modules.forEach(function(id) {
    var module = pack.modules[id];

    module.deps.dynamic.forEach(function(depId) {
      roots[depId] = pack.requiredBundles(depId);
    });
  });

  return roots;
};



Dynapack.prototype.createGraph = function() {
  var self = this;
  var prefix = self.opts.prefix;

  var graph = {
    prefix: prefix,
    entries: {},
    bundles: {},
    modules: {}
  };

  _.each(self.modules, function(module, id) {
    graph.modules[id] = {
      roots: module.roots.map(function(rootIndex) {
        return self.roots[rootIndex];
      }),
      deps: {
        dynamic: clone(module.dynamic),
        static: clone(module.deps)
      }
    };
  });
  _.each(self.bundles, function(modules, bundleId) {
    // Form union of all other bundles brought in by given bundle.
    //console.log(JSON.stringify(self.getBundleRoots(bundleId, modules), null, 2));
    graph.bundles[bundleId + '.js'] = mapValues(
      self.getBundleRoots(bundleId, modules),
      function(rootBundles) {
        return rootBundles.map(
          function(bundleId) {return bundleId + '.js'}
        );
      }
    );
  });

  self.entries.forEach(function(entry, index) {
    var entryId = self.entryIds[index];
    var entryBundles = self.requiredBundles(entry);
    var entryBasename = 'entry.' + index + '.js';

    graph.entries[entryId] = [entryBasename].concat(
      entryBundles.map(function(bundleId) {return bundleId + '.js'})
    );
  });

  return graph;
};

/**
 *  Write bundles to files.
 */
Dynapack.prototype.writeBundles = function(done) {
  var self = this;
  var prefix = self.opts.prefix;
  // Mapping from original entry path string to array of
  // output-dir-relative js files that should be included in the entry
  // point's page.
  var entryInfo = {};
  var output = self.opts.output;
  var files = {};

  // Before reId'ing and screwing all the full paths up, save
  // module and bundle graph info.
  var graph = self.createGraph();

  //console.log('graph.modules', JSON.stringify(graph.modules, null, 2));

  self.reId();

  try {
    fs.mkdirSync(output);
  } catch (e) {
    if (!/EEXIST/.test(e.message)) {
      throw e;
    }
  }

  var entryHeader = fs.readFileSync(__dirname + '/lib/entry.js');

  if (!self.opts.bundle) {
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
    //if (!self.opts.bundle) {
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
      JSON.stringify(entryBundles) + ',' +
      JSON.stringify({
        prefix: prefix
      }) +
      ');'
    );
  });

  _.each(self.bundles, function(modules, bundleId) {
    // Form union of all other bundles brought in by given bundle.
    //console.log(JSON.stringify(self.getBundleRoots(bundleId, modules), null, 2));
    var bundle = self.renderBundle(bundleId, modules);
    var name = path.join(output, bundleId + '.js');
    files[name] = bundle;

    //for (var i = 0; i < entriesBundles.length; i++) {
    //  if (entriesBundles[i].indexOf(bundleId) > -1) {
    //    entriesBundles[i] += bundle;
    //  }
    //}
  });

  // Write the graph.
  fs.writeFileSync(
    path.join(output, 'graph.json'),
    JSON.stringify(graph)
  );

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
