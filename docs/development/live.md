
link to
 https://fontbureau.github.io/TypeRoof/live/README/


The principal idea is that TypeRoof does not need to know the particular
implementation details on how to collect the information about changed
fonts. It only provides an interface by listening to events created by [window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
when it was opened as a PopUp by another web page. These other web pages
do the specific work of identifying font changes and sending them to TypeRoof,
in here they are called **adapter**. An adapter could be a font editor
itself or connect to one by other means.

In these examples are two **adapters** with different mechanisms to identify
font changes and to pass them along to TypeRoof Documentation

 * `adapter-websocket-to-typeroof.html` uses repeated HTTP-GET calls to a
   simple local webserver and detects font changes by looking at the
   `Last-Modified` header.
 * `adapter-polling-to-typeroof.html` connects to a local Websocket server
   that monitors the file system and pushes change events only when necessary.

This is rather intended as a demo but

 In the former case, point the web-socket server in Part 1 to the
directory you are saving your font under and skip Part 3.



This demos two implementation options to get changed font files updated
in TypeRoof, both have advantages and disadvantages:
