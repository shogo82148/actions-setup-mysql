#!/bin/bash

MYSQL_VERSION=$1

set -eux
mkdir -p working
cd working

# download MySQL souce
curl -sSL "https://github.com/mysql/mysql-server/archive/mysql-$MYSQL_VERSION.tar.gz" -o mysql.tar.gz
tar zxvf mysql.tar.gz

mkdir build
cd build
cmake "../mysql-server-mysql-$MYSQL_VERSION" -DDOWNLOAD_BOOST=1 -DWITH_BOOST=../boost
make "-j$(nproc)"
