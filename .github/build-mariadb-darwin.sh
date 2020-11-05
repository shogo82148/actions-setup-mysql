#!/bin/bash

set -e

MARIADB_VERSION=$1
OPENSSL_VERSION=1_1_1h
ROOT=$(cd "$(dirname "$0")" && pwd)
: "${RUNNER_TEMP:=$ROOT/working}"
: "${RUNNER_TOOL_CACHE:=$RUNNER_TEMP/dist}"
PREFIX=$RUNNER_TOOL_CACHE/mariadb/$MARIADB_VERSION/x64

# detect the number of CPU Core
JOBS=$(sysctl -n hw.logicalcpu_max)

mkdir -p "$RUNNER_TEMP"
cd "$RUNNER_TEMP"
rm -rf ./*

# with MariaDB 5.5.x, use bundled SSL Library
# so, skip installing OpenSSL
if [[ ! ${MARIADB_VERSION} =~ ^5[.]5[.] ]]; then
    # system SSL/TLS library is too old. so we use custom build.
    echo "::group::download OpenSSL source"
    (
        set -eux
        cd "$RUNNER_TEMP"
        curl -sSL "https://github.com/openssl/openssl/archive/OpenSSL_$OPENSSL_VERSION.tar.gz" -o openssl.tar.gz
    )
    echo "::endgroup::"

    echo "::group::extract OpenSSL source"
    (
        set -eux
        cd "$RUNNER_TEMP"
        tar zxvf openssl.tar.gz
    )
    echo "::endgroup::"

    echo "::group::build OpenSSL"
    (
        set -eux
        cd "$RUNNER_TEMP/openssl-OpenSSL_$OPENSSL_VERSION"
        ./Configure --prefix="$PREFIX" darwin64-x86_64-cc
        make "-j$JOBS"
        make install_sw
    )
    echo "::endgroup::"
fi

echo "::group::download MariaDB source"
(
    set -eux
    cd "$RUNNER_TEMP"
    curl -sSL "https://downloads.mariadb.com/MariaDB/mariadb-$MARIADB_VERSION/source/mariadb-$MARIADB_VERSION.tar.gz" -o mariadb-src.tar.gz
)
echo "::endgroup::"

echo "::group::extract MariaDB source"
(
    set -eux
    cd "$RUNNER_TEMP"
    tar zxvf mariadb-src.tar.gz
)
echo "::endgroup::"

echo "::group::build MariaDB"
(
    WITH_SSL=$PREFIX

    if [[ ${MARIADB_VERSION} =~ ^5[.]5[.] ]]; then
        # with MariaDB 5.5.x, use bundled SSL Library
        WITH_SSL=bundled
    fi

    set -eux
    cd "$RUNNER_TEMP"
    mkdir build
    cd build

    # use GCC instead of Clang
    # old version of MariaDB can't be built with Clang
    export CC=gcc-9
    export CXX=g++-9

    cmake "../mariadb-$MARIADB_VERSION" \
        -DDOWNLOAD_BOOST=1 -DWITH_BOOST=../boost \
        -DCMAKE_INSTALL_PREFIX="$PREFIX" \
        -DWITH_SSL="$WITH_SSL" -DPLUGIN_TOKUDB=NO -DPLUGIN_MROONGA=NO -DPLUGIN_SPIDER=NO -DPLUGIN_OQGRAPH=NO -DPLUGIN_PERFSCHEMA=NO -DPLUGIN_SPHINX=NO -DPLUGIN_ARCHIVE=NO -DPLUGIN_ROCKSDB=NO
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

    tar Jvcf "$RUNNER_TEMP/mariadb.tar.xz" .
)
echo "::endgroup::"
