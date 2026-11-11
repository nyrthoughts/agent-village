#!/bin/zsh
# usage: shoot.sh <html-relative> <query> <w> <h> <out.png>
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
F="$PWD/prototype/$1"
"$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --virtual-time-budget=4000 --window-size=$3,$4 --screenshot="$PWD/visuals/$5" "file://$F?$2" 2>/dev/null
