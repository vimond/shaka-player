#!/bin/bash
#
# Copyright 2014 Google Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

dir=$(dirname $0)/..
. "$dir"/build/lib-vup-commonjs.sh

set -e

name=
arguments=
function argsHelper() {
  local arg=$1
  local choices=
  shift

  while [[ $# -ne 0 ]]; do
    if [[ $1 == $arg ]]; then
      arguments="$arguments -D shaka.features.$2=false"
      return 0
    fi
    choices="$choices [$1]"
    shift 2
  done

  if [[ -z $name ]] && [[ $arg != -* ]]; then
    name=$arg
  else
    # There is an extra space at the beginning of $choices
    echo "Usage: build.sh$choices [name]"
    exit 1 # Exit here
  fi
}

# This was the old name.
rm -f "$dir"/lib.js{,.map}

# These are the new names.
rm -f "$dir"/shaka-player.commonjs.{js,map}

# Compile once with app/controls.js so they get checked.  Don't keep the output.
(library_sources_0; closure_sources_0) | compile_0 \
  $arguments \
  --summary_detail_level 3 "$dir"/{app,controls,sender,receiver,receiverApp,appUtils}.js > /dev/null
# NOTE: --js_output_file /dev/null results in a non-zero return value and
# stops execution of this script.

# Compile without app/controls.js and output the minified library only.
# Including shaka-player.uncompiled makes sure that nothing gets stripped which
# should be exported.  Otherwise, things unused internally may be seen as dead
# code.
(library_sources_0; closure_sources_0) | compile_0 \
  $arguments \
  "$dir"/shaka-player.uncompiled.js \
  --js_output_file "$dir"/shaka-player.commonjs.js



