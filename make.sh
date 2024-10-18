#!/usr/bin/sh

CURRENT_DIR=$(pwd)
SCRIPT_DIR=$(cd $(dirname $0); pwd)
# manifest_firefox
cd $SCRIPT_DIR/src
zip -r ../simple-gesture.zip * -x "manifest_*.json"
cd ..
mv -f simple-gesture.zip simple-gesture.xpi

# for Kiwi browser
# manifest_chrome
cd $SCRIPT_DIR/src
mv manifest.json manifest_firefox.json
mv manifest_chrome.json manifest.json
rm -f ../simple-gesture-chrome.zip
zip -r ../simple-gesture-chrome.zip * -x "manifest_*.json"
mv manifest.json manifest_chrome.json
mv manifest_firefox.json manifest.json

cd $CURRENT_DIR

