#!/bin/bash

set -e

MARIADB_VERSION=$1
OPENSSL_VERSION=1_1_1i
ROOT=$(cd "$(dirname "$0")" && pwd)
: "${RUNNER_TEMP:=$ROOT/working}"
: "${RUNNER_TOOL_CACHE:=$RUNNER_TEMP/dist}"
PREFIX=$RUNNER_TOOL_CACHE/mariadb/$MARIADB_VERSION/x64

# detect the number of CPU Core
JOBS=$(nproc)

mkdir -p "$RUNNER_TEMP"
cd "$RUNNER_TEMP"
rm -rf ./*


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
    ./Configure --prefix="$PREFIX" linux-x86_64
    make "-j$JOBS"
    make install_sw
)
echo "::endgroup::"


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
    set -eux
    cd "$RUNNER_TEMP"
    mkdir build
    cd build
    cmake "../mariadb-$MARIADB_VERSION" \
        -DDOWNLOAD_BOOST=1 -DWITH_BOOST=../boost \
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

    tar Jvcf "$RUNNER_TEMP/mariadb.tar.xz" .
)
echo "::endgroup::"
