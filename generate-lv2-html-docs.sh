#!/bin/bash

set -e

if [ ! -d mod.lv2 ]; then
  echo "mod.lv2 bundle missing"
  exit
fi

if [ ! -d modgui.lv2 ]; then
  echo "modgui.lv2 bundle missing"
  exit
fi

if (! which lv2specgen.py >/dev/null); then
  echo "lv2specgen.py tool missing"
  exit
fi

lv2specgen.py $(pwd)/mod.lv2/manifest.ttl    /usr/share/lv2specgen/ ../style.css $(pwd)/documentation/mod/index.html    $(pwd)/documentation/mod    "" -i -p mod
lv2specgen.py $(pwd)/modgui.lv2/manifest.ttl /usr/share/lv2specgen/ ../style.css $(pwd)/documentation/modgui/index.html $(pwd)/documentation/modgui "" -i -p modgui
