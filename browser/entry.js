(function(entry, entryBundles, options) {
// Downloaded modules. Mapping from module id to a function of the form
// fn(module, exports, require).
var modules = {},

// Mapping from module id to the result of calling the corresponding module
// function in `modules` above.
cache = {},

// A mapping from root module ids to arrays of bundle ids needed
// by those modules.
roots = {},

// Outstanding ensure requests. Maps a sorted, joined array of bundle ids
// to an array of callbacks.
// root module
// id to array of callbacks waiting for its availability.
ensureCallbacks = {},
ENSURE_ID_SEP = ' ',

// A mapping from bundle id to either 0 if the bundle is
// currently downloading, or 1 if it has been downloaded and its modules
// were loaded into `modules`.
__bundles = 'dynapackBundles',
//bundles = {};

// A mapping from dynapack-generated bundle id to custom id (such as in the
// case of asset-revving.
aliases = window['dynapackAliases'] || {};

// The following is called everytime a bundle is downloaded AND this function
// exists. Otherwise, the downloaded bundle data will simply be added to the
// window[__bundles] object, which is created by the first downloaded
// bundle. This function fires ensure callbacks whenever it can.
var loadBundles = window['dynapackLoadBundles'] = function() {
  var bundles = window[__bundles], // Created by bundle.
      bundleId, bundle;

  // No bundles have finished downloading. Wait for them.
  if (!bundles) return;

  for (bundleId in bundles) {
    bundle = bundles[bundleId];
    if (typeof bundle == 'object') {
      extend(modules, bundle[0]);
      extend(roots, bundle[1]);
      // Mark bundle as loaded.
      bundles[bundleId] = 1;
    }
  }

  var id, bundlesReady, called = [];

  for (id in ensureCallbacks) {
    bundlesReady = true;
    each(id.split(ENSURE_ID_SEP), function(bundleId) {
      // Falsey if 0 (downloading) or undefined (not requested;
      // this shouldn't happen. Check for it?).
      if (!bundles[bundleId]) bundlesReady = false;
    });
    if (bundlesReady) {
      each(ensureCallbacks[id], function(callback) {
        callback();
      });
      called.push(id);
    }
  }

  each(called, function(id) {
    delete ensureCallbacks[id];
  });
};

function extend(dest, src) {
  for (var key in src) dest[key] = src[key];
}

function each(arr, iter) {
  for (var i = 0, len = arr.length; i < len; i++) iter(arr[i], i);
}

function require(id) {
  var module = cache[id];

  // Static require call. Module must exist on client.
  if (module) return module.exports;

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

require.ensure = function(modules, callback) {
  var bundles = window[__bundles],
      awaitingBundleIds = [];

  each(modules, function(module) {
    each(roots[module] || [], function(bundleId) {
      if (!(bundleId in bundles)) {
        bundles[bundleId] = 0; // means it's downloading
        // start the fetch.
        var head = document.getElementsByTagName('head')[0];
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.charset = 'utf-8';
        script.src = (options.prefix || '/') + (aliases[bundleId] || bundleId); // Bundle id includes .js
        head.appendChild(script);
      }
      // Can a require call occur while a bundle is in stasis? No, the
      // following flow covers all bundle/entry arrival timings and should
      // explain why:
      //
      //  1. a bundle arrives before entry (loadBundles() d.n.e.)
      //  2. bundle is placed in window[__bundles]
      //  3. goto 1. or continue to 4.
      //  4. entry arrives
      //  5. entry creates then calls loadBundles()
      //  6. loadBundles() calls/purges require callbacks
      //  7. bundle arrives
      //  8. bundle is placed in window[__bundles]
      //  9. bundle calls loadBundles()
      // 10. loadBundles() calls/purges require callbacks
      // 11. goto 7.
      //
      // Therefore, require calls have no chance of running before
      // bundles are loaded into modules. 
      //
      if (bundles[bundleId] === 0) {
        // Okay to repeat bundles in this array. See loadBundles().
        awaitingBundleIds.push(bundleId);
      }
    });
  });

  if (awaitingBundleIds.length) {
    var ensureId = awaitingBundleIds.sort().join(ENSURE_ID_SEP);
    ensureCallbacks[ensureId] = ensureCallbacks[ensureId] || [];
    ensureCallbacks[ensureId].push(callback);
  }
  else setTimeout(callback, 0);
};

roots[entry] = entryBundles;

// Asynchronously require the entry module. It will run when all of
// the bundles needed by entry are loaded. The bundles needed by entry
// should appear immediately after this IIFE.
ensureCallbacks[entryBundles.sort().join(ENSURE_ID_SEP)] = [function(){
  require(entry);
}];

// If some bundles have already downloaded, they are patiently waiting
// to be loaded from purgatory (i.e. window[__bundles]).
loadBundles();
})//(ENTRY MODULE ID, BUNDLES NEEDED BY ENTRY, PREFIX FOR BUNDLE SCRIPTS);
