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

- [Documentation -- Landing Page](https://fontbureau.github.io/TypeRoof/docs)
- [User Kit -- Getting Started and Usage](https://fontbureau.github.io/TypeRoof/docs/usage)
- [Developer Kit -- Contributing and Customization](https://fontbureau.github.io/TypeRoof/docs/development)

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

TypeRoof uses a modern development setup with [Vite](https://vitejs.dev/) for the shell application and [Eleventy](https://www.11ty.dev/) for documentation. The development servers are configured to work together seamlessly.

### Prerequisites

You need Node.js installed. Then install the dependencies:

```sh-session
$ ~/TypeRoof> npm ci
```

### Development Commands

**For full development (recommended):**

```sh-session
# Start both shell and documentation servers
$ ~/TypeRoof> npm run dev

# Then go to: http://localhost:3000/TypeRoof/
# - TypeRoof Shell: http://localhost:3000/TypeRoof/shell.html
# - Documentation: http://localhost:3000/TypeRoof/docs/
```

**For shell development only:**

```sh-session
# Start only the Vite development server for the shell
$ ~/TypeRoof> npm run dev:app

# Then go to: http://localhost:3000/TypeRoof/shell.html
# (Documentation routes will show a helpful "not available" message)
```

**For documentation development only:**

```sh-session
# Start only the Eleventy development server
$ ~/TypeRoof> npm run dev:doc

# Then go to: http://localhost:8080/TypeRoof/docs/
```

### Legacy Development Method

If you prefer a simple file server approach, TypeRoof (legacy) can still be served directly:

```sh-session
# Using Python's built-in server
$ ~/TypeRoof> python3 -m http.server 8000
# Then go to: http://localhost:8000/legacy.html

# Using Node.js http-server (if installed globally)
$ ~/TypeRoof> npx http-server
# Then go to: http://localhost:8080/legacy.html
```

## Build the complete static site locally

The [static website](https://fontbureau.github.io/TypeRoof/) (served via GitHub Pages) is built using both [Vite](https://vitejs.dev/) for the shell application and [Eleventy](https://www.11ty.dev/) for documentation.

### Build Commands

**Build everything (recommended):**

```sh-session
# Build both shell application and documentation
$ ~/TypeRoof> npm run build

# The complete site will be created in the `_site` directory
# This includes:
# - Optimized shell application (from Vite)
# - Generated documentation (from Eleventy)
```

**Build individual parts:**

```sh-session
# Build only the shell application (creates `dist/` directory)
$ ~/TypeRoof> npm run build:app

# Build only the documentation (creates `_site/` directory)
$ ~/TypeRoof> npm run build:doc
```
