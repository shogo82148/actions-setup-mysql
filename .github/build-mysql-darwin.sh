#!/bin/bash

set -e

MYSQL_VERSION=$1
OPENSSL_VERSION=1_1_1q
ROOT=$(cd "$(dirname "$0")" && pwd)
: "${RUNNER_TEMP:=$ROOT/working}"
: "${RUNNER_TOOL_CACHE:=$RUNNER_TEMP/dist}"
PREFIX=$RUNNER_TOOL_CACHE/mysql/$MYSQL_VERSION/x64

# detect the number of CPU Core
JOBS=$(sysctl -n hw.logicalcpu_max)

mkdir -p "$RUNNER_TEMP"
cd "$RUNNER_TEMP"

ACTION_VERSION=$(jq -r '.version' < "$ROOT/../package.json")

# system SSL/TLS library is too old. so we use custom build.
echo "::group::download OpenSSL source"
(
    set -eux
    cd "$RUNNER_TEMP"
    curl --retry 3 -sSL "https://github.com/openssl/openssl/archive/OpenSSL_$OPENSSL_VERSION.tar.gz" -o openssl.tar.gz
)
echo "::endgroup::"

echo "::group::extract OpenSSL source"
(
    set -eux
    cd "$RUNNER_TEMP"
    tar zxf openssl.tar.gz
)
echo "::endgroup::"

echo "::group::build OpenSSL"
(
    set -eux
    cd "$RUNNER_TEMP/openssl-OpenSSL_$OPENSSL_VERSION"

    # patches for fixing https://github.com/openssl/openssl/issues/18720
    patch -s -f -p1 <<PATCH
From f9e578e720bb35228948564192adbe3bc503d5fb Mon Sep 17 00:00:00 2001
From: Gregor Jasny <gjasny@googlemail.com>
Date: Tue, 5 Jul 2022 12:57:06 +0200
Subject: [PATCH] Add missing header for memcmp

CLA: trivial

Reviewed-by: Paul Dale <pauli@openssl.org>
Reviewed-by: Dmitry Belyavskiy <beldmit@gmail.com>
Reviewed-by: Todd Short <todd.short@me.com>
Reviewed-by: Richard Levitte <levitte@openssl.org>
(Merged from https://github.com/openssl/openssl/pull/18719)
---
 test/v3ext.c | 1 +
 1 file changed, 1 insertion(+)

diff --git a/test/v3ext.c b/test/v3ext.c
index 926f3884b138..a8ab64b2714b 100644
--- a/test/v3ext.c
+++ b/test/v3ext.c
@@ -8,6 +8,7 @@
  */
 
 #include <stdio.h>
+#include <string.h>
 #include <openssl/x509.h>
 #include <openssl/x509v3.h>
 #include <openssl/pem.h>
PATCH

    ./Configure --prefix="$PREFIX" darwin64-x86_64-cc
    make "-j$JOBS"
    make install_sw install_ssldirs
)
echo "::endgroup::"

echo "::group::download MySQL source"
(
    set -eux
    cd "$RUNNER_TEMP"
    curl --retry 3 -sSL "https://github.com/mysql/mysql-server/archive/mysql-$MYSQL_VERSION.tar.gz" -o mysql-src.tar.gz
)
echo "::endgroup::"

echo "::group::extract MySQL source"
(
    set -eux
    cd "$RUNNER_TEMP"
    tar zxf mysql-src.tar.gz

    # apply patches
    if [[ -d "$ROOT/../patches/mysql/$MYSQL_VERSION" ]]
    then
        cd "mysql-server-mysql-$MYSQL_VERSION"
        cat "$ROOT/../patches/mysql/$MYSQL_VERSION"/*.patch | patch -s -f -p1
    fi
)
echo "::endgroup::"

echo "::group::build MySQL"
(
    set -eux
    cd "$RUNNER_TEMP"
    mkdir build
    cd build
    cmake "../mysql-server-mysql-$MYSQL_VERSION" \
        -DCOMPILATION_COMMENT="shogo82148/actions-setup-mysql@v$ACTION_VERSION" \
        -DDOWNLOAD_BOOST=1 -DWITH_BOOST=../boost \
        -DWITH_ROCKSDB_LZ4=OFF -DWITH_ROCKSDB_BZip2=OFF -DWITH_ROCKSDB_Snappy=OFF -DWITH_ROCKSDB_ZSTD=OFF \
        -DWITH_UNIT_TESTS=OFF \
        -DCMAKE_INSTALL_PREFIX="$PREFIX" \
        -DWITH_SSL="$PREFIX"
    make "-j$JOBS"
)
echo "::endgroup::"

echo "::group::install"
(
    set -eux
    cd "$RUNNER_TEMP/build"
    make install
)
echo "::endgroup::"

# archive
echo "::group::archive"
(
    set -eux
    cd "$PREFIX"

    # remove extra files
    rm -rf ./man
    rm -rf ./mysql-test
    rm -rf ./sql-bench

    tar --use-compress-program 'zstd -T0 --long=30 --ultra -22' -cf "$RUNNER_TEMP/mysql.tar.zstd" .
)
echo "::endgroup::"
