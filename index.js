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
var sum = require('lodash/collection/sum');
var union = require('lodash/array/union');
var last = require('lodash/array/last');
var pull = require('lodash/array/pull');
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
var Writable = require('readable-stream').Writable;
var Readable = require('readable-stream').Readable;
//var Transform = require('./lib/transform');
//var JSONStream = require('JSONStream');

var processPath = require.resolve('process/browser.js');

inherits(Dynapack, Transform);



function Dynapack(opts) {
  if (!(this instanceof Dynapack)) {
    return new Dynapack(opts);
  }

  Transform.call(this, {objectMode: true});

  /**
   *  A mapping between module id and loaded and parsed modules. Once in this
   *  object a module is ready to be bundled (but may be replaced before bundling
   *  if the same module is visited in another dependency tree.
   */

  this.modules = {};

  /**
   *  For reusing module sources. These are the modification times for loaded
   *  modules.
   */

  this._mtimes = {};

  /**
   *  An array of paths to entry modules. Entries are special because they can be
   *  any module in the dependency graph. The entryNames are customized names
   *  given by the user.
   */

  this.entryIds = [];
  this.entryNames = [];

  this.opts = opts || {
    builtins: builtins
  };

  /**
   *  When a new entry is given to dynapack (or an old one is replaced), we need
   *  to know which modules come from its dependency tree. When the entire tree
   *  has been discovered, processing of the entry is considered finished.
   *
   *  We need to following dependencies on their way through
   *  the stream from dep id to transformed source. Every time we
   *  encounter a dependency, tag it in a processing hash. When
   *  the hash is empty, we are done processing dependencies.
   */

  this._loading = {};

  this._initDeps();
  this._initMods();

  /**
   *  Dynapack pushes deps to deps through stream, which pushes filepaths
   *  to the default loader, which sends sources to dynapack.
   */

  this._deps.pipe(this._mods);

  return this;

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


Dynapack.prototype.bundleId = function(module) {
  //console.log('bundle id for', module);
  return encodeBits(module.roots, 32);
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
  var scripts = '<script async src="' + prefix + entryName + '.entry.js"></script>';

  entryBundles.forEach(function(bundleId) {
    scripts += '<script async src="' + prefix + bundleId + '"></script>';
  });

  return scripts;
};


Dynapack.prototype.bundle = function(opts) {
  var pack = this;
  var roots = {};
  var bundle;
  var bundles;
  var index = 0;

  // Graph metadata all in one place.
  var graph = {
    modules: {}, // maps source ids to input ids (i.e. filenames)
    bundles: {}, // maps bundle ids to module id arrays.
    entries: {}  // maps entry ids to bundle id arrays.
  };

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

    graph.modules[ids[module.id]] = module.id;

    // Push module into a bundle based on its roots.

    bundleId = (
      pack.opts.debug ?
      ids[module.id] :
      (
        encodeBits(
          module.roots.map(function(rootId) {
            return roots.indexOf(rootId);
          }),
          32
        ) +
        '.js'
      )
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
    graph.bundles[bundle.id] = bundle.modules.concat();

    if (bundle.render) {
      pack.push({
        id: bundle.id,
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
    var filename = name + '.entry.js';
    var render;

    graph.entries[name] = [filename].concat(entryBundles);

    entryBundles.forEach(function(bundleId) {
      if (bundles[bundleId].render) {
        render = true;
      }
    });

    if (render) {
      pack.push({
        entry: name,
        id: filename,
        module: id,
        bundles: entryBundles,
        source: pack.renderEntry(id, entryBundles)
      });
    }
  });

  pack.emit('bundled', graph);
};

/**
 *  Module has been transformed and saved to the modules hash; we are
 *  done with it until the next modification.
 */

Dynapack.prototype._finalize = function(id) {
  this._loading[id]--;

  if (sum(this._loading) === 0) {
    this.bundle();
  }
};


/**
 *  Inherit configuration options from pack.
 */

Dynapack.prototype.createModule = function(opts) {
  return new Module(
    assign({}, this.opts, opts)
  );
};

/**
 *  The module stream accepts finalized module sources.
 */

Dynapack.prototype.mods = function() {
  return this._mods;
};


Dynapack.prototype._initMods = function() {
  var pack = this;
  var mods = pack._mods = new Writable({objectMode: true});

  mods._write = function(module, encoding, callback) {
    //console.log('received module', module);

    if (typeof module !== 'object') {
      return pack.emit(
        'error',
        new Error(
          'Mods stream accepts only module objects. A module object has ' +
            'the attributes: "id" and "source", which should have been ' +
            'provided on the dependency object emitted from the deps stream'
        )
      );
    }

    module = pack.createModule(module);

    var old = pack.modules[module.id];

    pack.modules[module.id] = module;

    module.parse(function(err) {
      if (!err) {
        var newDeps = old ? module.subtractDeps(old) : module.deps;
        var removedDeps = old && old.subtractDeps(module);

        newDeps.set.forEach(function(depId) {
          pack._deps.write({id: depId});
        });

        if (removedDeps && removedDeps.set.length > 0) {
          pack.clean();
        }

        //console.log('finalize from mods on', module.id);
        pack._finalize(module.id);
      }

      callback(err);
    });
  };

  mods.on(
    'error',
    pack.emit.bind(pack, 'error')
  );
};

/**
 *  The deps stream is a ReadableStream that emits full file
 *  paths to modules that will be included in the pack. Load
 *  these modules and send them back in to Dynapack stream with
 *  their sources attached.
 */

Dynapack.prototype.deps = function() {
  this._deps.unpipe(this._mods);
  return this._deps;
};

/**
 *  @typedef {Object} Dep
 *  @property {String} id
 *  @property {String} source
 */

/**
 *  Create the transform stream that loads dependencies and sends them
 *  to the dynapack mods stream (default) or to a custom transform stream.
 *  The deps stream takes in a {@link Dep} object
 *
 */

Dynapack.prototype._initDeps = function() {
  var pack = this;
  var deps = pack._deps = new Transform({objectMode: true});

  deps.write = function(dep, encoding, callback) {
    var id = dep.id;
    //console.log('dep', dep);

    if (id in pack._loading) {
      pack._loading[id]++;
    }
    else {
      pack._loading[id] = 1;
    }

    Transform.prototype.write.call(this, dep, encoding, callback);
  };

  deps._transform = function(dep, encoding, callback) {
    var id = dep.id;

    if (dep.source) {
      // Always replace previous version since source is provided.
      return push(dep.source);
    }

    fs.stat(id, function(err, stats) {
      if (err) callback(err);
      else {
        var cachedMtime = pack._mtimes[id] || 0;
        var mtime = pack._mtimes[id] = stats.mtime.getTime();

        if (mtime > cachedMtime) {
          load();
        }
        else {
          pack._finalize(id);
          callback(); // Use the cache, don't push anything to mods.
        }
      }
    });

    function load() {
      fs.readFile(id, {encoding: 'utf8'}, function(err, source) {
        if (err) {
          pack._loading[id]--;
          callback(err);
        }
        else {
          //console.log('loaded', id);
          push(source);
        }
      });
    }

    function push(source) {
      deps.push({
        id: id,
        source: source
      });

      callback();
    }
  };

  deps.once(
    'error',
    pack.emit.bind(pack, 'error')
  );
};



/**
 *  @typedef {Object} File
 *  @property {String} id The full path to the file.
 *  @property {String|ReadableStream} source The file source.
 */

/**
 *  Send in entry modules to dynapack. The dependency graph will be
 *  discovered, and each new dependency (and its source) will be emitted
 *  on the deps stream.
 *
 */

Dynapack.prototype._transform = function(entry, encoding, callback) {
  //console.log('received entry', entry);
  if (typeof entry === 'string') {
    entry = {id: entry};
  }

  if (this.entryIds.indexOf(entry.id) < 0) {
    this.entryNames.push(entry.name || path.basename(entry.id).replace(/\.js$/, ''));
    this.entryIds.push(entry.id);
  }

  this._deps.write({
    id: entry.id,
    source: entry.source
  });

  callback();
};


Dynapack.prototype._flush = function(callback) {
  var pack = this;

  pack.on('bundled', maybeFlush);
  maybeFlush();

  function maybeFlush() {
    if (sum(pack._loading) === 0) {
      pack.removeListener('bundled', maybeFlush);
      callback();
    }
  }
};

Dynapack.prototype.watch = function(id) {
  var pack = this;

  fs.watch(id, function(event, filename) {

  });
};


Dynapack.prototype.clean = function() {
  var modules = this.modules;
  var clean = Object.keys(modules);

  pack.traverse(function(visited) {
    var module = last(visited);

    pull(clean, module.id);
  });

  clean.forEach(function(id) {
    delete modules[id];
  });
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
