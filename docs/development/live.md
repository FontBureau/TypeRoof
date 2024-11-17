---
title: Live Font Updates
eleventyNavigation:
  parent: Developer Kit
  key: Live
  title: Live Font Updates
  order: 0
---

# {{title}}

This is documenting the API how to show live font updates directly
in TypeRoof. For a demo have a look at [live/README](/live/README/),
the code for the demo is located at the [TypeRoof GitHub](https://github.com/FontBureau/TypeRoof/tree/main/live).

## Concept

The principal idea is that TypeRoof should not need to know the implementation
details on how to collect information about updated fonts. It rather provides
a public interface by listening to events created by [window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
**when it was opened as a pop-up/iframe by another web page**. This way
issues with the [same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)
or possibly authentication are avoided and TypeRoof must not be changed
to work with new providers of live font updates who wish to offer
TypeRoof to their users. For providers of font updates, this means TypeRoof
does not need to be packaged by them and will not create a maintenance burden.

### Viable Usage Scenarios

 * A browser based font editor (e.g. Fontra?) can open TypeRoof in a new
   window and push updated fonts directly to TypeRoof. In that case no extra
   `Adapter` is required at all.
 * A native font editor (e.g. Glyphs, FontLab) can start a local web server
   or WebSocket server and open an `Adapter` in the browser of the user.
   The Adapter knows how to receive font updates from the editor and passes
   messages along to TypeRoof, which it opened in a new window or directly
   in an iframe.
 * Any web site, e.g. of a foundry or retailer, that has access to the binary
   data of a font file can open it for proofing, inspection, type setting,
   etc. in TypeRoof.
 * Without direct support of an editor, a user could have a program
   watch the file system for changes and update the font in TypeRoof when
   it is saved to disk.

## The Live Fonts Protocol — Version 1.0

The role of TypeRoof will be called `Receiver` in the following.

The purpose of this protocol is to send live font updates to a web application,
referred to as the `Receiver`, running in a web browser. The sources of these
font updates, hereafter called `Source`, and the mechanisms for loading font
data into the browser can be manifold. Therefore, there is no straightforward
path to enable this directly in the `Receiver`. The component that connects the
`Source` to the `Receiver` is called the `Adapter`. This is a web page running in
the browser with a specific implementation to receive data from the Source.

### Connect `Adapter` and `Receiver`

The principal mechanism to connect the `Adapter` to the `Receiver` is the
web standard [`window.postMessage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage]).

In order to establish a connection between `Adapter` and `Receiver` the
`Adapter` has to create the `window` of the `Receiver` in the example
implementations (see [live/README](/live/README/)) we explore two approaches
for this **pop-up/new tab** and **iframe**.

#### pop-up/new tab

 * Uses the [`window.open`](https://developer.mozilla.org/en-US/docs/Web/API/Window/open]) method to load the `Receiver`.
 * In the `Receiver` the `Adapter` is accessed using the [`window.opener`](https://developer.mozilla.org/en-US/docs/Web/API/Window/opener) property.
 * The `Adapter` stays open as an extra tab, it could implement a user interface e.g. to spawn and manage different `Receivers` for the same `Source`.

#### iframe

  * Creates an [`iframe`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe]) to load the `Receiver`.
  * In the `Receiver` the `Adapter` is accessed using the [`window.parent`](https://developer.mozilla.org/en-US/docs/Web/API/Window/parent) property.
  * The `Adapter` can create a seamless user experience, disappearing visually by displaying the `iframe` full screen in the foreground.

### Messages

There are only two types of messages exchanged between `Adapter` and `Receiver`.

#### Message Type: `init-live-fonts`

 * This message is sent from the `Receiver` to the `Adapter`.
 * It's purpose is to establish the protocol and signal readiness to receive
   `font-update` messages.
 * The `Adapter` will answer with [`font-update`](@message-type-font-update)
   messages for each current font it is already aware of and then keep
   sending messages for new and updated fonts.

##### The Message Format

The  value of the `message` argument is simply the string `"init-live-fonts"`.

##### In the sending `Receiver`

To obtain `adapterWindow` see [Connect `Adapter` and `Receiver`](#connect-adapter-and-receiver).

The value of the `targetOrigin` is `"*"` which means the `Receiver` accepts
any origin as an `Adapter`. The value of the message does not contain any
payload data beyond the message type string, thus it is not possible to leak
data with this message.

```js
const adapterWindow = window.opener || window.parent;
adapterWindow.postMessage('init-live-fonts', '*');
```

##### In the listening `Adapter`

There are two checks to verify the received message and to accept the subscription.

The expected  `event.origin` is known by the `Adapter` as it opened the `Receiver`
page itself, any other origin is rejected.

The `event,data` must be the string `"init-live-fonts"` , any other value
is rejected.

If those checks are passed the `Receiver` is subscribed. The Adapter should
immediately send [`font-update`](@message-type-font-update) messages for
all known fonts and subsequently, at any time, the same message type for
each new and updated font.

```js
const expectedOriginURL = 'https://fontbureau.github.io'
  , sendUpdatesTo = new Set()
    // keys are the value of `metadata.fullName` in the message.
  , lastMessages = new Map()
  ;
window.addEventListener('message', event=> {
    if(event.origin !== expectedOrigin) {
        return;
    }
    if(event.data !== 'init-live-fonts') {
        return;
    }

    // subscribe
    sendUpdatesTo.add(event.source);
    // immediately send the current font states
    for(const lastMessage of lastMessages.values())
        event.source.postMessage(lastMessage, {targetOrigin: expectedOriginURL});
});
```

#### Message Type: `font-update`

 * This message is sent from the `Adapter` to the `Receiver`.
 * It's only sent after the `Receiver` subscribed to the `Adapter` with
   the [`init-live-fonts`](@message-type-init-live-fonts) message.

##### The Message Format

The message is an object with three keys `{type, metaData, fontBuffer}`;

* **`type`** the string `"font-update"`
* **`metData`** is an object with three keys `{name, version, fullName}`
    * **`metData.name`** a string with the name of the font to be displayed
      to the user. It should have a reasonable length for user interfaces,
      but so far there are no explicit restrictions.
    * **`metData.version`** a string with the version of the font to be
      displayed to the user. It should have a reasonable length for user interfaces,
      but so far there are no explicit restrictions.
    * **`metaData.fullName`** a string acting as a key, It must be unique
      for the font and all of its subsequent updates. It also must be acceptable
      as a [CSS `<family-name>` value](https://www.w3.org/TR/css-fonts-4/#family-name-value).
      This means at least that words must start with `[A-Z][a-z]`, can contain
      `[A-Z][a-z][0-9]-_` and are separated by spaces ` `. There may be
      more rules to it (Link anyone?).
* **`fontBuffer`** an instance of [`ArrayBuffer`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer)
with the binary data of the font file.

##### In the sending `Adapter`

The adapter must make sure it only sends messages to origins it trusts,
as this message can contain sensitive user owned data.

The means on how the `Adapter` collects the data for the message are not
part of this protocol.

```js
const expectedOriginURL = 'https://fontbureau.github.io';
  , message = {
        type: 'font-update'
      , metData: {
            name: 'Creepster Flex'
          , version: 'Live'
          , fullName: 'Creepster FLex Live'
        }
      , fontBuffer: creepsterFlexBinaryData
    }
  ;
receiverWindow.postMessage(message, expectedOriginURL);
```

##### In the listening `Receiver`

If the receiver did not open another window itself it can expect the
message is coming from its own `window.parent` or `window.opener` otherwise
it should check `event.source`.

The values for `message.fontBuffer` and `message.metaData` must be checked
and applied by subsequent processing in the `Receiver`.

```js
const adapterWindow = window.opener || window.parent;
window.addEventListener('message', event=> {
    if(event.source !== adapterWindow) {
        return;
    }
    const {type, fontBuffer, metaData} = event.data;
    if(type !== 'font-update') {
        return;
    }
    loadFontFromMessage(fontBuffer, metaData);
}
```

## About Adapters

See the examples in [live/README](/live/README/) for `Source`
and `Adapter` implementations and possible interaction patterns.

## Security Considerations

This section raises awareness for some topics of data security. The Live
Fonts Protocol describes how `Adapters` should handle the `Receiver` origin
however, the `Source` sending data to the `Adapter` can be affected if it
is crafted unaware.

### Cross-Site WebSocket Hijacking

There's no Same-Origin-Policy in the browsers for WebSockets, instead,
the server is responsible for checking if the requesting origin is acceptable.
Without checking the origin, a **local** (running on the machine that also
runs the browser) WebSocket server would send out the fonts data to any
website asking for it, that in turn could pass the data along and thus
leak it. A scenario for that concern is: the user has a local WebSocket
server running; they visit a malicious website that covertly connects to
the WebSocket in order to obtain copies of e.g. a private/commercial/in
progress font project. The data would have been leaked.

Our [WebSocket server example](live/README/#websocket-part-1-server) **is
safe** against this kind of attack: accepted local origins with any port
combination are `http://localhost`, `http://127.0.0.1` and `http://0.0.0.0`;
we also accept the origin of the project website `https://fontbureau.github.io/`
as we know it's not leaking data as it Is **controlled by us and open
source software**.

### Authentication

If a WebSocket server or web server that hosts private files and is connected
to the open internet or another open/insecure network, it should
authenticate and authorize the requesting clients and also use secure
connections. The details of this go far beyond the scope of this document.
