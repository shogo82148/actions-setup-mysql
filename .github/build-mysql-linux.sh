#!/bin/bash

set -e

MYSQL_VERSION=$1
OPENSSL_VERSION=1_1_1s
ROOT=$(cd "$(dirname "$0")" && pwd)
: "${RUNNER_TEMP:=$ROOT/working}"
: "${RUNNER_TOOL_CACHE:=$RUNNER_TEMP/dist}"

case "$(uname -m)" in
    "x86_64")
        MYSQL_ARCH="x64"
        ;;
    "arm64")
        MYSQL_ARCH="arm64"
        ;;
    *)
        echo "unsupported architecture: $(uname -m)"
        exit 1
        ;;
esac
PREFIX=$RUNNER_TOOL_CACHE/mysql/$MYSQL_VERSION/$MYSQL_ARCH

# use latest version of gcc installed
if [[ "$MYSQL_VERSION" =~ ^5[.]6[.] ]]; then
    # I don't know why, but MySQL 5.6.x is not compiled by gcc-11
    if command -v gcc-10 > /dev/null 2>&1; then
        echo "gcc-10 is available"
        export CC=gcc-10
    elif command -v gcc-9 > /dev/null 2>&1; then
        echo "gcc-9 is available"
        export CC=gcc-9
    fi

    if command -v g++-10 > /dev/null 2>&1; then
        echo "g++-10 is available"
        export CXX=g++-10
    elif command -v g++-9 > /dev/null 2>&1; then
        echo "g++-9 is available"
        export CXX=g++-9
    fi
else
    if command -v gcc-11 > /dev/null 2>&1; then
        echo "gcc-11 is available"
        export CC=gcc-11
    elif command -v gcc-10 > /dev/null 2>&1; then
        echo "gcc-10 is available"
        export CC=gcc-10
    elif command -v gcc-9 > /dev/null 2>&1; then
        echo "gcc-9 is available"
        export CC=gcc-9
    fi

    if command -v g++-11 > /dev/null 2>&1; then
        echo "g++-11 is available"
        export CXX=g++-11
    elif command -v g++-10 > /dev/null 2>&1; then
        echo "g++-10 is available"
        export CXX=g++-10
    elif command -v g++-9 > /dev/null 2>&1; then
        echo "g++-9 is available"
        export CXX=g++-9
    fi
fi

# detect the number of CPU Core
JOBS=$(nproc)

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

    ./Configure --prefix="$PREFIX" "linux-$(uname -m)"
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
