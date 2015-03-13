var builtins = require('browserify/lib/builtins');
var fs = require('fs');
var path = require('path');
var forEach = require('lodash/collection/forEach');
var sum = require('lodash/collection/sum');
var reduce = require('lodash/collection/reduce');
var union = require('lodash/array/union');
var last = require('lodash/array/last');
var pull = require('lodash/array/pull');
var assign = require('lodash/object/assign');
var encodeBits = require('./lib/encode-bits');
var commondir = require('commondir');
var Module = require('./lib/module');
var inherits = require('inherits');
var Transform = require('readable-stream').Transform;
var Writable = require('readable-stream').Writable;
var Readable = require('readable-stream').Readable;
var File = require('vinyl');

inherits(Dynapack, Transform);


function Dynapack(opts) {
  if (!(this instanceof Dynapack)) {
    return new Dynapack(opts);
  }

  Transform.call(this, {objectMode: true});

  /**
   *  A mapping between module path and loaded and parsed modules. Once in this
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
   *  any module in the dependency graph. The entryNames are derived from the entry
   *  path.
   */

  this.entryPaths = [];
  this.entryNames = [];

  this.opts = assign(
    {
      builtins: builtins
    },
    opts
  );

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
}


Dynapack.prototype.traverse = function(iterator) {
  var visited = [];
  var modules = this.modules;

  forEach(this.entryPaths, visitModule);

  function visitModule(id) {
    var module = modules[id];

    if (!module) {
      throw new Error('TODO: What if module does not exist on traverse?');
    }
    else {
      visited.push(module);
      iterator(visited);
    }

    module.deps.set.forEach(function(depPath) {
      var dep = modules[depPath];

      if (!dep || visited.indexOf(dep) < 0) {
        visitModule(depPath);
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
  for (var rootPath in bundleRoots) {
    bundleRoots[pack.ids[rootPath]] = bundleRoots[rootPath];
    delete bundleRoots[rootPath];
  }

  if (!pack.bundleHeader) {
    pack.bundleHeader = fs.readFileSync(__dirname + '/browser/bundle.js');
  }

  return (
    pack.bundleHeader + '("' + bundle.id + '", [{' +
    bundle.modules.map(function(path) {
      return (
        '"' + pack.ids[path] + '":' +
        pack.renderModule(path)
      );
    }).join(',') + '},' +
    JSON.stringify(bundleRoots) +
    ']);'
  );
};

/**
 *  @param {String} modPath Module id; it better be from dynapack.entries sucka.
 */

Dynapack.prototype.renderEntry = function(entryPath, bundles) {
  if (!this._entryHeader) {
    this._entryHeader = fs.readFileSync(__dirname + '/browser/entry.min.js');
  }

  return (
    this._entryHeader +
    '("' + this.ids[entryPath] + '",' +
    JSON.stringify(bundles) + ',' +
    JSON.stringify({
      prefix: this.opts.prefix || '/'
    }) +
    ');'
  );
};


Dynapack.prototype.entryScripts = function(entryName) {
  var index = this.entryNames.indexOf(entryName);
  var entryPath = this.entryPaths[index];
  var entryBundles = this.requiredBundles(entryPath);
  var prefix = this.opts.prefix || '/';
  var scripts = '';
  //var scripts = '<script async src="' + prefix + entryName + '.entry.js"></script>';

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

  var basePath = commondir(
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
    module.roots = union([root.path], module.roots);

    if (root.path === module.path) {
      roots[module.path] = 1;
    }
  });

  roots = pack.roots = Object.keys(roots).sort();
  bundles = pack.bundles = {};
  ids = pack.ids = {};

  /**
   *  Form the bundles. Shorten the module ids.
   */

  forEach(pack.modules, function(module) {
    var bundle;
    var bundleId;

    ids[module.path] = (
      pack.opts.debug ?
        module.path.slice(basePath.length + 1) : // remove leading slash.
        module.index.toString()
    );

    graph.modules[ids[module.path]] = module.path;

    // Push module into a bundle based on its roots.

    bundleId = (
      pack.opts.debug ?
      ids[module.path] :
      (
        encodeBits(
          module.roots.map(function(rootPath) {
            return roots.indexOf(rootPath);
          }),
          32
        ) +
        '.js'
      )
    );

    bundle = bundles[bundleId] || {id: bundleId, modules: []};
    bundle.modules.push(module.path);

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
    bundle.modules.sort();
    graph.bundles[bundle.id] = bundle.modules.concat();

    if (bundle.render) {
      pack.push(
        new File({
          path: path.join(process.cwd(), bundle.id),
          base: process.cwd(),
          modules: bundle.modules,
          contents: new Buffer(
            pack.renderBundle(bundle)
          )
        })
      );
    }
  });

  /**
   *  Push only the entries that depend on bundles that have been
   *  rerendered or rendered for the first time.
   */

  //pack.entryPaths.forEach(function(entryPath, index) {
  //  var name = pack.entryNames[index];
  //  var entryBundles = pack.requiredBundles(entryPath);
  //  var filename = name + '.entry.js';
  //  var render;

  //  graph.entries[name] = [filename].concat(entryBundles);

  //  entryBundles.forEach(function(bundleId) {
  //    if (bundles[bundleId].render) {
  //      render = true;
  //    }
  //  });

  //  if (render) {
  //    pack.push(
  //      new File({
  //        path: path.join(process.cwd(), filename),
  //        base: process.cwd(),
  //        contents: new Buffer(
  //          pack.renderEntry(entryPath, entryBundles)
  //        )
  //      })
  //    );
  //  }
  //});

  pack.emit('bundled', graph);
};

/**
 *  Return a stream that receives a mapping between dynapack-generated
 *  bundle ids and custom ids (such as those generated by revving) and
 *  returns the string of html that should be included in each entry
 *  page.
 */

Dynapack.prototype.scripts = function() {
  var pack = this;
  var stream = new Transform({objectMode: true});

  stream._transform = function(file, enc, callback) {
    this._mapping = file.contents ?
      JSON.parse(file.contents.toString()) :
      file;

    callback();
  };

  stream._flush = function(callback) {
    var aliases = '';
    var scripts = {};
    var mapping = this._mapping;

    if (mapping) {
      // Generate the inline script that sets dynapackAliases.
      aliases = 'window["dynapackAliases"]=' + JSON.stringify(mapping) + ';';
    }

    pack.entryNames.forEach(function(entryName, index) {
      var entryPath = pack.entryPaths[index];
      var entryBundles = pack.requiredBundles(entryPath);
      var html = '<script>' + aliases + pack.renderEntry(entryPath, entryBundles) + '</script>';

      //var html = scripts[entryName] = aliases + reduce(
      html += reduce(
        mapping,
        iterator,
        pack.entryScripts(entryName)
      );

      stream.push(
        new File({
          path: path.join(process.cwd(), entryName + '.html'),
          contents: new Buffer(html)
        })
      );

      function iterator(html, newBundleId, bundleId) {
        return html.replace('"' + bundleId + '"', '"' + newBundleId + '"');
      }
    });

    //this.push(
    //  new File({
    //    path: path.join(process.cwd(), 'dynapack-scripts.json'),
    //    contents: new Buffer(
    //      JSON.stringify(scripts)
    //    )
    //  })
    //);

    callback();
  };

  return stream;
};

/**
 *  Module has been transformed and saved to the modules hash; we are
 *  done with it until the next modification.
 */

Dynapack.prototype._finalize = function(path) {
  this._loading[path]--;

  if (sum(this._loading) === 0) {
    this.bundle();
  }
};


/**
 *  Inherit configuration options from pack.
 */

Dynapack.prototype.createModule = function(file) {
  return new Module(
    assign({file: file}, this.opts)
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
    var old;
    //console.log('received module', module);

    if (typeof module.isNull !== 'function') {
      return pack.emit(
        'error',
        new Error(
          'Mods stream accepts only vinyl File objects.'
        )
      );
    }

    module = pack.createModule(module);
    old = pack.modules[module.path];
    pack.modules[module.path] = module;

    module.parse(function(err) {
      if (!err) {
        var newDeps = old ? module.subtractDeps(old) : module.deps;
        var removedDeps = old && old.subtractDeps(module);

        newDeps.set.forEach(function(depPath) {
          pack._deps.write(
            new File({path: depPath})
          );
        });

        if (removedDeps && removedDeps.set.length > 0) {
          pack.clean();
        }

        //console.log('finalize from mods on', module.path);
        pack._finalize(module.path);
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
 *  Create the transform stream that loads dependencies and sends them
 *  to the dynapack mods stream (default) or to a custom transform stream.
 *  The deps stream takes in a vinyl File.
 *
 */

Dynapack.prototype._initDeps = function() {
  var pack = this;
  var deps = pack._deps = new Transform({objectMode: true});

  deps.write = function(dep, encoding, callback) {
    var path = dep.path;
    //console.log('dep', dep);

    if (path in pack._loading) {
      pack._loading[path]++;
    }
    else {
      pack._loading[path] = 1;
    }

    Transform.prototype.write.call(this, dep, encoding, callback);
  };

  deps._transform = function(dep, encoding, callback) {
    var path = dep.path;

    if (!dep.isNull()) {
      // Always replace previous version since source is provided.
      return push();
    }

    fs.stat(path, function(err, stats) {
      if (err) callback(err);
      else {
        var cachedMtime = pack._mtimes[path] || 0;
        var mtime = pack._mtimes[path] = stats.mtime.getTime();

        if (mtime > cachedMtime) {
          load();
        }
        else {
          pack._finalize(path);
          callback(); // Use the cache, don't push anything to mods.
        }
      }
    });

    function load() {
      fs.readFile(path, function(err, source) {
        if (err) {
          pack._loading[path]--;
          callback(err);
        }
        else {
          //console.log('loaded', id);
          dep.contents = source;
          push();
        }
      });
    }

    function push() {
      deps.push(dep);
      callback();
    }
  };

  deps.once(
    'error',
    pack.emit.bind(pack, 'error')
  );
};



/**
 *  Send in entry modules to dynapack. The dependency graph will be
 *  discovered, and each new dependency (and its source) will be emitted
 *  on the deps stream.
 *
 *  @param {String|Object|File} entry This should be a path string, or vinyl config
 *  object or instance.
 *
 */

Dynapack.prototype._transform = function(entry, encoding, callback) {
  //console.log('received entry', entry);
  if (typeof entry === 'string') {
    entry = {path: entry};
  }

  if (this.entryPaths.indexOf(entry.path) < 0) {
    this.entryNames.push(path.basename(entry.path).replace(/\.js$/, ''));
    this.entryPaths.push(entry.path);
  }

  if (typeof entry.isNull !== 'function') {
    entry = new File(entry);
  }

  this._deps.write(entry);
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


Dynapack.prototype.clean = function() {
  var modules = this.modules;
  var clean = Object.keys(modules);

  pack.traverse(function(visited) {
    var module = last(visited);

    pull(clean, module.path);
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
 *  When a module is required asynchronously, all of the bundles on
 *  which it depends (statically) must be downloaded immediately by
 *  the client. This function
 *  finds those bundles given a root module. We could gather this
 *  information on the fly as modules are read from module-deps, but
 *  oh well.
 */

Dynapack.prototype.requiredBundles = function(rootPath) {
  var pack = this;
  var required = [];

  if (pack.roots.indexOf(rootPath) < 0) {
    throw new Error(rootPath, 'is not in the roots list.');
  }

  forEach(pack.bundles, function(bundle) {
    // Grab random module in bundle, all modules in bundle will have
    // same 'roots' property. That's what defines a bundle. :|
    var module = pack.modules[bundle.modules[0]];

    if (module.roots.indexOf(rootPath) >= 0) {
      required.push(bundle.id);
    }
  });

  return required;
};


Dynapack.prototype.renderModule = function(path) {
  var pack = this;
  var module = pack.modules[path];
  var source = module.source;

  module.deps.set.forEach(function(depPath) {
    source = replaceAllString(
      source,
      module.refs[depPath],
      pack.ids[depPath]
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
 *  @param {String} bundleId
 */

Dynapack.prototype.getBundleRoots = function(bundleId) {
  var pack = this;
  var roots = {};
  var bundle = pack.bundles[bundleId];

  bundle.modules.forEach(function(path) {
    var module = pack.modules[path];

    module.deps.dynamic.forEach(function(depPath) {
      roots[depPath] = pack.requiredBundles(depPath);
    });
  });

  return roots;
};


module.exports = Dynapack;
