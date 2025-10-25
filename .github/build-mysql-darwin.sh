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
    "arm64")
        MYSQL_ARCH="arm64"
        ;;
    *)
        echo "unsupported architecture: $(uname -m)"
        exit 1
        ;;
esac
PREFIX=$RUNNER_TOOL_CACHE/mysql/$MYSQL_VERSION/$MYSQL_ARCH
export LDFLAGS=-Wl,-rpath,$PREFIX/lib

# detect the number of CPU Core
JOBS=$(sysctl -n hw.logicalcpu_max)

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

        ./Configure --prefix="$PREFIX" "darwin64-$(uname -m)-cc"
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
    if [[ -d "$ROOT/../patches/mysql/$MYSQL_VERSION/darwin" ]]
    then
        cat "$ROOT/../patches/mysql/$MYSQL_VERSION/darwin"/*.patch | patch -s -f -p1
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
