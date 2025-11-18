#! /usr/bin/bash

REGISTRY_URL="https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry"
MY_DIR=$(dirname $0)

# if $1 is empty use the current directory as target
if [[ -z "$1" ]]; then
    TARGETDIR=$(pwd)
else
    TARGETDIR="$1"
fi

if [ -d "${TARGETDIR}" ] ; then
    echo "Target ${TARGETDIR} is a directory";
else
    echo "Target ${TARGETDIR} is not a directory exiting..."
    exit 1
fi

TARGET_DATA_FILE="${TARGETDIR}/language-subtag-registry.data.txt"
TARGET_JSON_FILE="${TARGETDIR}/language-subtag-registry_{type}.json"

wget -O $TARGET_DATA_FILE $REGISTRY_URL
./${MY_DIR}/registry-to-json.js $TARGET_DATA_FILE $TARGET_JSON_FILE
