(function(chunkId, loaderArguments) {
  var loader = window['dynapackLoader'],
      __chunks = 'dynapackChunks',
      chunks = window[__chunks];
  if (!chunks) chunks = window[__chunks] = {};
  chunks[chunkId] = loaderArguments;
  loader && loader();
})//(CHUNK_ID, [MODULES, ENTRIES]);
