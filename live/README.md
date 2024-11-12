# Serve live font changes to TypeRoof

This is an example implementation to showcase how TypeRoof can live update
fonts that have changed in a local folder/directory. The idea is for font
editors to pick this up and to provide the feature built in for their users.

For font-editor implementers see the technical documentation at: [Developer Kit -- Live font changes](https://fontbureau.github.io/TypeRoof/docs/development/live)

## Use locally

If your editor does not implement this or if you just want to try
it out. In the former case, point the web-socket server in Part 1 to the
directory you are saving your font under and skip Part 3.

Part 2, the web-server for the  `adapter-ws-to-typeroof.html` file,
could be built into the server in Part 1 but one reason for this
is to demonstrate the different roles that are required to make the
updates in TypeRoof work and therefore this has a strong separation.
Let us know if a stand-alone, one stop script, is desirable for you
[in the issue tracker](https://github.com/FontBureau/TypeRoof/issues).


## Install

This installation procedure recommends to use a python virtual environment
in order to keep the system/user python installation unaffected.

```
# Initialize a python virtual environmnet in the TypeRoof/live directory.
$ ~/path/to/TypeRoof/live > python3 -m venv venv
(venv) $ ~/path/to/TypeRoof/live >

# Activate the virtual environment.
$ ~/path/to/TypeRoof/live > . venv/bin/activate
(venv) $ ~/path/to/TypeRoof/live >

# Install the dependencies into the virtual environment.
(venv) $ ~/path/to/TypeRoof/live > pip install -r requirements.txt
```

## Run

You will need up to three terminal windows to run the separate parts:

### Part 1: The web-socket server observing font file changes.

This will start a web socket server at `ws://localhost:8765/` where the
page `adapter-ws-to-typeroof.html` (see Part 2) can connect to.

You'll need a directory to observe for font-changes for this. Maybe, to
simply test this, go to step 3 first and run the file rotation.

```
# With the activated virtual environment.

(venv) $ ~/path/to/TypeRoof/live > ./websocket-font-update-server.py .fonts/
```


### Part 2: a simple web-server for `adapter-ws-to-typeroof.html`

In order to connect between the web-socket — or any other source of font changes —
and TypeRoof we load a web-site that in turn opens TypeRoof as a popup. That
relation enables the usage of the `window.postMessage` API to send messages
to TypeRoof.

```
# You don't need the virtual environment for this

$ ~/path/to/TypeRoof/live > python3 -m http.server
Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...
```

Open [http://0.0.0.0:8000/adapter-ws-to-typeroof.html](http://0.0.0.0:8000/adapter-ws-to-typeroof.html)
in your browser. NOTE: the port number (`8000`) and maybe IO-adress may
differ in your instance, look at the information given by the command.

This will connect to the web-socket server and open TypeRoof as a PopUp
(you'll have to allow that in your browser and maybe reload the page again).
In the window of the `adapter-ws-to-typeroof.html` page you'll also be
able to observe the currently provided fonts and how they change.

You'll have to select the font/fonts that is/are updated in TypeRoof
yourself once.

### Part 3: `file_rotation.py`

This is optional as a demo. To observe file changes created e.g. by a
font-editor, Part 1 and Part 2 are  sufficient.

If you don't have a source directory for a changing font file that you want
to see updated in TypeRoof, i.e. a font updated by an editor or build process,
this script can "rotate" all font files from a source directory into a single
file in a target directory and thus trigger file-change events.

```
# With the activated virtual environment.

# Rotate the files in "../lib/assets/fonts/*" as "live-font.ttf" in "the"
# ./.fonts directory every two seconds. NOTE especially the `-f` flag
# that is meant as safeguard to prevent accidental change to essential
# data.
(venv) $ ~/path/to/TypeRoof/live > ./file_rotation.py -f -s 2 -t live-font.ttf ./.fonts/ ../lib/assets/fonts/*

# There's an online help in the tool:
(venv) $ ~/path/to/TypeRoof/live >  ./file_rotation.py
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





