(function(entry, entryChunks, prefix) {
// Downloaded modules. Mapping from module id to a function of the form
// fn(module, exports, require).
var modules = {},

// Mapping from module id to the result of calling the corresponding module
// function in `modules` above.
cache = {},

// A mapping from root module ids to arrays of chunks needed
// by those modules.
roots = {},

// A collection of outstanding async require calls. Maps root module
// id to array of callbacks waiting for its availability.
requireCallbacks = {},

// A mapping from chunk id to either 0 if the chunk is
// currently downloading, or 1 if it has been downloaded and its modules
// were loaded into `modules`.
__chunks = 'dynapackChunks';
//chunks = {};

// The following is called everytime a chunk is downloaded AND this function
// exists. Otherwise, the downloaded chunk data will simply be added to the
// window[__chunks] object, which is created by the first downloaded
// chunk.
var loadChunks = window['dynapackLoadChunks'] = function() {
  var chunks = window[__chunks], // Created by chunk.
      chunkId, chunk;

  // No chunks have finished downloading. Wait for them.
  if (!chunks) return;

  for (chunkId in chunks) {
    chunk = chunks[chunkId];
    if (typeof chunk == 'object') {
      extend(modules, chunk[0]);
      extend(roots, chunk[1]);
      // Mark chunk as loaded.
      chunks[chunkId] = 1;
    }
  }

  var id, chunksReady, called = [];

  for (id in requireCallbacks) {
    chunksReady = true;
    each(roots[id], function(chunkId) {
      // Falsey if 0 (downloading) or undefined (not requested;
      // this shouldn't happen. Check for it?).
      if (!chunks[chunkId]) chunksReady = false;
    });
    if (chunksReady) {
      each(requireCallbacks[id], function(callback) {
        callback(require(id));
      });
      called.push(id);
    }
  }

  each(called, function(id) {
    delete requireCallbacks[id];
  });
};

function extend(dest, src) {
  for (var key in src) dest[key] = src[key];
}

function each(arr, iter) {
  for (var i = 0, len = arr.length; i < len; i++) iter(arr[i], i);
}

function require(id, callback) {
  if (callback) {
    var chunks = window[__chunks],
        // Set of chunks needed by this require call:
        requiredChunks = roots[id] || [],
        downloading,
        chunkId,
        index;

    for (index in requiredChunks) { // order doesn't matter.
      chunkId = requiredChunks[index];
      if (!(chunkId in chunks)) {
        chunks[chunkId] = 0; // means it's downloading
        // start the fetch.
        var head = document.getElementsByTagName('head')[0];
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.charset = 'utf-8';
        script.src = prefix + chunkId + '.js';
        head.appendChild(script);
      }

      // Can a require call occur while a chunk is in stasis? No, the
      // following flow covers all chunk/entry arrival timings and should
      // explain why:
      //
      //  1. a chunk arrives before entry (loadChunks() d.n.e.)
      //  2. chunk is placed in window[__chunks]
      //  3. goto 1. or continue to 4.
      //  4. entry arrives
      //  5. entry creates then calls loadChunks()
      //  6. loadChunks() calls/purges require callbacks
      //  7. chunk arrives
      //  8. chunk is placed in window[__chunks]
      //  9. chunk calls loadChunks()
      // 10. loadChunks() calls/purges require callbacks
      // 11. goto 7.
      //
      // Therefore, require calls have no chance of running before
      // chunks are loaded into modules. 
      //
      if (chunks[chunkId] === 0) downloading = 1;
    }

    if (downloading) {
      requireCallbacks[id] = requireCallbacks[id] || [];
      requireCallbacks[id].push(callback);
    }
    else setTimeout(function() {
      callback(require(id));
    }, 0);

  } else {
    var module = cache[id];
    // Static require call. Module must exist on client.
    if (module)
      return module.exports;

    module = cache[id] = {
      exports: {},
      id: id,
      loaded: false
    };

    // Execute the module function
    modules[id].call(null, module, module.exports, require);

    // Flag the module as loaded
    module.loaded = true;
    
    // Return the exports of the module
    return module.exports;
  }
}
// Asynchronously require the entry module. It will run when all of
// the chunks needed by entry are loaded. The chunks needed by entry
// should appear immediately after this IIFE.
requireCallbacks[entry] = [function(){}];
roots[entry] = entryChunks;

// If some chunks have already downloaded, they are patiently waiting
// to be loaded from purgatory (i.e. window[__chunks]).
loadChunks();
})//(ENTRY MODULE, CHUNKS NEEDED BY ENTRY, PREFIX FOR CHUNK SCRIPTS);
