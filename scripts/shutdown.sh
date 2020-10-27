#!/usr/bin/env bash

set -eux

PID=$1
kill -TERM "$PID" || exit 0
wait -n "$PID" || exit 0
