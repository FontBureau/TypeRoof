#! /usr/bin/env bash

# download the CSS from the google fonts API
API_CSS_URL="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=add,arrow_forward,chevron_right,delete,drag_pan,format_align_center,format_align_left,format_align_right,info,keyboard_arrow_down,keyboard_arrow_up,keyboard_double_arrow_left,keyboard_double_arrow_right,menu,pause,place_item,play_arrow,refresh,remove,swap_vert"

# extract the actual font URL
SUBSET_FONT_URL=


# Download the font and save it as LOCAL_FONT_FILE
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
LOCAL_FONT_FILE=$SCRIPT_DIR/MaterialSymbolsOutlinedSubset.woff2
