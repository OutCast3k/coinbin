#!/usr/bin/env bash

# How to create hashes:
# 1. run the command with 1 argument
#   1) the version number of the site
#
# Example:
# ./hash_tools/create_hashes.sh 1.4
#
# Will result in a new sha256sum file

echo "---- Version $1 $(date +%Y.%m.%d) ---" > sha256sum
FILES="$(find ./* -type f ! -name sha256sum ! -path './sigs/*' ! -path './pubkeys/*')"
shasum -a 256 $FILES >> sha256sum
