#! /usr/bin/env python3

import sys
import argparse
from pathlib import Path
from time import sleep
from shutil import copyfile

FONT_FILE_SUFFIXES = ('.ttf', '.otf', '.woff', '.woff2')
TARGET_FILE_NAME = 'SampleFont.ttf'

def rotate(source_file, target_dir_path, target_file_name=TARGET_FILE_NAME):
    for file_path in target_dir_path.iterdir():
        if not file_path.is_file(): continue
        file_path.unlink()

    file_path = Path(source_file)
    if not file_path.is_file():
        print('skio rotate', file_path.name, 'is not a file')
        return False
    suffix = file_path.suffix
    if suffix not in FONT_FILE_SUFFIXES:
        print('skip rotate' ,file_path.name, 'is not suffixed by any of', *FONT_FILE_SUFFIXES)
        return False
    target_path = target_dir_path.joinpath(target_file_name)
    print('copy' ,file_path.name, '->', target_path.name)
    copyfile(file_path, target_path)
    return True

def main(source_files, target_dir, seconds, force, target_file_name=TARGET_FILE_NAME):
    print(f'sources_files {source_files}, target_dir {target_dir}, '
          f'seconds {seconds}, force {force}')

    target_dir_path = Path(target_dir)
    target_dir_path.mkdir(parents=True, exist_ok=force)

    while True:
        for source_file in source_files:
            print(f'rotating to {source_file}')
            rotated = rotate(source_file, target_dir_path, target_file_name)
            if rotated:
                sleep(seconds)

def valid_file_name(name):
    if '/' in name:
        raise argparse.ArgumentTypeError(f'File name must not contain a slash but name is: {name}')
    if '.' == name or '..' == name:
        raise argparse.ArgumentTypeError(f'File name must not be "." or ".." but name is: {name}')
    return name

if __name__ == '__main__':
    argument_parser = argparse.ArgumentParser(
        description='Rotate font files between'
                ' target dir and the source directories.')

    argument_parser.add_argument('target_dir',
        help='Target directory name, will be created. Use --force if it exist '
             'and its contents can be overridden.')

    argument_parser.add_argument('source_files', nargs='+',
        help='Paths to each source files. Each file path will function'
             ' as a source for the contents in target dir in rotation.')

    argument_parser.add_argument('-t','--target-file', dest='target_file_name',
        type=valid_file_name,
        default=TARGET_FILE_NAME,
        help=f'Target file name, must not contain the slash character"/" (default: {TARGET_FILE_NAME})')

    argument_parser.add_argument('-f', '--force', action='store_true',
        help='If target_dir exists, allow to change its contents.')

    DEFAULT_SECONDS=7
    argument_parser.add_argument('-s','--seconds', dest='seconds', type=int,
        default=DEFAULT_SECONDS,
        help=f'number of seconds between rotations (default: {DEFAULT_SECONDS})')

    args = argument_parser.parse_args()
    main(**vars(args))

