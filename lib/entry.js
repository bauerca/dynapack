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
pendingAsyncRequires = {},

// A mapping from chunk id to either 0 if the chunk is
// currently downloading, or 1 if it has been downloaded and its modules
// were loaded into `modules`.
__chunks = 'dynapackChunks';
//chunks = {};

// Called by the loader below for every downloaded (but NOT loaded) chunk
// found in window['dynapackChunks'].
function loadChunk(newModules, newRoots) {
  var id;
  // Add roots downloaded.
  for (id in newRoots) //{
    roots[id] = newRoots[id];
  //}
  // Add modules downloaded.
  for (id in newModules) //{
    modules[id] = newModules[id];
  //}
}

// The following is called everytime a chunk is downloaded AND this function
// exists. Otherwise, the downloaded chunk data will simply be added to the
// window[__chunks] object, which is created by the first downloaded
// chunk.
window['dynapackLoader'] = function() {
  var chunks = window[__chunks], // Created by chunk.
      chunkId, chunk;

  for (chunkId in chunks) {
    chunk = chunks[chunkId];
    if (typeof chunk == 'object') {
      loadChunk.apply(null, chunk);
      // Mark chunk as loaded.
      chunks[chunkId] = 1;
    }
  }
  performAsyncRequires();
};

/**
 *  Iterate through modules listed in 
 */
function performAsyncRequires() {
  var chunks = window[__chunks],
      id,
      callbacks,
      index,
      chunksReady,
      requiredChunks;
  for (id in pendingAsyncRequires) {
    requiredChunks = roots[id];
    chunksReady = true;
    for (index in requiredChunks) //{
      // Falsey if 0 (downloading) or undefined (not requested;
      // this shouldn't happen. Check for it?).
      if (!chunks[requiredChunks[index]]) //{
        chunksReady = false;
      //}
    //}
    if (chunksReady) {
      callbacks = pendingAsyncRequires[id];
      for (index in callbacks) //{
        // Will take from cache after the first static require.
        callbacks[index].call(null, require(id));
      //}
      delete pendingAsyncRequires[id];
    }
  }
}

function require(id, callback) {
  if (callback) {
    // Set of chunks needed by this require call.
    var chunks = window[__chunks],
        chunksToFetch = roots[id],
        requests = 0,
        chunkId,
        index;

    for (index in chunksToFetch) { // order doesn't matter.
      chunkId = chunksToFetch[index];
      if (!(chunkId in chunks)) {
        chunks[chunkId] = 0; // means it's downloading
        requests++;
        // start the fetch.
        var head = document.getElementsByTagName('head')[0];
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.charset = 'utf-8';
        script.src = prefix + chunkId + '.js';
        head.appendChild(script);
      }
    }

    pendingAsyncRequires[id] = pendingAsyncRequires[id] || [];
    pendingAsyncRequires[id].push(callback);

    // If no requests were made, then all chunks are available. Queue
    // a static require call for the module.
    if (!requests) //{
      setTimeout(performAsyncRequires, 0);
    //}
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
pendingAsyncRequires[entry] = [function(){}];
roots[entry] = entryChunks;
})//(ENTRY MODULE, CHUNKS NEEDED BY ENTRY, PREFIX FOR CHUNK SCRIPTS);
