(function(chunkId, chunk) {
  var loadChunks = window['dynapackLoadChunks'],
      __chunks = 'dynapackChunks',
      chunks = window[__chunks];
  if (!chunks) chunks = window[__chunks] = {};
  chunks[chunkId] = chunk;
  loadChunks && loadChunks();
})//(CHUNK_ID, [MODULES, ROOTS]);
