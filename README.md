

Dynapack reduces configuration headache in isomorphic web apps as long as
you submit to its hacky syntax. Modules written in the dynapack style *just
work* when run in node, and can be compiled for use in the browser (a la
browserify) with goodies like bundle-splitting and async module loading.

### Static modules

```js
var m = require('./my-static-module');
```

I need this module now.

### Dynamic modules

```js
var m = './my-dynamic-module' /*module*/;
```

I don't need this module right now.

### Async loading

```js
process.nextTick(function() {
    var m = require('./my-module');
});
```

Fetch that module! I'll wait...


**That's it.** Okay, not really, but those are the essentials. At this point,
you either are intrigued and have lots of questions, or you want to throw
burning trash on this project
for that `/*module*/` and `process.nextTick` nonsense.



It is then the goal of dynapack that

```
local:me$ dynapack ./main.js
```

gets you most of the way to a fantastic user experience. Let's do this!


## Why?

Because code bundling optimization must be done by hand when your modules are
loaded asynchronously and dynamically. Have a look at the [tutorial for a
multipage app in requirejs](https://github.com/requirejs/example-multipage).
This seems far more complicated than it needs to be. There are [similar
steps](https://github.com/webpack/webpack/tree/master/examples/multiple-entry-points)
required when using the fantastic [webpack](http://webpack.github.io/) bundler
under the CommonJS style.

Here is an example of a multipage app in dynapack for comparison.

`main.js`: This holds the router that dynamically loads only the javascript
bundle(s) that are required to display the target page.

```js
var currentPage = (
    document.location.pathname === '/page1' ?
    './page1' /*module*/ :
    './page2' /*module*/
);

process.nextTick(function() {
    var pageHtml = require(currentPage);
    document.innerHTML(pageHtml);
});
```

`page1.js`: Page 1 requires jQuery, statically.

```js
var $ = require('jquery');
module.exports = '';
```

`page2.js`: Page 2 requires jQuery and Backbone, statically.

```js
var $ = require('jquery');
var backbone = require('backbone');
module.exports = '';
```

*Without any configuration file*, running `dynapack ./main.js` will produce the
following bundles:

```
0.js:
    - main.js
1.js:
    - jquery
2.js:
    - page1.js
3.js:
    - page2.js
    - backbone
```

On a user's first visit, once the initial page loads (and `0.js` runs), if the
url path is `/page1`, the browser will download `1.js` and `2.js` in parallel.
If the url path is `/page2`, it will download `1.js` and `3.js` in parallel.
If the client
moves from `/page1` to `/page2`, only `3.js` will be downloaded because `1.js`
is cached.



```js
define(function() {
    return function(params) {
        require(['./index'], function(index) {

        });
    };
});
```

Isomorphic modules run in both the browser and node. Since you already compile
your modules for the browser (concatenation, minification), it makes sense to
write node-first modules whenever possible. Node sticks to
the simple CommonJS `require('module')`, so we want to work with that and avoid
shims on the server side where we can.

Bundle splitting and chunk optimization is a tricky business. The best way
to do it depends on the complex state and flow of your app. The more information
an optimizer has about what modules may be loaded from 

AMD provides dynamic module loading by allowing arbitrary expressions to
be passed to calls to async requires; for example:

```js
var deps = ['./a', './b'];
require(deps, function(a, b) {
    // ...
});
```

Unfortunately, in the above form, the
[RequireJS optimizer](http://requirejs.org/docs/1.0/docs/optimization.html)
can't pick up on modules `'./a'` and `'./b'`, so they won't be included in any
bundles (they can still be fetched, but will be done so individually, not in
a chunk). This can be changed by naming them as entry points in a config file, but
now you've got your module names in two places, and that gets annoying to
manage.


## Bundle splitting

### Background

The set of modules comprised by your app is represented as the following
triangle with a single entry point module at the top and modules without
dependencies--core modules like underscore--residing near the bottom edge.

In the simplest case, your app is a tree, where nodes are modules and a
connection represents a dependency of the parent module on the child module.
More realistically, however,
your app is a directed graph of dependencies (meaning branches can rejoin farther
down the graph).

Bundles are split around dynamic dependencies, which are defined by statements
like:

```js
var m = './my-module' /*module*/;
var pages = [
    './page1' /*module*/,
    './page2' /*module*/,
    './page3' /*module*/
];
```

or

```js
process.nextTick(function() {
    var m = require('./page1');
});
```



## Dependencies

There are two kinds of dependencies, *static* and *dynamic*. Static
dependencies are merely 

### Static

A static dependency will be specified by the symbol

```
d_{i,j}
```

where

Every module defines static dependencies with calls to `require('module_name')`
and dynamic dependencies by declaring a string literal *immediately*
followed by the comment: `/*module*/`. For example:

```js
var through = require('through');   // static
var react = 'react'/*module*/;      // dynamic
```


Consider a module `A` with dynamic dependencies on `a` and `b` and static
dependencies on...


A *bundle* is a set of modules defined by a single entry-point module.
The set is formed by first adding the entry module to the empty set,
then following the entry module's static dependencies (recursively),
adding each visited module to the set. We are talking about formal
sets here, so if a module is visited twice in the dependency traverse, it
occurs only once in the final set.


Every module, `m`, has a set of reachable dynamic dependencies
defined as the set of all dynamic dependencies defined in the modules of
the bundle found with 


For example, an
entry module for a bundle can access *all* dynamic dependencies defined
in the bundle, whereas a static dependency of the entry module (also in
the same bundle.



## Browser

### Bundle fetching

The browser is in a current state; that is, it has a set of dynamic dependencies
satisfied. When the browser requests an unsatisfied dyn dependency, the bundle
that needs to be downloaded is identified by the pair [currentState.id, dynDep.id].

The state can be updated on the browser without knowledge of what modules are packaged
in the requested module, since a state id is uniquely formed from the set of
satisfied dyn deps.

