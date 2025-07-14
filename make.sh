#!/usr/bin/sh

CURRENT_DIR=$(pwd)
SCRIPT_DIR=$(cd $(dirname $0); pwd)
cd $SCRIPT_DIR/src

for_beta () {
	v=$(grep -e '"version": ".*beta"' manifest.json)
	if [ -n "$v" ]; then
		sed -e 's/beta//' -e 's/@/_beta@' manifest.json > manifest.json
	fi
}

# Backup manifest.json
mv manifest.json manifest_firefox.json

# Firefox
cp -p manifest_firefox.json manifest.json
for_beta
zip -r ../simple-gesture.zip * -x "manifest_*.json"
mv -f ../simple-gesture.zip ../simple-gesture.xpi

# Chrome
cp -p manifest_chrome.json manifest.json
for_beta
zip -r ../simple-gesture.zip * -x "manifest_*.json"
mv -f ../simple-gesture.zip ../simple-gesture-chrome.zip

# Restore manifest.json
mv -f manifest_firefox.json manifest.json

cd $CURRENT_DIR

