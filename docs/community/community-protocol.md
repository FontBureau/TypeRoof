---
title: Community Protocol (Work in Progress)
author: Lasse Fister
eleventyNavigation:
  key: community
  title: Community Protocol (WIP)
  order: 1
---

# {{ title }}

> **Work in progress.** This protocol is itself a [Proposal](#inception):
> a starting point for a community, not a finished rulebook. Several
> parts are deliberately left open (see [Open questions](#open-questions)),
> and the rest is open for discussion. Join the [protocol thread](https://forum.typeroof.org/t/community-protocol/11).

TypeRoof aspires to be foundational **type tooling infrastructure**, and
our strongest asset is our community. This section outlines the principles
that guide how we collaborate and gather.

## Three Pillars

This protocol rests on three pillars to create a warm, welcoming, and
inclusive space and software we can all stand behind. You can also read
[the thinking behind this protocol](../community-protocol-thinking).

### 1. Contributor Experience

We want you to learn, explore different roles, and feel proud of what you
bring to the table. Whether you are sharing a domain idea or experiment in
the [Inception phase](#inception), writing mentored code in the
[Incubation phase](#incubation), or launching and maintaining a custom
[distribution](#distribution), you are free to contribute at your own pace
and shift roles whenever it suits you. We are also glad to have you if you
are just along for the ride in our [community forum](https://forum.typeroof.org).

### 2. Trust

We elevate the value of contributions and the ecosystem by backing
raw ideas and AI-assisted prototypes with honest human curation and
architectural mentoring. Trust in our software is earned by putting in
the work, communicating transparently, and adhering to the public quality
standards of each distribution. Trust between people is earned the same
way: in [Inception](#inception), by giving every Proposal an honest hearing
and keeping its trail visible when it grows into a feature; in
[Incubation](#incubation), where Builders and Maintainers come to understand
the code they ship, and each other; and in [Distribution](#distribution),
where Maintainers earn the trust of their users through steady curation
and care—while users always remain free to choose another distribution.

### 3. FLOSS

We ensure permanent architectural freedom with no black boxes and no vendor
lock-in. Everyone has the four freedoms to run, study, modify, and
redistribute TypeRoof on their own terms. The core is licensed under the
permissive **Apache 2.0** license: in an era where AI makes code abundant
and easy to replicate, code itself may no longer be the scarce asset worth
guarding, so we choose to keep it frictionless to adopt and build on.
Distributions may choose their own license—and ideally, improvements still
flow back to the core. What we protect instead is what cannot be cloned:
trust, human connection, and mutual growth.

## Who is Behind This

TypeRoof is developed and stewarded by [**Strong Type Systems GmbH**](https://strong-type.systems),
founded by Lasse Fister in Germany. The company maintains the shared
core—the tech stack that distributions build on and exchange features
through—and has applied to register TypeRoof as a trademark (EUIPO,
registration pending).

We state this openly because the protocol asks you to trust people, and
that starts with knowing who is accountable. The company's role is to
keep the core stable, interoperable, and freely available under Apache 2.0,
and to run the reference distributions. It does not control other
distributions, and it cannot take back what has been released: the four
freedoms guarantee that TypeRoof outlives any single steward, including
us. Contributions to the core are accepted under a Developer Certificate
of Origin (DCO), not a contributor license agreement: contributors keep
their copyright and everything released under Apache 2.0 stays available
under Apache 2.0—no one, including us, can take that back.

The trademark application exists to protect users, not to fence in the
code. Once registered, it ensures that "TypeRoof" means what users expect
it to mean. Any distribution may describe itself factually as "built on
TypeRoof" or "for TypeRoof". Beyond that, the naming policy is still being
worked out; until it is published, please ask before using the TypeRoof
name as part of a distribution's own name.

Strong Type Systems sustains this work through consulting, commissioned
feature development, paid Incubation (where a client's own developer builds
a feature as a mentored Builder), and sponsorship. Commissioned features
meet the same standards as any other contribution to the core or distribution.

## Three-Phase Contribution Flow

We aim to be open to any kind of contribution and participation, and from
there create a path to develop both reliable, trustworthy software and
self-determined community actors.

### Inception

An open sandbox where [Catalysts](#catalysts-inception)—users, domain experts, developers,
and vibe-coders—can share **Proposals** ranging from raw ideas, insights, and
sketches to quick hacks and rough prototypes. Inception lowers the pressure of
contributing and celebrates the human spark as our primary unit of value. This
is an exciting and creative playground to hang out in!

Each Proposal lives in a [dedicated forum thread](https://forum.typeroof.org/c/inception/6)
where the community can discuss, clarify, and flesh it out into a candidate
for [Incubation](#incubation). Not every Proposal will be picked up or
accepted by a distribution—and that is completely normal, never a personal
rejection.

Not everything needs to go through Inception: bug fixes and
small improvements go directly to a [distribution](#distribution).

### Incubation

Incubation is where a **Proposal** is mentored into production-ready features
for a specific [distribution](#distribution). This phase is pull-based:
each distribution chooses which Proposals it would like to incubate. Because
each distribution defines its own standards, this phase begins either when
a distribution's [Maintainers](#maintainers-distribution) select a promising Proposal from
Inception or when they issue a **"Call for Incubation"** to attract a
[Builder](#builders-incubation) for a needed feature.

The **Maintainers** and the **Builder** jointly define the success criteria
and work through mentored reviews across one or more PR cycles. Afterward,
other distributions are free to pick up the finished feature as-is or run
their own incubation phase to adapt and refine it to their own criteria.

### Distribution

Multiple autonomous distributions can operate side by side on their own terms,
optimizing their collection of features, quality standards, and presentation
for distinct target profiles. This gives **Maintainers** full freedom and
system-level mastery while offering users specialized flavors of TypeRoof.
Distributions that keep FLOSS licenses compatible with Apache 2.0 and the
shared TypeRoof tech stack can seamlessly interoperate and exchange features.

Each distribution is free to define its own internal structure, release
criteria, and workflows—including traditional feature-branch and pull-request
workflows for direct contributions. Within this protocol, anyone speaking and
acting on behalf of a distribution is considered a **Maintainer**.

## Roles

Contributors can move fluidly between roles depending on how they want to
participate at any given moment:

### Catalysts (Inception)

**Catalysts** drive ideation, experimentation, and rapid prototyping in the
[Inception](#inception) phase. They may be domain experts—type designers,
typographers, script and language experts—outlining domain logic, users
articulating needs, or coders and vibe-coders sharing rough proofs-of-concept.
This role values openness, curiosity, and creative momentum: it allows
contributors to share boundary-pushing **Proposals** without taking on the
commitment of long-term maintenance or strict architectural compliance.

### Builders (Incubation)

**Builders** bridge the gap between a raw **Proposal** and production-ready
software during [Incubation](#incubation). Teaming up with a distribution or
answering a "Call for Incubation", they collaborate with **Maintainers** to
engineer, refine, and document a feature until it meets the distribution's
standards. This role enacts craftsmanship and follow-through—delivering solid,
dependable features without requiring the contributor to take on the ongoing
governance of a distribution.

### Maintainers (Distribution)

**Maintainers** steward trust, architecture, and stability within a
[Distribution](#distribution). They define their distribution's standards,
mentor **Builders** during Incubation, review contributions, and care for
releases and production environments. This role calls for diligence,
architectural care, and fair curation—serving as the anchor of reliability
across the ecosystem.

## Open Questions

These are the parts we have deliberately left open. Each is an invitation
to contribute—bring a Proposal to the forum. For now, Strong Type Systems
stewards this document and merges changes to it.

- **Conduct and moderation.** How we treat each other, and what happens when
  that fails. Until defined, the forum's house rules apply.
- **Incubation lifecycle.** What happens when an incubation stalls, a Builder
  steps away, or Builder and Maintainers disagree on success criteria.
- **AI-assisted contributions.** Disclosure, provenance, and sign-off.
  Distributions and individuals decide for themselves; the core will publish
  its own policy as a reference. The core should add a supplementary sign-off
  alongside the DCO, along these lines:  "If you used AI tools, you certify
  that you have reviewed and understand the contribution and that, to your
  knowledge, it does not incorporate code under an incompatible license."
- **Upstream flow from copyleft distributions.** How features developed under
  a copyleft license find their way back to the Apache 2.0 core.

