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

*Duration **4:40** m:s*

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

*Duration  **15:08** m:s*

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
 * The font file [DecovarAlpha-VF.ttf](https://github.com/googlefonts/decovar/raw/refs/heads/master/fonts/DecovarAlpha-VF.ttf)
   (link to the [GitHub Repository of Decovar](https://github.com/googlefonts/decovar))
 * State: [decovar-specimen.json.txt](/docs/states_lib/demos/decovar-specimen.json.txt)

*Duration **4:34** m:s*

https://www.youtube.com/watch?v=5AY1KnkSOcI

## Layout: Stage and Actors

The concepts of actors on a stage, "Key-Moments", and inheritance of
property values are central to the animation capabilities of TypeRoof
Shell. The Layout "Stage and Actors" represents a unified interface that
exposes all possibilities under that structure; meanwhile, a Layout like
"Videoproof Array V2" intentionally provides a streamlined interface to
specific aspects of the animation model. Some complexity is inherent
because of the generic nature of the "Stage and Actors" Layout. The UI is
intentionally under-designed, presenting another complication; this is a
part of the explorative nature of the development process, and subsequent
iterations will improve this.

### Lesson 04: Create a Simple Animation.

In this lesson, we create a simple animation of one "Line of Text" actor
from the ground up, step by step, and learn the basics of working with
Key-Moments.

#### Required Links:

 * [TypeRoof Shell](/shell)
 * State: [Lesson-Create_a_Simple_Animation-hello_goodbye.json.txt](/docs/states_lib/demos/Lesson-Create_a_Simple_Animation-hello_goodbye.json.txt)

*Duration **25:14** m:s*

https://youtu.be/T3-Vn3eBfEE

### Lesson 05: Animate Color

As a starting point, this lesson uses a state that can be understood and
created with the knowledge of the previous lesson. We explore the aspects
of color animation in a Horror/Halloween-styled specimen of Decovar,
traversing from its "Regular" style to its "Mayhem" style.

#### Required Links:

 * [TypeRoof Shell](/shell)
 * The font file [DecovarAlpha-VF.ttf](https://github.com/googlefonts/decovar/raw/refs/heads/master/fonts/DecovarAlpha-VF.ttf)
   (link to the [GitHub Repository of Decovar](https://github.com/googlefonts/decovar))
 * Initial State: [Lesson-Animate_Color-decovar-necrovar.json.txt](/docs/states_lib/demos/Lesson-Animate_Color-decovar-necrovar.json.txt)
 * Final State: [decovar-necrovar.json.txt](/docs/states_lib/demos/decovar-necrovar.json.txt)

*Duration **21:43** m:s*

 https://youtu.be/zzYhSBy9vNw

### Lesson 06: Property Propagation and Inheritance

The value of a property can be set explicitly at any Key-Moment. If it's
not set directly in a Key-Moment, but in one or more Key Moments in the
same actor, the value is defined by those Key-Moments. A property that is
set explicitly by only one Key Moment in the entire local timeline of an
actor has that value throughout the whole timeline and is not affected by
possible other Key-Moments that don't set that property explicitly. At
least two Key-Moments in the same timeline must set an explicit value to
animate a property. A property not defined in a local actor timeline
inherits its value from a parent actor timeline if defined there. Parent
actors are container types, like the "Layer" or the root container "Stage."
Some properties are not inherited, e.g., "x," "y," and "background color."
These apply directly to the container. If a property is not defined in a
parent actor and thus can't be inherited, its value is the default value.
Variable fonts define default axis-locations, while the app's source code
defines other property defaults.

#### Required Links:

 * [TypeRoof Shell](/shell)
 * The font file [DecovarAlpha-VF.ttf](https://github.com/googlefonts/decovar/raw/refs/heads/master/fonts/DecovarAlpha-VF.ttf)
   (link to the [GitHub Repository of Decovar](https://github.com/googlefonts/decovar))
 * State: [decovar-specimen.json.txt](/docs/states_lib/demos/decovar-specimen.json.txt)

*Duration **20:29** m:s*

 https://youtu.be/XFk47ceAPZU

### Time Control

## Layout: Videoproof
