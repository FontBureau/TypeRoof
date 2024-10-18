---
title: User Kit
eleventyNavigation:
  parent: Documentation
  key: User Kit
  title: User Kit
  order: 1
---

# TypeRoof User Kit

TypeRoof is in an early stage of development; the Graphical
User interface so far is made to provide comprehensive control over the
program state to develop and demonstrate its capabilities. The design
still needs to catch up to create a good user experience.
Here's a series of videos explaining the principal concepts of the
current UI. We're looking for users interested in joining the
project to make it a good animation, proofing, and typesetting tool.

## Getting Started

A couple of prepared "states" (JSON formatted text files) that can load
into TypeRoof Shell are under [States Library/demos](/docs/states_lib/demos).
This tutorial uses these states, along with lesson videos, to demonstrate
how to use TypeRoof-Shell in its current form.

### Lesson 01: Load and Save State

Let's start with the basic example of how to load (deserialize) a pre-composed
state into the application; this is required to open a state from the
[States Library](/docs/states_lib) to, e.g., watch it as a video or to
evaluate a font proof. As a preview, the lesson will go a bit deeper and
change some details of the loaded state — an animation made in the "Stage
and Actors" Layout. Eventually, we will export (serialize) the changed
state, a requirement to, e.g., share it or save it in a file.

#### Required Links:
 * [TypeRoof Shell](/shell)
 * State: [hello_good-bye.json.txt](/docs/states_lib/demos/hello_good-bye.json.txt)
 * More States: [demos/ - States Library](/docs/states_lib/demos/)

https://www.youtube.com/watch?v=XVMaUiL-YGU

### Lesson 02: TypeRoof Overview

Layouts are like small applications based on the TypeRoof platform.
TypeRoof Legacy implements a couple of Layouts that still need to be ported
to the Shell but remain very useful for type proofing. TypeRoof Shell,
on the other hand, has a couple of Layouts that document steps in the
history of recent development but are not very relevant for actual use.
Yet, "Videoproof Array V2" and "Stage and Actors" show the latest
achievements, and as they start to show utility, we will focus the
following lessons on these.

#### Required Links:
 * [TypeRoof Legacy](/legacy)
 * [TypeRoof Shell](/shell)

https://youtu.be/p3STphW0xG4

### Lesson 03: Custom Fonts

Based on the example of a state that uses a custom font, i.e., one not
bundled with TypeRoof, this lesson explores how to load a font from a
file on the user's hard-drive into the app. Custom fonts do not upload to
a server. However, they are stored in the browser's local storage on the user's
machine for repeated use. The lesson also shows how to remove a custom font
from the app again.

#### Required Links:
 * [TypeRoof Shell](/shell)
 * State: [decovar-specimen.json.txt](/docs/states_lib/demos/decovar-specimen.json.txt)
 * The font file [DecovarAlpha-VF.ttf](https://github.com/googlefonts/decovar/raw/refs/heads/master/fonts/DecovarAlpha-VF.ttf)
   (link to the [GitHub Repository of Decovar](https://github.com/googlefonts/decovar))

https://www.youtube.com/watch?v=5AY1KnkSOcI

## Layout: Stage and Actors

The concepts of actors on a stage, "key-moments", and inheritance of
property values are central to the animation capabilities of TypeRoof
Shell. The Layout "Stage and Actors" represents a unified interface that
exposes all possibilities under that structure; meanwhile, a Layout like
"Videoproof Array V2" intentionally provides a streamlined interface to
specific aspects of the animation model. Because of the generic nature of
the "Stage and Actors" Layout, some complexity is inherent. The UI's
intentional under-design presents another complication; this is a part of
the explorative nature of the development process, and subsequent iterations
will improve this.

### Create a simple Animation.

### Property Inheritance

### Time Control

## Layout: Videoproof
