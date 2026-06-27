#!/usr/bin/env bash
# Render tools/art-svg/*.svg to public/ PNGs with headless Chrome.
# Symbols → public/symbols/<id>.png (512×512, transparent)
# background.svg → public/background.png (1920×1080)
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SVG="$DIR/art-svg"
OUT="$DIR/../public/symbols"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$OUT"

shoot() { # $1=svg $2=png $3=WxH
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --default-background-color=00000000 \
    --window-size="$3" --screenshot="$2" "file://$1" 2>/dev/null
}

for f in "$SVG"/*.svg; do
  id="$(basename "$f" .svg)"
  case "$id" in
    background) shoot "$f" "$DIR/../public/background.png" "1920,1080" ;;
    mines-bg)   shoot "$f" "$DIR/../public/mines-bg.png" "1920,1080" ;;
    tower-bg)   shoot "$f" "$DIR/../public/tower-bg.png" "1920,1080" ;;
    *)          shoot "$f" "$OUT/$id.png" "512,512" ;;
  esac
  echo "rendered $id"
done
