#!/bin/bash

set -e

MYSQL_VERSION=$1
OPENSSL_VERSION1_1_1=1_1_1w
OPENSSL_VERSION3=3.6.0
ROOT=$(cd "$(dirname "$0")" && pwd)
: "${RUNNER_TEMP:=$ROOT/working}"
: "${RUNNER_TOOL_CACHE:=$RUNNER_TEMP/dist}"

case "$(uname -m)" in
    "x86_64")
        MYSQL_ARCH="x64"
        ;;
    "arm64" | "aarch64")
        MYSQL_ARCH="arm64"
        ;;
    *)
        echo "unsupported architecture: $(uname -m)"
        exit 1
        ;;
esac
PREFIX=$RUNNER_TOOL_CACHE/mysql/$MYSQL_VERSION/$MYSQL_ARCH
export LDFLAGS=-Wl,-rpath,$PREFIX/lib

# use latest version of gcc installed
if [[ "$MYSQL_VERSION" =~ ^5[.]6[.] ]]; then
    # I don't know why, but MySQL 5.6.x is not compiled by gcc-11
    sudo apt-get install gcc-10 g++-10
    export CC=gcc-10
    export CXX=g++-10
else
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
fi

echo "::group::install dependencies"
(
    set -eux
    sudo apt-get update
    sudo apt-get install -y libtirpc-dev libudev-dev
)
echo "::endgroup::"

# detect the number of CPU Core
JOBS=$(nproc)

mkdir -p "$RUNNER_TEMP"
cd "$RUNNER_TEMP"

ACTION_VERSION=$(jq -r '.version' < "$ROOT/../package.json")

# system SSL/TLS library is too old. so we use custom build.

if [[ "$MYSQL_VERSION" =~ ^([1-9][0-9][.]|[89][.]) ]]; then # MySQL 8.0 or later
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
    cd "mysql-server-mysql-$MYSQL_VERSION"
    if [[ -d "$ROOT/../patches/mysql/$MYSQL_VERSION" ]]
    then
        cat "$ROOT/../patches/mysql/$MYSQL_VERSION"/*.patch | patch -s -f -p1
    fi
    if [[ -d "$ROOT/../patches/mysql/$MYSQL_VERSION/linux" ]]
    then
        cd "mysql-server-mysql-$MYSQL_VERSION/linux"
        cat "$ROOT/../patches/mysql/$MYSQL_VERSION/linux"/*.patch | patch -s -f -p1
    fi
)
echo "::endgroup::"

echo "::group::build MySQL"
(
    set -eux
    cd "$RUNNER_TEMP"
    mkdir build
    cd build
    if [[ "$MYSQL_VERSION" =~ ^([1-9][0-9][.]|9[.]) ]]; then # MySQL 9.0 or later
        cmake "../mysql-server-mysql-$MYSQL_VERSION" \
            -DCOMPILATION_COMMENT="shogo82148/actions-setup-mysql@v$ACTION_VERSION" \
            -DWITH_UNIT_TESTS=0 \
            -DWITH_AUTHENTICATION_CLIENT_PLUGINS=1 \
            -DCMAKE_INSTALL_PREFIX="$PREFIX" \
            -DWITH_SSL="$PREFIX"
    elif [[ "$MYSQL_VERSION" =~ ^8[.] ]]; then # MySQL 8.0
        cmake "../mysql-server-mysql-$MYSQL_VERSION" \
            -DCOMPILATION_COMMENT="shogo82148/actions-setup-mysql@v$ACTION_VERSION" \
            -DDOWNLOAD_BOOST=1 -DWITH_BOOST=../boost \
            -DWITH_UNIT_TESTS=0 \
            -DCMAKE_INSTALL_PREFIX="$PREFIX" \
            -DWITH_SSL="$PREFIX"
    else
        cmake "../mysql-server-mysql-$MYSQL_VERSION" \
            -DCOMPILATION_COMMENT="shogo82148/actions-setup-mysql@v$ACTION_VERSION" \
            -DDOWNLOAD_BOOST=1 -DWITH_BOOST=../boost \
            -DWITH_ROCKSDB_LZ4=0 -DWITH_ROCKSDB_BZip2=0 -DWITH_ROCKSDB_Snappy=0 -DWITH_ROCKSDB_ZSTD=0 \
            -DWITH_UNIT_TESTS=0 \
            -DCMAKE_INSTALL_PREFIX="$PREFIX" \
            -DWITH_SSL="$PREFIX"
    fi
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
