#!/bin/bash

BASE="$(dirname $(readlink $0))"

node -r $(dirname $0)/$BASE/patch $@
