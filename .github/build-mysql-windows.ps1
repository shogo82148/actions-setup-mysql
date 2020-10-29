Param($MYSQL_VERSION)
$OPENSSL_VERSION="1_1_1h"
$ROOT=Split-Path -Parent $MyInvocation.MyCommand.Path
$RUNNER_TEMP=$env:RUNNER_TEMP ?? ( Join-Path $ROOT "working" )
$RUNNER_TOOL_CACHE=$env:RUNNER_TOOL_CACHE ?? ( Join-Path $RUNNER_TEMP "dist" )
$PREFIX=Join-Path $RUNNER_TOOL_CACHE "mysql" $MYSQL_VERSION "x64"

New-Item $RUNNER_TEMP -ItemType Directory -Force
Set-Location "$RUNNER_TEMP"
Remove-Item -Path * -Recurse -Force

Write-Output "::group::download MySQL source"
Set-Location "$RUNNER_TEMP"
Invoke-WebRequest "https://github.com/mysql/mysql-server/archive/mysql-$MYSQL_VERSION.zip" -OutFile mysql-src.zip
Write-Output "::endgroup::"

Write-Output "::group::extract MySQL source"
Set-Location "$RUNNER_TEMP"
tar zxvf mysql-src.tar.gz
Write-Output "::endgroup::"

Write-Output "::group::build MySQL"
Set-Location "$RUNNER_TEMP"
mkdir build
Set-Location build
cmake "../mysql-server-mysql-$MYSQL_VERSION" \
    -DDOWNLOAD_BOOST=1 -DWITH_BOOST=../boost \
    -DCMAKE_INSTALL_PREFIX="$PREFIX" \
    -DWITH_SSL="$PREFIX"
make "-j$JOBS"
Write-Output "::endgroup::"

Write-Output "::group::install"
Set-Location "$RUNNER_TEMP/build"
make install
Write-Output "::endgroup::"

# archive
Write-Output "::group::archive"
Set-Location "$PREFIX"

# remove extra files
rm -rf ./man
rm -rf ./mysql-test
rm -rf ./sql-bench

tar Jvcf "$RUNNER_TEMP/mysql.tar.xz" .
Write-Output "::endgroup::"
