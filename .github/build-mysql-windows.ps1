Param($MYSQL_VERSION)
$OPENSSL_VERSION="1_1_1h"
$ROOT=Split-Path -Parent $MyInvocation.MyCommand.Path
$RUNNER_TEMP=$env:RUNNER_TEMP ?? ( Join-Path $ROOT "working" )
$RUNNER_TOOL_CACHE=$env:RUNNER_TOOL_CACHE ?? ( Join-Path $RUNNER_TEMP "dist" )
$PREFIX=Join-Path $RUNNER_TOOL_CACHE "mysql" $MYSQL_VERSION "x64"

New-Item $RUNNER_TEMP -ItemType Directory -Force
Set-Location "$RUNNER_TEMP"
Remove-Item -Path * -Recurse -Force

Write-Host "::group::download MySQL source"
Set-Location "$RUNNER_TEMP"
Invoke-WebRequest "https://github.com/mysql/mysql-server/archive/mysql-$MYSQL_VERSION.zip" -OutFile mysql-src.zip
Write-Host "::endgroup::"

Write-Host "::group::extract MySQL source"
Set-Location "$RUNNER_TEMP"
Expand-Archive -Path mysql-src.zip -DestinationPath .
Write-Host "::endgroup::"

Write-Host "::group::build MySQL"
Set-Location "$RUNNER_TEMP"
New-Item "boost" -ItemType Directory -Force
$BOOST=Join-Path $RUNNER_TEMP "boost"
New-Item "build" -ItemType Directory -Force
Set-Location build
cmake ( Join-Path $RUNNER_TEMP "mysql-server-mysql-$MYSQL_VERSION" ) `
    -DDOWNLOAD_BOOST=1 -DWITH_BOOST="$BOOST" `
    -DCMAKE_INSTALL_PREFIX="$PREFIX" `
    -DWITH_SSL="$PREFIX"
nmake "-j$JOBS"
Write-Host "::endgroup::"

Write-Host "::group::install"
Set-Location "$RUNNER_TEMP/build"
make install
Write-Host "::endgroup::"

# archive
Write-Host "::group::archive"
Set-Location "$PREFIX"

# remove extra files
rm -rf ./man
rm -rf ./mysql-test
rm -rf ./sql-bench

tar Jvcf "$RUNNER_TEMP/mysql.tar.xz" .
Write-Host "::endgroup::"
