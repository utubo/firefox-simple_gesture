#!/usr/bin/sh

XPI_NAME=simple-gesture
CURRENT_DIR=$(pwd)
SCRIPT_DIR=$(cd $(dirname $0); pwd)
cd $SCRIPT_DIR/src

# Fix manifest.json for beta
# NOTE: keep strict_min_version for ESR.
for_beta () {
	if [ -n "$MAKE_XPI_BETA" ]; then
		sed \
			-e 's/"version": "\(.*\)"/"version": "\1"\, "version_name": "\1 beta"/' \
			-e 's/\("id": ".*\)@/\1_beta@/' \
			-e 's/\("strict_min_version"\): ".*"/\1: "140.0"/' \
			manifest.json > manifest.json.beta
		mv -f manifest.json.beta manifest.json
	fi
}

# Backup manifest.json
mv manifest.json manifest_firefox.json

# Firefox
cp -p manifest_firefox.json manifest.json
for_beta
zip -r ../$XPI_NAME.zip * -x "manifest_*.json"
mv -f ../$XPI_NAME.zip ../$XPI_NAME.xpi

# Chrome
cp -p manifest_chrome.json manifest.json
for_beta
zip -r ../$XPI_NAME.zip * -x "manifest_*.json"
mv -f ../$XPI_NAME.zip ../$XPI_NAME-chrome.zip

# Restore manifest.json
mv -f manifest_firefox.json manifest.json

cd $CURRENT_DIR

