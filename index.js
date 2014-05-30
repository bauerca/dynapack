var mdeps = require('module-deps');
var browserify = require('browserify');
var builtins = require('browserify/lib/builtins');
var browserResolve = require('browser-resolve');
var browserPack = require('browser-pack');
var through2 = require('through2');
var resolve = require('resolve');
//var detective = require('detective');
var fs = require('fs');
var path = require('path');
var extend = require('xtend');
var async = require('async');
var _ = require('underscore');
var encodeBits = require('./encode-bits');
var Transform = require('./transform');
//var JSONStream = require('JSONStream');


function ComboPack(entry, opts) {
  var self = this;

  self.opts = extend(
    {
      modules: [],
      dynamicLabels: 'dynamod',
      builtins: builtins
    },
    opts
  );

  self.builtins = self.opts.builtins;

  var labels = self.opts.dynamicLabels;
  labels = Array.isArray(labels) ? labels : [labels];

  self.dynRegexp = new RegExp(
    '([\'"])([^\'"]+)\\1\\s*[,;]?\\s*/\\*\\s*(' + 
    labels.join('|') +
    ')\\s*\\*/', 'g'
  );

  self.transform = Transform({
    moduleLabel: labels[0]
  });

  self.entry = entry;
  self.modules = {};

  // A mapping from chunk id to a subset of modules. The chunk id is formed
  // from the set of entry points that touch the subset of modules. That is,
  // the chunk module subset is the intersection of all static
  // dependency trees identified by the group of entry points encoded into
  // the chunk id.
  self.chunks = {};

  // Entries are identified by an index. Each element of the following is
  // a module id for an entry point.
  self.entries = [];

  // Every module that is a dynamic dependency is given a unique integer
  // index. This is so we can id our bundles.
  self.entryCount = 0;
  self.moduleCount = 0;
}

ComboPack.prototype.run = function(callback) {
  var self = this;
  this.processEntry(self.entry, function() {
    self.pack();
    callback && callback(self.chunks);
  });
};


