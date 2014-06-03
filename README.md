![Logo](https://raw.githubusercontent.com/bauerca/dynapack/master/assets/logo.png)

Dynapack is a javascript module bundler and client-side bundle loader that
solves the following problem. Given a dependency graph of *static* and
*dynamic* dependencies, construct a set of module bundles such that

- the number of bundles is minimized,
- each module exists in only one bundle,
- a client request for a dynamic dependency, *D*, returns only the
  static dependencies of *D* (recursively), and
- a module (bundle) is sent to a client only once (per session).

It should be noted that the solution for an app's graph may not provide the
ideal set of bundles (whatever that measure may be). In this case, there are
two courses of action: (1) swap dynamic with static dependencies (or vice
versa), or (2) use dynapack postprocessing options (TODO) to undo its work to
your liking.

Here is a [complete working example](https://github.com/bauerca/dynapack-example-simple)
of dynapack.

**This project and document are a work in progress. Consider it alpha-stage.
Please contribute!**

## Why?

I couldn't find a bundler/loader that satisfies all the requirements listed above!
Specifically, other bundlers are ignoring what I call the *dynamic dependency diamond*.
What the heck is that? With dotted lines as dynamic dependencies, solid lines as
static dependencies, and arrows pointing from dependent module to dependency,
consider the dependency graph:

![Logo](https://raw.githubusercontent.com/bauerca/dynapack/master/assets/diamond.png)

This situation should lead to *4 bundles*. If a client possesses module **a** and
requests **b**, it should receive **b** and **d**. However, if it instead
requests **c**, it should receive **c** and **d**. Moreover, if a client requests
**b** *then* **c**, the request for **c** should return *only* **c**.

This example is simplified for explanatory purposes. The RequireJS loader, in fact,
does this, but on the *module* level. Dynapack handles the dynamic dependency diamond
in the general case on the *bundle* level to reduce server requests.


# Audience

At the moment, dynapack is for developers who prefer Node's CommonJS module
system (which probably includes those developers building isomorphic web apps);
modules written in dynapack syntax will *just run* under Node.
In principle, nothing prevents support for other module systems like AMD; if
the demand is there, the support will follow.

Because Node disregards asynchronous module loading, a nonstandard technique
was implemented which may further trim dynapack's audience. The following snippet
is probably the most succinct description of the new technique; code like this
*will* appear in modules written for dynapack:

```js
var fetch = require('dynafetch')(require); // Ugly. Oh well.

var __m = './big-module' /*js*/; // This is a dynamic dependency declaration.

// This resembles an async require in AMD.
fetch([__m], function(m) {
    // Do something with module m.
});
```

# Installation

```
> npm install -g dynapack
```

# Usage

```
> dynapack ./entry.js
```

where `entry.js` is the entry point to the client-side version of your app. The
bundles will be installed in a directory named `chunks/` which is created
alongside `entry.js`. The script `chunks/main.js` should be included in your
webpage; the `entry.js` module will run as soon as it is loaded.

# Dependency syntax

The current version of dynapack supports only Node-style syntax for static
dependencies and only [dynamic dependency
declarations](#dynamic-dependency-declaration) with [dynafetch](#dynafetch) for
dynamic dependencies. The following is a brief overview.

## Static

A static dependency is a dependency that exists at all times.
It implies synchronous loading, and it suggests that the dependency should
be delivered to a client along with the dependent module.

The Node CommonJS style is supported, in which a static dependency is a simple
`require` statement.

```js
var m = require('module');
```

If your app uses only this type of dependency, dynapack will function
exactly like [Browserify](http://browserify.org/), and output a single
bundle for your app. In this case, just use Browserify.

## Dynamic

Dynamic dependencies are dependencies that should be loaded/executed only under
certain conditions. This type of dependency is relevant in the browser
environment, where the downloading and execution of modules takes up precious
time. A dynamic dependency that is not needed to display a page does not need
to be downloaded, and therefore does not contribute to the page load wait.

### Dynamic dependency declaration

Dynapack supports a new syntax called a *dynamic dependency declaration* (d<sup>3</sup>):

```js
var __bm = './big-module' /*js*/;
```

where the important part of the above is the `<string> /*js*/` combination.  A
d<sup>3</sup> informs dynapack that the decorated string literal is actually a
dynamic dependency and may be passed to an asynchronous module-loading function
(e.g. [dynafetch](#dynafetch) below).

The advantage of a d<sup>3</sup> is that it is recognized *anywhere* in module
code (whereas other bundlers recognize dependency strings only as arguments to
`require` calls or similar, which binds the dependency name to the function
call).

(I like to use the double underscore for a d<sup>3</sup> variable because of
its similarity to `__filename` and `__dirname` in Node, but you can use
whatever).

### Dynafetch

Dynapack relies on [dynafetch](https://github.com/bauerca/dynafetch),
a dead simple library that provides an
asynchronous dependency loader similar to AMD-style `require`. Its usage is a
little unsightly, but, as a result, it *just works* in Node:

```js
var fetch = require('dynafetch')(require);
fetch(['module' /*js*/], function(m) {
    // ...
});
```

As implied by the above snippet, dynafetch is used with
[d<sup>3</sup>s](#dynamic-dependency-declarations) because the variable name
assigned to the dynafetch module is arbitrary and therefore cannot be reliably
parsed by dynapack.


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

Oftentimes, a module and its dependencies is a pretty big chunk of javascript and
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
individually. Surely, we shouldn't download the same modules twice!

A fourth
bundle is suggested by the intersection of the modules specific to pages 1 and
2 (the small purple triangle).  Now, when a client *initially* visits page 1,
it downloads the green (top) triangle, red (left) trapezoid, and small (purple)
triangle; and when it visits page 2, it downloads the green (top) triangle,
blue (right) trapezoid, and small (purple) triangle.  If a client
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


`home.js`: The homepage requires jQuery and Backbone, statically.

```js
var $ = require('jquery');
var backbone = require('backbone');
module.exports = '<h1>Homepage!</h1>';
```

`not-found.js`: The 404 page requires jQuery, statically.

```js
var $ = require('jquery');
module.exports = '<h1>404: Not found</h1>';
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


# License

MIT
