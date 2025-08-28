---
title: Landing Page
eleventyNavigation:
  key: Documentation
  title: Landing Page
---

# TypeRoof Documentation

Discover the main sections of the TypeRoof Documentation:

* [User Kit -- Getting Started and Usage](/docs/usage)
* [Developer Kit -- Contributing and Customization](/docs/development)
* The project [README](/README)
* The project [GitHub Repository](https://github.com/fontbureau/TypeRoof)


## About TypeRoof

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

<iframe
    src="/app/player#[autoplay]from-url:/TypeRoof/docs/states_lib/demos/zooming.json.txt"
    width="60%"
    style="aspect-ratio: 1/1"
    allowfullscreen="true"
    ></iframe>

## Applications

### [TypeRoof Shell](/shell)

The shell provides infrastructure to enable all types of type centered
tooling for proofing, specimen creation, type setting and it features
animation capabilities build with variable fonts in mind.


### Stand Alone Player

The video at the top of this article is embedded using the iframe code below:

```
<iframe
    src="/app/player#[autoplay]from-url:/TypeRoof/docs/states_lib/demos/zooming.json.txt"
    width="60%"
    style="aspect-ratio: 1/1"
    allowfullscreen="true"
    ></iframe>
```

**NOTE:** between `[]` before `from-url:` flags can be passed to change the
default behavior of the player. Available flags so far are `no-chrome` and
`screengrab`, which are mutually exclusive, and `autoplay` and `autopause`
which are also mutually exclusive.

* `screengrab` hides the chrome when the mouse is not moved even when in
paused mode, to make it possible to take screenshots when the video is
not playing. The default is that the chrome is hidden while playing when
the mouse is not moved, but the

* `no-chrome` turns off the visibility of the user interface with no way
 to turn it back on. This is intended for automated video generation, e.g.
 have a look at `/scripts/create-clip-frames`.

* `autoplay` plays the video regardless of the setting in the loaded state.
The default is to to use the loaded state value for playing.

* `autopause` pauses the video regardless of the setting in the loaded state.
The default is to to use the loaded state value for playing.


### [TypeRoof Legacy](/legacy) (Video Proof and Variable Type Tools)

The last (and final) version that has evolved from Video Proof and Variable
Type Tools before the TypeRoof Shell was developed. Eventually the Shell
will absorb all Layouts (Tools) that are present in this app and make this
instance obsolete.
