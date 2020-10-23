#!/bin/bash

MYSQL_VERSION=$1
ROOT=$(cd "$(dirname "$0")" && pwd)
: "${RUNNER_TEMP:=$ROOT/working}"

set -eux
mkdir -p "$RUNNER_TEMP"
cd "$RUNNER_TEMP"

# download MySQL souce
curl -sSL "https://github.com/mysql/mysql-server/archive/mysql-$MYSQL_VERSION.tar.gz" -o mysql.tar.gz
tar zxvf mysql.tar.gz

# detect the number of CPU Core
JOBS=1
if command -v sysctl > /dev/null; then
    # on macOX
    JOBS=$(sysctl -n hw.logicalcpu_max || echo "$JOBS")
fi
if command -v nproc > /dev/null; then
    # on Linux
    JOBS=$(nproc || echo "$JOBS")
fi

# build
mkdir build
cd build
cmake "../mysql-server-mysql-$MYSQL_VERSION" -DDOWNLOAD_BOOST=1 -DWITH_BOOST=../boost -DCMAKE_INSTALL_PREFIX="$RUNNER_TEMP/dist"
make "-j$JOBS"
make install

# archive
cd "$RUNNER_TEMP/dist"
tar czf "../mysql.tar.gz" .
