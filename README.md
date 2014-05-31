![Logo](https://raw.githubusercontent.com/bauerca/dynapack/master/assets/logo.png)

Dynapack reduces the headache of bundling web apps that want *dynamic*,
asynchronous module loading (yes, this is actually different from RequireJS,
webpack, and Browserify). Dynapack also helps you write apps isomorphically;
modules written in the dynapack style *just work* when run in Node, and can be
compiled for use in the browser (a la browserify) with goodies like automagic
bundle-splitting and async bundle loading.

**This project and document is a work in progress. Consider it alpha-stage.
Please contribute!**

# In brief

Here is the shortest explanation of dynapack and its principles we could
muster. Please read [in depth](#in-depth) for a better understanding of the
motives, purpose, and actual usage of this project.

## Dynamic modules

Dynapack introduces a new syntax called a *dynamic dependency declaration*
(d<sup>3</sup>):

```js
var __m = './big-module' /*js*/;
```

where the important part of the above is the `'string' /*js*/` combination
(I like to use the double underscore for the variable because of its
similarity to `__filename` and `__dirname` in Node, but you can use whatever).

A dynamic dependency declaration is simply a statement to a
compiler/bundler/optimizer that the decorated string literal points to a
dependency to be loaded asynchronously and only under conditions
to be determined by the logic of the declaring module.

## Why?

Because code bundling optimization must be done by hand when modules are
loaded dynamically. Have a look at the [tutorial for a
multipage app in requirejs](https://github.com/requirejs/example-multipage).
This is more complicated than it needs to be. There are [similar
steps](https://github.com/webpack/webpack/tree/master/examples/multiple-entry-points)
required when using the impressive [webpack](http://webpack.github.io/) bundler
under the CommonJS style.

This by-hand optimization is necessary because the r.js/webpack/browserify
optimizers rely on parsing javascript for `require(...)` (or similar) calls.
And if one of these `require(...)` calls has a *dynamic* dependency argument (a
variable rather than a string literal), the optimizer skips the analysis of
that dependency, and the developer is stuck with the cleanup.

However, with a dynamic dependency declaration, an optimizer can know about a
dependency that is dynamic (hidden by a variable) and should be loaded
asynchronously, and can optimize the bundling of an app accordingly and
(hopefully) without intervention from the developer.


# In depth

- [Background](#background)
- [Usage](#usage)

## Background

What follows is some general discussion on javascript-heavy web apps and
module bundling to prepare for understanding the purpose of dynapack.

### Conceptual

A modern javascript-heavy web app consists of a bunch of javascript files
(called modules) all tied together by some kind of module-loading scheme like
CommonJS (Node, Browserify) or AMD (RequireJS). Such an app can be modeled as a
dependency tree, which we'll represent as this big triangle:

![All modules](https://raw.githubusercontent.com/bauerca/dynapack/master/assets/all-modules.png)

All the modules needed by the app are contained within the triangle.
At the root of the tree is the entry point to the app, probably a router of
some kind; down at the bottom are core modules that have no dependencies.

Single-page apps often have the client download the entire dependency tree (the
whole triangle) before the app is displayed in the browser. RequireJS (for
AMD-style modules) and Browserify (for CommonJS-style modules) are the standard
methods for packaging up a single bundle like this.

Oftentimes, a module and its dependencies is pretty big chunk of javascript and
is used only in a few pages of an app.  In this case, the developer might wish
to exclude it from the main app bundle and have the client download it only
when they need it. Using the triangle, we might illustrate this as such:

![Exclude bundle](https://raw.githubusercontent.com/bauerca/dynapack/master/assets/exclude.png)

Now the isolated triangle is not downloaded with the main bundle, which has decreased in
size to the trapezoid thingy.

At this point, we must realize that the app is not accurately represented by a
dependency tree; it is, in fact, a directed dependency *graph*. This is because
dependency branches may rejoin; for example, the root module may depend on two
custom modules, each of which depends on jQuery. To visualize, the following
two paths through the dependency graph could get to the excluded bundle in the
above figure:

![It's a graph](https://raw.githubusercontent.com/bauerca/dynapack/master/assets/graph.png)

Great. Now let's go crazy with bundle-splitting to see how we can *minimize*
initial page load times (we should mention that the necessity for snappy
initial page loads may not apply to all apps). The basic principle is this:
force the client to download only those modules it needs to display the target
page.

Suppose that the following green triangle at the root of the graph comprises
those modules common to *all* pages of the app. This group of modules should
*always* be downloaded.

![Root bundle](https://raw.githubusercontent.com/bauerca/dynapack/master/assets/main.png)

Now suppose that page 1 of the app uses the modules enclosed by both sub-triangles
in the following figure

![Page 1 modules](https://raw.githubusercontent.com/bauerca/dynapack/master/assets/page1.png)

where the *entry point* to the page-1-specific modules is the root of the
red (lower-left) sub-triangle. Page 2 has its own similarly-visualized set
of modules.

![Page 2 modules](https://raw.githubusercontent.com/bauerca/dynapack/master/assets/page2.png)

At this point, it might seem reasonable to make three bundles, one for each
triangle. However, we see that after a client visits *both* pages, they
have traversed the following modules

![Page 1 & 2 modules](https://raw.githubusercontent.com/bauerca/dynapack/master/assets/page1and2.png)

which is the union of the modules needed to display pages 1 and 2,
individually. Surely, we shouldn't download the same modules twice! A fourth
bundle is suggested by the intersection of the modules specific to pages 1 and
2 (the small purple triangle).  Now, when a client *initially* visits page 1,
it downloads the green (top) triangle, red (left) trapezoid, and small (purple)
triangle; and when it visits page 2, it downloads the green (top) triangle,
blue (right) trapezoid, and small (purple) triangle.  Of course, if a client
has already visited page 1, it needs to download only the blue (right)
trapezoid to display the page.

But that's one more download! What about latency? Sure, but these requests for
bundles can be made in parallel; the requests for all the bundles needed to
display a page share the same latency (depending on the number of concurrent
requests allowed by the browser).

The purple (small) triangle is sometimes called the "commons" bundle and, in
RequireJS or webpack, is formed by hand by the developer via a config file.
Dynapack strives to assemble these common bundles (and manage the parallel
downloading of them on the client) for you, because in reality, your dependency
graph has many "common" bundles (small purple triangles).

### RequireJS

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

## Usage

Dynapack usage information.

### Fetching dynamic modules

A dynamic dependency implies asynchronous loading of that dependency (but,
conversely, asynchronous loading of a dependency does *not* imply that the
dependency is dynamic).

You can't just make a d<sup>3</sup> and then `require(...)` it a couple lines
later; that would defeat the entire purpose (and break your dynapack build).
The understanding is that, when
a dynamic dependency is needed, it will be fetched asynchronously,
and that could take a while
(of course, in Node, it shouldn't take any time at all, but in a browser...).

Therefore, fetching requires a new syntax as well. Ideally, we would use an AMD
require that takes a list of dependencies.


### Dynapack example

`main.js`: This holds the router that dynamically loads only the javascript
bundle(s) that are required to display the target page.

```js
var fetch = require('dyna-fetch')(require);

module.exports = function(path) {
    var __page = (
        path === '/home' ?
        './home' /*js*/ :
        './not-found' /*js*/
    );

    fetch(__page, function(page) {
        document.innerHTML = page;
    });
};
```


`home.js`: Page 2 requires jQuery and Backbone, statically.

```js
var $ = require('jquery');
var backbone = require('backbone');
module.exports = '<h1>Homepage!</h1>';
```

`not-found.js`: Page 1 requires jQuery, statically.

```js
var $ = require('jquery');
module.exports = '<h1>Not found</h1>';
```

*Without any configuration file*, running `dynapack ./main.js` will produce the
following bundles:

```
0.js:
    - (dynapack loader)
    - main.js
1.js:
    - jquery
2.js:
    - not-found.js
3.js:
    - home.js
    - backbone
```

On a user's first visit, once the initial page loads (and `0.js` runs), if the
url path is not `/home`, the browser will download `1.js` and `2.js` in
parallel.  If the url path *is* `/home`, it will download `1.js` and `3.js` in
parallel.  If the client moves from a not found page to `/home`, only `3.js`
will be downloaded because `1.js` is cached.

### Isomorphism

Isomorphic modules run on both the client and server (in the context of
dynapack, the browser and node). Since you already compile your modules for the
client (concatenation, minification), it makes sense to write node-first
modules whenever possible. Node sticks to the simple CommonJS
`require('module')`, so we want to work with that and avoid shims on the server
side where we can.


