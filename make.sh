#!/usr/bin/sh

CURRENT_DIR=$(pwd)
SCRIPT_DIR=$(cd $(dirname $0); pwd)
cd $SCRIPT_DIR/src

for_beta () {
	v=$(grep -e '"version": ".*beta"' manifest.json)
	echo $v
	if [ -n "$v" ]; then
		sed -e 's/beta//' -e 's/@/_beta@/' manifest.json > manifest.json.beta
		mv -f manifest.json.beta manifest.json
		sed -e 's/#afc639/#9059ff/' icon64.svg > icon64.svg.beta
		mv -f icon64.svg.beta icon64.svg
		cat icon64.svg
	fi
}

# Backup manifest.json and icon
mv manifest.json manifest_firefox.json
cp -p icon64.svg ../icon64_backup.svg

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

# Restore manifest.json and icon
mv -f manifest_firefox.json manifest.json
mv -f ../icon64_backup.svg icon64.svg

cd $CURRENT_DIR