ComboPack.prototype.chunkId = function(module) {
  //console.log('chunk id for', module);
  return encodeBits(module.entries, 32);
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
ComboPack.prototype.processModule = function(module, entryIndex, callback) {
  var id = module.id;

  if (id in this.modules) {
    // Module has been processed before with a different entry point.
    module = this.modules[id];

    // Verify.
    var err;
    if (module.entries.indexOf(entryIndex) > -1) {
      err = new Error(
        'Entry point ' + entryIndex + ' already exists in module ' + id
      );
      return;
    }

    // Must move module to another chunk. Remove from current chunk.
    var chunkId = this.chunkId(module);
    var oldChunk = this.chunks[chunkId];
    delete oldChunk[id];

    if (Object.keys(oldChunk).length == 0) {
      delete this.chunks[chunkId];
    }

    // Add new entry point to existing module.
    module.entries.push(entryIndex);

    process.nextTick(callback.bind(null, err, module));
  } else {
    // New module! Initialize.
    this.modules[id] = module;
    module.entries = [entryIndex];
    module.index = this.moduleCount++;

    // Parse source for dynamic dependencies/new entry points.
    this.findDynamic(module, callback);
  }
  console.log('module', id, 'entries:', module.entries);

  // Put the module in a chunk.
  var chunkId = this.chunkId(module);
  var chunk;
  if (chunkId in this.chunks) {
    chunk = this.chunks[chunkId];
  } else {
    chunk = this.chunks[chunkId] = {};
  }
  chunk[id] = module;
};

/**
 *  Find all dynamic dependencies in module source and add to 'dynamic'
 *  property on module.
 */
ComboPack.prototype.findDynamic = function(module, callback) {
  var match;
  var matches = [];

  while (match = this.dynRegexp.exec(module.source)) {
    matches.push(match);
  }

  var resolveOpts = {
    filename: module.id,
    modules: this.builtins
  };

  // Maps relative module paths to absolute module paths (or 'id's as
  // we/browserify call them).
  module.dynamic = {};

  async.each(
    matches,
    function(match, callback) {
      var name = match[2];
      //console.log('resolving', name, 'with', resolveOpts);
      browserResolve(name, resolveOpts, function(err, id) {
        if (err) {
          callback(err);
          return;
        }
        module.dynamic[name] = id;
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
ComboPack.prototype._dynDeps = function(have) {
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
 *  @param {Object<String, Module>} have The modules already loaded to
 *    the "client."
 *  @param {String} need The id of the module needed by the "client."
 *  @param {Function} callback
 */
ComboPack.prototype.processEntry = function(entry, callback) {
  var self = this;

  // Add entry point to set of followed.
  // self.entries[entry] = true;
  var entryIndex = self.entries.push(entry) - 1;

  // The set of new entry points parsed from this entry point's
  // bundle.
  var newEntries = [];

  var mdepOpts = {
    modules: self.builtins,
    transform: self.transform
  };

  var depStream = mdeps(entry, mdepOpts).pipe(through2.obj(handle));
  depStream.resume();
  depStream.on('end', function() {
    // Pack up the bundle asynchronously.

    // Recurse.
    async.each(
      //self.dynDeps(have),
      newEntries,
      self.processEntry.bind(self),
      callback
    );
  });

  function handle(module, encoding, callback) {
    self.processModule(module, entryIndex, function(err) {
      // After processing, scan the dynamic dependencies found in the
      // module
      var id;
      var relId;
      for (relId in module.dynamic) {
        id = module.dynamic[relId];
        if (self.entries.indexOf(id) < 0) {
          newEntries.push(id);
        }
      }
      callback();
    });
  }

};

/**
 *  Generate a unique id for the given group of modules. Since groups
 *  are formed by calls to {@link ComboPack.fetch}, a group is identified
 *  uniquely by its set of satisfied dynamic dependencies.
 */
ComboPack.prototype.id = function(modules) {
  // Each entry is an index for a satisfied dynamic dependency.
  var indices = [];
  var ids = [];
  _.each(modules, function(module) {
    if (module.entry) {
      indices.push(module.index);
      ids.push(module.id);
    }
  });
  console.log('creating id for', ids);
  // Encode array of ints to base32.
  return encodeBits(indices, 64);
};

ComboPack.prototype.bundleId = function(modules) {
  var indices = [];
  for (var id in modules) {
    indices.push(modules[id].index);
  }
  return encodeBits(indices, 64);
};

/**
 *  Given a client that has gone through the fetch sequence w.x.y,
 *  left the site, then returned and wants to fetch z, what bundles
 *  from the w.x.y fetch sequence should be loaded from the cache?
 *
 *  The bundle w.x.y.z will not contain modules already present in
 *  the bundles x, x.y, x.y.z. The downloaded bundle w.x.y.z should
 *  contain information on what previously downloaded bundles need to
 *  be loaded before it can run. Boom.
 *
 *  What if a previously downloaded bundle has been removed from the
 *  cache? Let's say w.x.y sequence has been downloaded (cached). On return,
 *  the client loads w, then wants to load z. Ideally (and usually), we
 *  would download w.x.y.z, b/c w.x and w.x.y are cached. But what if w.x has
 *  been busted? The sequence is broken. Must we start over from w (by
 *  downloading w.z)? Not
 *  necessarily; if bundle w.y is equivalent to w.x.y, then we can fetch
 *  w.y.z rather than w.z, and the cached bundle w.x.y (which is now renamed
 *  w.y) remains valid.
 *
 *  If we want to get really fancy, we can devise a strategy for CONVERTING
 *  w.x.y to w.y when we fetch w.y.z. To do this, we need to know which modules
 *  in w.x were common to w.y, and include those in the download of w.y.z.
 *  This correcting bundle might have the name w.x.y.-x.z, to indicate w.x was
 *  busted and we want to keep w.y.
 *
 *  Or we just break up all shared resources. Every module that has more than
 *  one dependent is shared. We only care about isolating a shared module that
 *  is shared across different dynamic dependencies.
 *
 *
 *  For example, where '/' is a static dep, and '.' is a dyn dep,
 *
 *            a
 *           / \
 *          b   c
 *           \ /
 *            d
 *
 *  In this case, d would *not* be isolated.
 *
 *            a
 *           . .
 *          b   c
 *           \ /
 *            d
 *
 *  However, in this case, we want to isolate d because it can be requested
 *  through more than one dynamic dependency.
 *
 *  What is the algirhtm that determines whether a shared dep should be
 *  isolated?
 *
 *    1. Start at the shared dep, find all routes back to their first dynamic
 *       dependency. If all routes join, the module should *not* be isolated.
 *       Otherwise, isolate it.
 *       
 
 shared Let's say w.x and w.y share
 *  some modules. When the client downloads the sequence w.x.y, they are
 *  downloading *four* bundles: w, w.x
 *
 */


/**
 *  Change all ids from full path names to integer strings. This also changes
 *  the module string in the source code of each module. Serious obfuscation here;
 *  errors after this point make debugging difficult.
 */
ComboPack.prototype.reId = function() {
  var self = this;
  // First change dependencies.
  _.each(self.modules, function(module, id) {
    var oldDeps = module.deps;
    module.deps = [];
    _.each(oldDeps, function(depId, name) {
      var newId = self.modules[depId].index.toString();
      // Replace in module source.
      module.source = module.source.replace(
        '\'' + name + '\'',
        '\'' + newId + '\''
      ).replace(
        '"' + name + '"',
        '"' + newId + '"'
      );
      module.deps.push(newId);
    });
    var oldDynamic = module.dynamic;
    module.dynamic = [];
    _.each(oldDynamic, function(depId, name) {
      var newId = self.modules[depId].index.toString();
      // Replace in module source.
      module.source = module.source.replace(
        '\'' + name + '\'',
        '\'' + newId + '\''
      ).replace(
        '"' + name + '"',
        '"' + newId + '"'
      );
      module.dynamic.push(newId);
    });
  });
  // Then change entries.
  self.entry = self.modules[self.entry].index.toString();
  var oldEntries = self.entries;
  self.entries = [];
  _.each(oldEntries, function(id) {
    self.entries.push(self.modules[id].index.toString());
  });
  // Then change modules themselves.
  var oldModules = self.modules;
  self.modules = {};
  _.each(oldModules, function(module, oldId) {
    var newId = module.index.toString();
    module.path = oldId;
    module.id = newId;
    self.modules[newId] = module;
  });
  // Now chunks.
  var oldChunks = self.chunks;
  self.chunks = {};
  _.each(oldChunks, function(modules, chunkId) {
    var newModules = {};
    _.each(modules, function(module, oldId) {
      newModules[module.id] = module;
    });
    self.chunks[chunkId] = newModules;
  });
  // Now dance.
};

/**
 *  When a module is required asynchronously, all of the chunks on
 *  which it depends must be downloaded by the client. This function
 *  finds those chunks given an entry point. We could gather this
 *  information on the fly as modules are read from module-deps, but
 *  oh well.
 */
ComboPack.prototype.requiredChunks = function(entryModuleId) {
  var self = this;
  var entryIndex = self.entries.indexOf(entryModuleId);
  if (entryIndex === -1) {
    throw new Error(entryModuleId, 'is not in the entries list.');
  }
  // Loop through all chunks.
  var required = [];
  _.each(self.chunks, function(modules, chunkId) {
    // Grab random module in chunk, all modules in chunk will have
    // same 'entries' property. That's what defines a chunk. :|
    var module = modules[Object.keys(modules)[0]];
    if (module.entries.indexOf(entryIndex) !== -1) {
      required.push(chunkId);
    }
  });
  return required;
};


ComboPack.prototype.wrapModule = function(module) {
      // Should offer some transform API here like browserify.
  return (
    'function(module, exports, require) {' +
    module.source +
    '}'
  );
};


/**
 */
ComboPack.prototype.wrapChunk = function(chunkId, modules) {
  var self = this;
  var modules = self.chunks[chunkId];

  // A chunk brings with it a new set of entry points, not defined
  // in any other chunk. The client must be informed of the new chunks
  // this introduces. 'entries' is a mapping from entry point module id
  // to an array of chunks.
  var entries = {};
  _.each(modules, function(module) {
    _.each(module.dynamic, function(id) {
      entries[id] = self.requiredChunks(id);
    });
  });

  return (
    'dynapackChunkLoaded("' + chunkId + '", {' +
    Object.keys(modules).map(function(moduleId) {
      var module = modules[moduleId];
      return '"' + moduleId + '":' + self.wrapModule(module);
    }).join(',') + '},' +
    JSON.stringify(entries) +
    ');'
  );
};

/**
 *  Pack chunks for browser. The file name given to a chunk.
 */
ComboPack.prototype.pack = function() {
  var self = this;
  self.reId();

  var mainChunks = self.requiredChunks(self.entry);
  var main = fs.readFileSync('./require.js') + '("' + self.entry + '");';

  _.each(self.chunks, function(modules, chunkId) {
    var chunk = self.wrapChunk(chunkId, modules);
    if (mainChunks.indexOf(chunkId) !== -1) {
      main += chunk;
    } else {
      fs.writeFile(chunkId + '.js', chunk);
    }
  });
  fs.writeFile('main.js', main);
};


module.exports = function(entry, opts, callback) {
  if (callback === undefined && typeof opts === 'function') {
    callback = opts;
    opts = undefined;
  }
  var combopack = new ComboPack(entry, opts);
  combopack.run(callback);
};
