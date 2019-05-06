#!/usr/bin/env bash

# How to verify:
# 1. run the command with one optional argument
#    1) --unsafe   imports pubkeys from the pubkeys folder.
#                  This is unsafe because you should be verifying the pubkeys
#                  Out of band. (ie. from a keyserver etc.)
#
# Example:
# ./hash_tools/verify_hashes.sh
#
# Will say verification success or failed
#
# Note: Please make sure you have imported all gpg public keys out of band.

FILES="$(find ./* -type f ! -name sha256sum ! -path './sigs/*' ! -path './pubkeys/*')"
HASHES="$(shasum -a 256 $FILES)"
COMMITEDHASHES="$(cat sha256sum | grep -v '\-\-\-\-')"
if [ ! "$HASHES" == "$COMMITEDHASHES" ] ; then
  echo "Hash verification failed!!!"
else

  if [ "$1" == "--unsafe" ] ; then
    # import keys from pubkeys folder
    echo "Importing keys from pubkeys folder, this is unsafe..."
    cat ./pubkeys/pubkey.*.asc > ./pubkeys/tmpkeys.asc
    gpg --import ./pubkeys/tmpkeys.asc > /dev/null 2>&1
    rm ./pubkeys/tmpkeys.asc
  fi

  # join sigs for verification
  cat ./sigs/sha256sum.*.asc > ./sigs/tmpsigs.asc

  if gpg --verify ./sigs/tmpsigs.asc sha256sum > /dev/null 2>&1 ; then
    echo "Hash and gpg verification success!!!"
    rm ./sigs/tmpsigs.asc
  else
    echo "gpg verification failed!!!"
    rm ./sigs/tmpsigs.asc
  fi
fi
