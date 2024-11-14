---
title: live/README
eleventyNavigation:
  parent: Developer Kit
  key: live/README
  order: 0.1
---

# Serve Live Font Changes to TypeRoof

This is an example implementation to showcase how TypeRoof can live update
fonts that have changed e.g. within a font editor or on your hard-drive.
The idea is for font editors to pick this up and to provide the feature
built in for their users.

For font editor implementers or if you are interested in technical details,
see the technical documentation at: [Developer Kit -- Live font changes](https://fontbureau.github.io/TypeRoof/docs/development/live)

If your font editor does not yet implement font updates in TypeRoof directly
or if you just want to try it out in another scenario you can use these
scripts to **monitor fonts in a local folder/directory on your computer** and
send update messages to TypeRoof, the [Run with WebSocket](#run-with-websocket) example is better suited
for this case, as the polling example has cross-orign limitations and the
polling adapter reqiures a (hard-coded) list of known file names to poll.


## Install

You need to do this only in order to use the `websocket-font-update-server.py`
and `file_rotation.py` scripts.

This installation procedure recommends to use a python virtual environment
in order to keep the system/user python installation unaffected.

```sh-session
# Initialize a python virtual environmnet in the TypeRoof/live directory.
$ ~/path/to/TypeRoof/live> python3 -m venv venv
$ (venv)~/path/to/TypeRoof/live>

# Activate the virtual environment.
$ ~/path/to/TypeRoof/live> . venv/bin/activate
$ (venv)~/path/to/TypeRoof/live>

# Install the dependencies into the virtual environment.
$ (venv)~/path/to/TypeRoof/live> pip install -r requirements.txt
```

## Adapters Usage

In order to connect any source of font changes and TypeRoof we load a
web-page, called an **Adapter,** that in turn opens TypeRoof as a
pop-up. That relation enables the usage of the `window.postMessage` API
to send messages with font updates from the Adapter to TypeRoof.

At the first time you open an adapter pop-ups will be blocked in your browser.
You'll have to **allow pop-ups and then reload the page of the adapter** again
to successfully establish the connection.

In the window of the adapter page you'll also be able to observe the
currently provided fonts and how they change.

## Run with WebSocket

There are two or three individual steps involved:

 * [WebSocket Part 1: Server](#websocket-part-1-server)
 * [WebSocket Part 2: Adapter](#websocket-part-2-adapter)
 * (optionally) [Part 3: File Rotation](#part-3-file-rotation)

### WebSocket Part 1: Server

This will start a WebSocket-server at `ws://localhost:8765/` where the
page `adapter-websocket-to-typeroof.html` (see  [Part 2](#websocket-part-2-adapter))
can connect to.

You'll need a directory to observe for font-changes, to test this, go to
[Part 3: File Rotation](#part-3-file-rotation) first and run the file
rotation which will create the `fonts` directory.

```sh-session
# With the activated virtual environment.

$ (venv)~/path/to/TypeRoof/live> ./websocket-font-update-server.py fonts/
```

### WebSocket Part 2: Adapter

See [Adapters Usage](#adapters-usage).

#### A: Using `file:///`

It's actually possible to open `adapter-websocket-to-typeroof.html` without
a local web-server directly from disk with a `file://`.

Open `file:///home/username/path/to/TypeRoof/live/adapter-websocket-to-typeroof.html`
(you need to change the path or open the file from your file manager) in you browser.

#### B: Using a Local Web-Server

Alternatively, you can start a simple web-server to deliver the file:

```sh-session
# You don't need the virtual environment for this

$ ~/path/to/TypeRoof/live> python3 -m http.server 8000
Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...
```

Open [http://0.0.0.0:8000/adapter-websocket-to-typeroof.html](http://0.0.0.0:8000/adapter-websocket-to-typeroof.html)
in your browser.

#### C: Use the online Adapter

The adapter is also online at our web site and since WebSockets don't
require special cross-site allowance, the online adapter should be able
to connect to the server started in [WebSocket Part 1: Server](#websocket-part-1-server).

Open [https://fontbureau.github.io/TypeRoof/live/adapter-websocket-to-typeroof/](https://fontbureau.github.io/TypeRoof/live/adapter-websocket-to-typeroof/)
in your browser.

## Run with Polling

There are two or three individual steps involved:

 * [Polling Part 1: Server](#polling-part-1-server)
 * [Polling Part 2: Adapter](#polling-part-2-adapter)
 * (optionally) [Part 3: File Rotation](#part-3-file-rotation)

### Polling Part 1: Server

Start a simple web-server. NOTE: there are cross-origin restrictions involved
with this technique, which is why the adapter and the polling must come
from the same origin or the server would have to send [Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
headers.

```sh-session
# You don't need the virtual environment for this

$ ~/path/to/TypeRoof/live> python3 -m http.server 8000
Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...
```

### Polling Part 2: Adapter

See [Adapters Usage](#adapters-usage).

Since the web server is already started you only need to open [http://0.0.0.0:8000/adapter-polling-to-typeroof.html](http://0.0.0.0:8000/adapter-polling-to-typeroof.html)
in your browser.

The main purpose of this adapter is to serve as an example, thus there
are some assumptions hard-coded into this adapter:

 * The fonts are located at 'http://0.0.0.0:8000/fonts/'
 * Looking for one font only called `live-font.ttf`

You can change these assumptions in the JavaScript of the adapter, but
for general usage the [Run with WebSocket](#run-with-websocket) example
might be working out of the box.



See [All Adapters Usage](#adapters-usage).

## Part 3: File Rotation

This is optional as a demo. To observe file changes created e.g. by a
font-editor, Part 1 and Part 2 are  sufficient.

If you don't have a source directory for a changing font file that you want
to see updated in TypeRoof, i.e. a font updated by an editor or build process,
this script can "rotate" all font files from a source directory into a single
file in a target directory and thus trigger file-change events.

```sh-session
# With the activated virtual environment.

# Rotate the files in "../lib/assets/fonts/*" as "live-font.ttf" in "the"
# ./fonts directory every two seconds. NOTE especially the `-f` flag
# that is meant as safeguard to prevent accidental change to essential
# data.
$ (venv)~/path/to/TypeRoof/live> ./file_rotation.py -f -s 2 -t live-font.ttf ./fonts/ ../lib/assets/fonts/*

# There's an online help in the tool:
$ (venv)~/path/to/TypeRoof/live>  ./file_rotation.py
usage: file_rotation.py [-h] [-t TARGET_FILE_NAME] [-f] [-s SECONDS] target_dir source_files [source_files ...]

Rotate font files between target dir and the source directories.

positional arguments:
  target_dir            Target directory name, will be created. Use --force if it exist and its contents can be overridden.
  source_files          Paths to each source files. Each file path will function as a source for the contents in target dir in rotation.

options:
  -h, --help            show this help message and exit
  -t TARGET_FILE_NAME, --target-file TARGET_FILE_NAME
                        Target file name, must not contain the slash character"/" (default: SampleFont.ttf)
  -f, --force           If target_dir exists, allow to change its contents.
  -s SECONDS, --seconds SECONDS
                        number of seconds between rotations (default: 7)
```
