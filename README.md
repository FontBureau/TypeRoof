# TypeRoof README

TypeRoof is type tooling infrastructure. It provides type proofing applications,
initially based on Video Proof and Variable Type Tools. Now it also explores
the world of general animation with type as a principal actor.

TypeRoof is intended as a host for all kinds of type related tools, providing
advanced methods of resource loading (i.e. fonts, data files) saving and
restoring state etc. -- features which ad-hoc developed tools
typically miss out, as they are hard to do right on limited time.

TypeRoof is Free/Libre Open Source Software and web based, build mainly with
vanilla JavaScript and a few specialized dependencies. We are looking for
a community of users and developers who are interested in shaping its future.

## Directions

* [Documentation -- Landing Page](https://fontbureau.github.io/TypeRoof/docs)
* [User Kit -- Getting Started and Usage](https://fontbureau.github.io/TypeRoof/docs/usage)
* [Developer Kit -- Contributing and Customization](https://fontbureau.github.io/TypeRoof/docs/development)

### [TypeRoof Shell](https://fontbureau.github.io/TypeRoof/shell)

The shell provides infrastructure to enable all types of type centered
tooling for proofing, specimen creation, type setting and it features
animation capabilities build with variable fonts in mind.

### [TypeRoof Legacy](/legacy) (Video Proof and Variable Type Tools)

The last (and final) version that has evolved from Video Proof and Variable
Type Tools before the TypeRoof Shell was developed. Eventually the Shell
will absorb all Layouts (Tools) that are present in this app and make this
instance obsolete.

## How to build and run locally (for development)

You don't need to build TypeRoof, it is created using vanilla JavaScript and
[JavaScript Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules). You can serve TypeRoof directly from the project root directory:

```
#  E.g. using the Python-3 builtin web-server.
$ ~/TypeRoof> python3 -m http.server 8000
Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...

# Then go to: http://0.0.0.0:8000/shell.html

# OR use https://www.npmjs.com/package/http-server (installing globally)
$ ~/TypeRoof> npm install -g http-server
$ ~/TypeRoof> http-server
Starting up http-server, serving ./

http-server version: 14.1.1

[...]

Available on:
  http://127.0.0.1:8080
  http://192.168.178.87:8080

# Then go to: http://localhost:8080/shell

# OR, maybe you want to use the Eleventy built-in development server
# which is ideal to write documentation. See the next section.
```


## Build the complete static site locally

The static web-site at https://fontbureau.github.io/TypeRoof/ (served via GitHub pages)
is build using [Eleventy](https://www.11ty.dev/). See the [documentation of Eleventy](https://www.11ty.dev/docs/)
for more specific usage.

```
# You requires Node.js and must install the dependencies first:
$ ~/TypeRoof> npm install

# We use eleventy to build the static web site:
$ ~/TypeRoof> npx @11ty/eleventy

# The resulting site has been created in the `_site` directory.

# You can also use the live updating development server:

$ ~/TypeRoof> npx @11ty/eleventy --serve
[...]
[11ty] Copied [xxx] Wrote [xxx] files in 0.75 seconds (v3.0.0)
[11ty] Watching…
[11ty] Server at http://localhost:8080/

# Then go to: http://localhost:8080/shell
# Or go to: http://localhost:8080/shell

```
