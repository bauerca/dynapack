![Logo](https://raw.githubusercontent.com/bauerca/dynapack/master/assets/logo.png)

Dynapack is a javascript module bundler and client-side loader that
solves the following problem. Given a dependency graph of *static* and
*dynamic* dependencies, construct a set of module bundles such that

- the number of bundles is minimized,
- each module exists in only one bundle,
- a client request for a dynamic dependency, *D*, returns only the
  static dependencies of *D* (recursively),
- a module (bundle) is sent to a client only once (per session), and
- bundles connected by static dependencies are sent in parallel.

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

This situation should lead to *4 bundles*, one for each module.
If a client possesses module **a** and
requests **b**, it should receive **b** and **d**. However, if it instead
requests **c**, it should receive **c** and **d**. Moreover, if a client requests
**b** *then* **c**, the request for **c** should return *only* **c**.

This example is simplified for explanatory purposes. The RequireJS loader, in
fact, does this, but on the *module* level and *not* in parallel for static
dependencies (AFAIK). Dynapack handles the dynamic dependency diamond in the
general case on the *bundle* level.

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
var ensure = require('node-ensure');

// This is a dynamic dependency declaration.
var __m = './big-module' /*js*/;

// This resembles the CommonJS Modules/Async/A proposal.
ensure([__m], function(err) {
  // Now we can require the module.
  var m = require(__m);
});
```

See https://github.com/bauerca/node-ensure for documentation on node-ensure.

# Installation

```
> npm install dynapack
```

There is also a command-line interface; installing it globally
(`npm install -g dynapack`) will get you the `dynapack` command.

# Usage

- [Dependency syntax](#dependency-syntax)
- [API](#api)
- [Command line](#command-line)

## Dependency syntax

The current version of dynapack supports only Node-style syntax for static
dependencies and only [dynamic dependency
declarations](#dynamic-dependency-declaration) with
[node-ensure](https://github.com/bauerca/node-ensure) for dynamic dependencies.
The following is a brief overview.

### Static

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

### Dynamic

Dynamic dependencies are dependencies that should be loaded/executed only under
certain conditions. This type of dependency is relevant in the browser
environment, where the downloading and execution of modules takes up precious
user time. A dynamic dependency that is not needed to display a page does not need
to be downloaded, and therefore does not contribute to the page load wait.

#### Dynamic dependency declaration

Dynapack supports a new syntax called a *dynamic dependency declaration* (d<sup>3</sup>):

```js
var __bm = './big-module' /*js*/;
```

where the important part of the above is the `<string> /*js*/` combination.  A
d<sup>3</sup> informs dynapack that the decorated string literal is in fact a
path to a module whose source (plus the sources of all of its static dependencies)
should be downloaded on demand at the discretion of the app (using
[node-ensure](https://github.com/bauerca/node-ensure)).

The advantage of a d<sup>3</sup> is that it is recognized *anywhere* in module
code (whereas other bundlers recognize dependency strings only as arguments to
`require` calls or similar, which binds the dependency name to the function
call).

(I like to use the double underscore for a d<sup>3</sup> variable because of
its similarity to `__filename` and `__dirname` in Node, but you can use
whatever).

#### node-ensure

Dynapack relies on [node-ensure](https://github.com/bauerca/node-ensure),
a dead simple library that provides an
asynchronous dependency loading protocol similar to the CommonJS 
[Modules/Async/A](http://wiki.commonjs.org/wiki/Modules/Async/A) spec proposal.

It differs from the spec, though, so that things *just work* in Node.js.

```js
var ensure = require('node-ensure');
var __superagent = 'superagent' /*js*/;

ensure([__superagent], function(err) {
  var request = require(__superagent);

  // ...
});
```

## API

Configuration options and defaults are:

```js
var packer = new Dynapack({
  entries: undefined, // required!
  output: './bundles',
  prefix: '/',
  bundle: true,
  dynamicLabels: 'js',
  builtins: require('browserify/lib/builtins'),
  globalTransforms: []
});
```

Use the instance like this:

```js
packer.run(function(err, bundles) {
  // Inspect the bundle contents.
  console.log(bundles);
  
  packer.write(function(err, entries) {
    // Use the entry-point/bundles maps to serve web-pages and
    // bundles.
    console.log(entries);
  });
});
```

### Configuration

Passed to the Dynapack constructor.

#### entries {String|Array&lt;String&gt;|Object&lt;String, String&gt;}

This option is the only required option and must identify the (client-side)
entry point(s) of the app to bundle. The different allowed formats will
affect only the ouput of the [write()](#writecallback) method.

A string is given when there is only one
app entry point (e.g. "single-page" apps); an array is given when there are
many. Alternatively, a mapping between custom ids and entry point paths will
replace the auto-generated ids used by default by 
[write()](#writecallback).

For example, when entries is `'./client.js'`, the write method would return
something like:

```js
{
  "./client.js": [
    "./bundles/entry.0.js",
    "./bundles/a.js"
  ]
}
```

whereas an entries like `{app: './client.js'}` would produce:

```js
{
  "app": [
    "./bundles/entry.0.js",
    "./bundles/a.js"
  ]
}
```

#### output {String}

The default value is `"./bundles"`. This is where bundle files are saved.

#### prefix {String}

This is the prefix under which javascript files will be served. This does
not have to be the same host that serves the app; it could be a CDN somewhere, in
which case, include the hostname in the prefix.

Should end with a slash. The default is '/'.

#### bundle {Boolean}

Defaults to `true`.

Set to `false` when developing and debugging. If false, Dynapack will treat
each module as a "bundle" but otherwise act the same (as far as async loading
in the browser is concerned). Browser loading of js will be much slower,
however, since the number of "bundles" will skyrocket. Worth it.

#### dynamicLabels {String|Array&lt;String&gt;}

Defaults to `'js'`. This option permits changing the syntax of the comment
part of a d<sup>3</sup>.

#### builtins

Defaults to `require('browserify/lib/builtins')`. See
[Browserify](http://browserify.org/) docs.

#### globalTransforms

Defaults to empty array. See
[Browserify](http://browserify.org/) docs.

### Methods

Available on a Dynapack instance.

#### run(callback)

The callback will receive either an error as first argument or the
(fairly low-level) results of the bundling process as second.

#### write(callback)

This should be called after a successful run().
The callback will receive either an error as first argument or information
regarding the bundles that should be embedded in the webpages (HTML) that
deliver each app entry point.



## Command line

```
> dynapack ./client.js
```

where `client.js` is the entry point to the client-side version of your app. The
bundles will be installed in a directory named `bundles/` which is created
alongside `client.js`.

The command outputs the groups of bundles that should be included in the webpage
served for each entry point.


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
