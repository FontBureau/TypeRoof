#! /usr/bin/env bash

# Download the CSS from the Google Fonts API.
# A Chrome user-agent is required — Google returns a single variable woff2
# for modern browsers, but falls back to per-weight truetype for older agents.

ICON_NAMES=(
    add
    arrow_forward
    chevron_right
    delete
    drag_pan
    format_align_center
    format_align_left
    format_align_right
    format_bold
    format_clear
    format_italic
    info
    keyboard_arrow_down
    keyboard_arrow_up
    keyboard_double_arrow_left
    keyboard_double_arrow_right
    menu
    pause
    place_item
    play_arrow
    refresh
    remove
    swap_vert
    toggle_on
    toggle_off
    edit
    edit_off
    open_in_full
)
# Join the array elements using a comma, must be sorted alphabetically
ICON_NAMES_ARGUMENT=$(IFS=$'\n';sorted=($(sort <<<"${ICON_NAMES[*]}"));IFS=,;echo "${sorted[*]}")

API_CSS_URL="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=$ICON_NAMES_ARGUMENT"
CHROME_UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

echo "API CSS URL: $API_CSS_URL"

# Extract the woff2 URL from the CSS url(...) declaration
SUBSET_FONT_URL=$(curl -s -A "$CHROME_UA" "$API_CSS_URL" \
    | sed -nE 's|.*url\((https://[^)]+)\).*|\1|p')

if [ -z "$SUBSET_FONT_URL" ]; then
    echo "ERROR: Could not extract font URL from Google Fonts API response." >&2
    exit 1
fi

echo "Font URL: $SUBSET_FONT_URL"

# Download the font and save it as LOCAL_FONT_FILE
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
LOCAL_FONT_FILE=$SCRIPT_DIR/MaterialSymbolsOutlinedSubset.woff2

curl -s -o "$LOCAL_FONT_FILE" "$SUBSET_FONT_URL"
echo "Saved to: $LOCAL_FONT_FILE"
