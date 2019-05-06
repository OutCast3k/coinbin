#!/usr/bin/env bash

# How to sign:
# 1. run the command with 3 arguments
#   1) the version number of the site
#   2) the shortid of the gpg key you wish to sign with
#   3) the github username you are signing on behalf (this isn't checked)
#
# Example:
# ./hash_tools/sign_hashes.sh 1.4 3A971908 junderw
#
# Will result in a new sha256sum file and a new file in sigs folder called
# sha256sum.junderw.3A971908.asc

echo "---- Version $1 $(date +%Y.%m.%d) ---" > sha256sum
FILES="$(find ./* -type f ! -name sha256sum ! -path './sigs/*' ! -path './pubkeys/*')"
OUTPUTFILE="./sigs/sha256sum.$3.$2.asc"
PUBKEYFILE="./pubkeys/pubkey.$3.$2.asc"
shasum -a 256 $FILES >> sha256sum
mkdir -p sigs
mkdir -p pubkeys

gpg -a --export $2 > $PUBKEYFILE
echo "$(cat $PUBKEYFILE | grep -ve '^Version\|^Comment')" > $PUBKEYFILE

gpg -u $2 -a --detach-sign --yes -o $OUTPUTFILE ./sha256sum
echo "$(cat $OUTPUTFILE | grep -ve '^Version\|^Comment')" > $OUTPUTFILE
