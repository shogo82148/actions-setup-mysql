#!/bin/bash

set -e

MARIADB_VERSION=$1
OPENSSL_VERSION1_1_1=1_1_1v
OPENSSL_VERSION3=3.1.2
ROOT=$(cd "$(dirname "$0")" && pwd)
: "${RUNNER_TEMP:=$ROOT/working}"
: "${RUNNER_TOOL_CACHE:=$RUNNER_TEMP/dist}"

case "$(uname -m)" in
    "x86_64")
        MARIADB_ARCH="x64"
        ;;
    "arm64")
        MARIADB_ARCH="arm64"
        ;;
    *)
        echo "unsupported architecture: $(uname -m)"
        exit 1
        ;;
esac
PREFIX=$RUNNER_TOOL_CACHE/mariadb/$MARIADB_VERSION/$MARIADB_ARCH
export LDFLAGS=-Wl,-rpath,$PREFIX/lib

# use latest version of gcc installed
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

# detect the number of CPU Core
JOBS=$(nproc)

mkdir -p "$RUNNER_TEMP"
cd "$RUNNER_TEMP"

ACTION_VERSION=$(jq -r '.version' < "$ROOT/../package.json")

if [[ "$MYSQL_VERSION" =~ ^[1-9][0-9][.]([89]|1[0-9]+)[.] ]]; then # MariaDB 10.8 or later
    # build OpenSSL v3
    export OPENSSL_VERSION=$OPENSSL_VERSION3
    echo "::group::download OpenSSL source"
    (
        set -eux
        cd "$RUNNER_TEMP"
        curl --retry 3 -sSL "https://github.com/openssl/openssl/archive/openssl-$OPENSSL_VERSION.tar.gz" -o openssl.tar.gz
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
        cd "$RUNNER_TEMP/openssl-openssl-$OPENSSL_VERSION"

        ./Configure --prefix="$PREFIX" --openssldir="$PREFIX" --libdir=lib
        make "-j$JOBS"
        make install_sw install_ssldirs
    )
    echo "::endgroup::"
else
    # build OpenSSL v1.1.1
    export OPENSSL_VERSION=$OPENSSL_VERSION1_1_1
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
fi


echo "::group::download MariaDB source"
(
    set -eux
    cd "$RUNNER_TEMP"
    curl --retry 3 -sSL "https://downloads.mariadb.com/MariaDB/mariadb-$MARIADB_VERSION/source/mariadb-$MARIADB_VERSION.tar.gz" -o mariadb-src.tar.gz
)
echo "::endgroup::"

echo "::group::extract MariaDB source"
(
    set -eux
    cd "$RUNNER_TEMP"
    tar zxf mariadb-src.tar.gz

    # apply patches
    if [[ -d "$ROOT/../patches/mariadb/$MARIADB_VERSION" ]]
    then
        cd "mariadb-$MARIADB_VERSION"
        cat "$ROOT/../patches/mariadb/$MARIADB_VERSION"/*.patch | patch -s -f -p1
    fi
)
echo "::endgroup::"

echo "::group::build MariaDB"
(
    set -eux
    cd "$RUNNER_TEMP"
    mkdir build
    cd build
    cmake "../mariadb-$MARIADB_VERSION" \
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

    tar --use-compress-program 'zstd -T0 --long=30 --ultra -22' -cf "$RUNNER_TEMP/mariadb.tar.zstd" .
)
echo "::endgroup::"
