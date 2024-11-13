#!/usr/bin/env python

"""
Serve Websocket connection to send message when a font file changes.
"""

import os
import argparse
import asyncio
from pathlib import Path
from typing import Optional
from functools import partial
from contextlib import asynccontextmanager
import json
import struct
import ctypes

import aiofiles

from watchdog.events import FileCreatedEvent, FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from websockets.asyncio.server import serve, broadcast

class FileObserverEventHandler(FileSystemEventHandler):
    def __init__(self, queue: asyncio.Queue, loop: asyncio.BaseEventLoop,
                 *args, **kwargs):
        self._loop = loop
        self._queue = queue
        super(*args, **kwargs)

    def on_any_event(self, event: FileSystemEvent) -> None:
        self._loop.call_soon_threadsafe(self._queue.put_nowait, event)

class FileObserverEventIterator(object):
    def __init__(self, queue: asyncio.Queue,
                 loop: Optional[asyncio.BaseEventLoop] = None):
        self.queue = queue

    def __aiter__(self):
        return self

    async def __anext__(self):
        item = await self.queue.get()

        # maybe the None in the queue will stop this ...
        if item is None:
            raise StopAsyncIteration

        return item


@asynccontextmanager
async def observeFiles(path: Path, queue: asyncio.Queue, loop: asyncio.BaseEventLoop,
          ) -> None:
    # report a message
    print('>entering the observer context manager')
    handler = FileObserverEventHandler(queue, loop)
    observer = Observer()
    # CAUTION: if recursive changes the collection of initial files
    # below will also have to change!
    observer.schedule(handler, str(path), recursive=False)
    observer.start()

    # Add initially existing files
    # NOTE: it seems this has a race condition, but I don't think it's an issue in this context.
    #   https://github.com/gorakhargosh/watchdog/issues/1010#issuecomment-2266193585
    with os.scandir(path) as it:
        for entry in it:
            if not entry.is_file():
                continue;
            filename = os.path.join(path, entry.name)
            event = FileCreatedEvent(filename)
            loop.call_soon_threadsafe(queue.put_nowait, event)

    try:
        yield observer;
    finally:
        # stop observer
        observer.stop()
        observer.join()


class State(object):
    def __init__(self):
        self.subscribers = set()
        self.lastMessages = dict()


async def packageFile(file_path: str):
    """
    Package something like:
    {name: "AmstelvarA2 Roman wght400", version: "Version 0.001", fullName: "from-url AmstelvarA2 Roman wght400 Version_0-001"}
    AND the binary font data
              into the socket event/ into postMessage ...
              well send metaDataJSON.length + metaDataJSON + BINARY DATA

              # 32 bit for integer
              metaDataLengthBits = parseInt(arrBuffer.slice(0,32), 2);
              mataDataBits = arrBuffer.slice(32, 32 + metaDataLengthBits)
              # the rest is the binary
              fileBits = arrBuffer.slice(32 + mataDataBits);
       subscriber.send('update...')
    OnSUBSCRIBE we should always send the last message!
    """
    file_name = os.path.basename(file_path)
    full_name_name = file_name.replace('.', '_')
    version = 'Version 0-live'
    # For font-family words separated by space seem OK but words have
    # to start with A-Za-z. I don't know if there's a definit rule to this!
    full_name_version = version.replace(' ', '_')
    full_name =  f'from-file {full_name_name} {full_name_version}'
    metadata = {'name': file_name, 'version': version, 'fullName': full_name}
    metadata_json = json.dumps(metadata)
    metadata_bytes = metadata_json.encode('utf-8')
    async with aiofiles.open(file_path, mode='rb') as f:
        content_bytes = await f.read()

    metadata_len = len(metadata_bytes)
    content_len = len(content_bytes)
    # Use big-endian uint16 (>H) for metadata_len big-endian is the default
    # for DataView.prototype.getUint16() in Javascript.
    message = struct.pack(f'>H{metadata_len}s{content_len}s', metadata_len, metadata_bytes, content_bytes);
    return message;

async def consumeFileEvents(state: State, queue: asyncio.Queue) -> None:
    async for event in FileObserverEventIterator(queue):
        # Try to keep messages cache updated
        if event.is_directory == True:
            continue;

        # For simplicity 'moved' is handled like 'deleted' + 'created'.
        # FileMovedEvent(src_path='./hello.ttf', dest_path='./goodbye.ttf', event_type='moved', is_directory=False, is_synthetic=False)

        if event.event_type == 'deleted' or event.event_type == 'moved':
            # FileDeletedEvent(src_path='./hello.ttf', dest_path='', event_type='deleted', is_directory=False, is_synthetic=False)
            if event.src_path in state.lastMessages:
                del state.lastMessages[event.src_path]
            # The client doesn't understand this so far, but we could
            # send this as a message

        if event.event_type == 'created'  or event.event_type == 'moved':
            # FileCreatedEvent(src_path='./hello.ttf', dest_path='', event_type='created', is_directory=False, is_synthetic=False)
            path = event.dest_path if event.event_type == 'moved' else event.src_path

            message = await packageFile(path)
            state.lastMessages[path] = message
            # this is a sync call!
            broadcast(state.subscribers, message)

        # We don't handle 'modified' FileModifiedEvent as it seems to
        # duplicate with FileCreatedEvent for this use case.  Maybe this
        # will require better diversification.
        # FileModifiedEvent(src_path='./hello.ttf', dest_path='', event_type='modified', is_directory=False, is_synthetic=False)


async def handleInit(state: State, websocket) -> None:
    for lastMesage in state.lastMessages.values():
        # The "init" event will always answer with the
        # last messages to set the initial client state.
        await websocket.send(lastMesage);

async def handler(state: State, websocket):
    try:
        if websocket not in state.subscribers:
            state.subscribers.add(websocket)
        async for message in websocket:
            event = json.loads(message)
            if event['type'] == 'init':
                await handleInit(state, websocket)
            # We don't handle other events so far.
    finally:
        state.subscribers.remove(websocket);

async def main(observe_path):
    state = State()
    loop = asyncio.get_event_loop()
    queue = asyncio.Queue()

    async with serve(partial(handler, state), "localhost", 8765), \
                observeFiles(Path(observe_path), queue, loop):
        futures = [
            consumeFileEvents(state, queue),
            loop.create_future()  #run forever
        ]
        await asyncio.gather(*futures);

if __name__ == "__main__":
    argument_parser = argparse.ArgumentParser(
        description='Serve Websocket connection to send message when a font file changes.')

    argument_parser.add_argument('observe_path',
        help='Observed directory path all file changes within will be reported to the subscribers.')

    args = argument_parser.parse_args()


    asyncio.run(main(**vars(args)))
