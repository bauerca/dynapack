(function(bundleId, bundle) {
  var loadBundles = window['dynapackLoadBundles'],
      __bundles = 'dynapackBundles',
      bundles = window[__bundles];
  if (!bundles) bundles = window[__bundles] = {};
  bundles[bundleId] = bundle;
  loadBundles && loadBundles();
})//(BUNDLE_ID, [MODULES, ROOTS]);
