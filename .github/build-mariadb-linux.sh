#!/bin/bash

set -e

MARIADB_VERSION=$1
OPENSSL_VERSION1_1_1=1_1_1w
OPENSSL_VERSION3=3.4.1
ROOT=$(cd "$(dirname "$0")" && pwd)
: "${RUNNER_TEMP:=$ROOT/working}"
: "${RUNNER_TOOL_CACHE:=$RUNNER_TEMP/dist}"

case "$(uname -m)" in
    "x86_64")
        MARIADB_ARCH="x64"
        ;;
    "arm64" | "aarch64")
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
if command -v gcc-14 > /dev/null 2>&1; then
    echo "gcc-14 is available"
    export CC=gcc-14
elif command -v gcc-13 > /dev/null 2>&1; then
    echo "gcc-13 is available"
    export CC=gcc-13
elif command -v gcc-12 > /dev/null 2>&1; then
    echo "gcc-12 is available"
    export CC=gcc-12
elif command -v gcc-11 > /dev/null 2>&1; then
    echo "gcc-11 is available"
    export CC=gcc-11
elif command -v gcc-10 > /dev/null 2>&1; then
    echo "gcc-10 is available"
    export CC=gcc-10
elif command -v gcc-9 > /dev/null 2>&1; then
    echo "gcc-9 is available"
    export CC=gcc-9
fi

if command -v g++-14 > /dev/null 2>&1; then
    echo "g++-14 is available"
    export CXX=g++-14
elif command -v g++-13 > /dev/null 2>&1; then
    echo "g++-13 is available"
    export CXX=g++-13
elif command -v g++-12 > /dev/null 2>&1; then
    echo "g++-12 is available"
    export CXX=g++-12
elif command -v g++-11 > /dev/null 2>&1; then
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

if [[ "$MARIADB_VERSION" =~ ^10\.([89]|[1-9][0-9]+)\.|^1[1-9]\. ]]; then # MariaDB 10.8 or later
    # build OpenSSL v3
    export OPENSSL_VERSION=$OPENSSL_VERSION3
    echo "::group::download OpenSSL 3 source"
    (
        set -eux
        cd "$RUNNER_TEMP"
        curl --retry 3 -sSL "https://github.com/openssl/openssl/archive/openssl-$OPENSSL_VERSION.tar.gz" -o openssl.tar.gz
    )
    echo "::endgroup::"

    echo "::group::extract OpenSSL 3 source"
    (
        set -eux
        cd "$RUNNER_TEMP"
        tar zxf openssl.tar.gz
    )
    echo "::endgroup::"

    echo "::group::build OpenSSL 3"
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
    echo "::group::download OpenSSL 1.1 source"
    (
        set -eux
        cd "$RUNNER_TEMP"
        curl --retry 3 -sSL "https://github.com/openssl/openssl/archive/OpenSSL_$OPENSSL_VERSION.tar.gz" -o openssl.tar.gz
    )
    echo "::endgroup::"

    echo "::group::extract OpenSSL 1.1 source"
    (
        set -eux
        cd "$RUNNER_TEMP"
        tar zxf openssl.tar.gz
    )
    echo "::endgroup::"

    echo "::group::build OpenSSL 1.1"
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
    curl --retry 3 -sSL "https://downloads.mariadb.org/rest-api/mariadb/$MARIADB_VERSION/mariadb-$MARIADB_VERSION.tar.gz" -o mariadb-src.tar.gz
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
    rm -rf ./mariadb-test
    rm -rf ./mysql-test
    rm -rf ./sql-bench

    tar --use-compress-program 'zstd -T0 --long=30 --ultra -22' -cf "$RUNNER_TEMP/mariadb.tar.zstd" .
)
echo "::endgroup::"
