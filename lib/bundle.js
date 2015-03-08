

function Bundle(opts) {
  this.pack = opts.pack;
  this.modules = opts.modules;
}


Bundle.prototype.roots = function() {
  var pack = this.pack;

  this.modules.forEach(function(id) {
    var module = pack.modules[id];

    module.




