#!/usr/bin/sh

CUR=$(pwd)
SCRIPT_DIR=$(cd $(dirname $0); pwd)
# manifest_v2
cd $SCRIPT_DIR/src
zip -r ../simple-gesture.zip * -x "manifest_v3.json"
cd ..
mv -f simple-gesture.zip simple-gesture.xpi

# for Kiwi browser
# manifest_v3
cd $SCRIPT_DIR/src
mv manifest.json manifest_v2.json
mv manifest_v3.json manifest.json
zip -r ../simple-gesture-v3.zip * -x "manifest_v2.json"
cd ..
# Kiwi supports .zip instead of .xpi
# mv -f simple-gesture-v3.zip simple-gesture-v3.xpi
cd src
mv manifest.json manifest_v3.json
mv manifest_v2.json manifest.json
cd $CUR

