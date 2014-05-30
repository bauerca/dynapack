(function(main) {
// Downloaded modules. Mapping from module id to a function of the form
// fn(module, exports, require).
var modules = {},

// Mapping from module id to the result of calling the corresponding module
// function in `modules` above.
cache = {},

// A mapping from entry module ids to arrays of chunks needed
// by those modules.
entries = {},

// A collection of outstanding async require calls. Maps entry module
// id to array of callbacks waiting for its availability. Ids in this will,
// as a rule, also be in `entries`.
pendingAsyncRequires = {},

// A mapping from chunk id to either 0 if the chunk is
// currently downloading, or 1 if it has been downloaded and its modules
// were loaded into `modules`.
chunks = {};

window['dynapackChunkLoaded'] = function(chunkId, newModules, newEntries) {
  var id;
  // Add entry points downloaded.
  for (id in newEntries) //{
    entries[id] = newEntries[id];
  //}
  // Add modules downloaded.
  for (id in newModules) //{
    modules[id] = newModules[id];
  //}
  // Mark chunk as downloaded.
  chunks[chunkId] = 1;
  performAsyncRequires();
};

/**
 *  Iterate through modules listed in 
 */
function performAsyncRequires() {
  var id,
      callbacks,
      index,
      chunksReady,
      requiredChunks;
  for (id in pendingAsyncRequires) {
    requiredChunks = entries[id];
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
    var chunksToFetch = entries[id];
        requests = 0,
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
        script.src = chunkId;
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
// Asynchronously require the main module. It will be run when all of
// the following chunks are loaded.
require(main, function(){});
})//(MAIN ENTRY MODULE);

