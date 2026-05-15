#!/usr/bin/sh

XPI_NAME=simple-gesture
CURRENT_DIR=$(pwd)
SCRIPT_DIR=$(cd $(dirname $0); pwd)
cd $SCRIPT_DIR/src

# Backup manifest.json
mv manifest.json manifest_firefox.json

# Firefox
cp -p manifest_firefox.json manifest.json
zip -r ../$XPI_NAME.zip * -x "manifest_*.json"
mv -f ../$XPI_NAME.zip ../$XPI_NAME.xpi

# Firefox Beta
sed \
	-e 's/"version": "\(.*\)"/"version": "\1"\, "version_name": "\1 beta"/' \
	-e 's/\("id": ".*\)@/\1_beta@/' \
	-e 's/\("strict_min_version"\): ".*"/\1: "140.0"/' \
	manifest_firefox.json > manifest.json
zip -r ../$XPI_NAME-beta.zip * -x "manifest_*.json"
mv -f ../$XPI_NAME-beta.zip ../$XPI_NAME-beta.xpi

# Chrome
cp -p manifest_chrome.json manifest.json
for_beta
zip -r ../$XPI_NAME-chrome.zip * -x "manifest_*.json"
crx pack ./ -o ../$XPI_NAME-chrome.crx

# Restore manifest.json
mv -f manifest_firefox.json manifest.json

cd $CURRENT_DIR

