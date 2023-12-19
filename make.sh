#!/usr/bin/sh

SCRIPT_DIR=$(cd $(dirname $0); pwd)
cd $SCRIPT_DIR/src
zip -r ../simple-gesture.zip *
cd ..
mv -f simple-gesture.zip simple-gesture.xpi

