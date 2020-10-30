Param($MYSQL_VERSION)
$OPENSSL_VERSION="1_1_1h"
$ROOT=Split-Path -Parent $MyInvocation.MyCommand.Path
$RUNNER_TEMP=$env:RUNNER_TEMP ?? ( Join-Path $ROOT "working" )
$RUNNER_TOOL_CACHE=$env:RUNNER_TOOL_CACHE ?? ( Join-Path $RUNNER_TEMP "dist" )
$PREFIX=Join-Path $RUNNER_TOOL_CACHE "mysql" $MYSQL_VERSION "x64"

Write-Host "::group::Set up Visual Studio 2019"
New-Item $RUNNER_TEMP -ItemType Directory -Force
Set-Location "$RUNNER_TEMP"
Remove-Item -Path * -Recurse -Force

# https://help.appveyor.com/discussions/questions/18777-how-to-use-vcvars64bat-from-powershell
# https://stackoverflow.com/questions/2124753/how-can-i-use-powershell-with-the-visual-studio-command-prompt
cmd.exe /c "call `"C:\Program Files (x86)\Microsoft Visual Studio\2019\Enterprise\VC\Auxiliary\Build\vcvarsall.bat`" x64 && set > %temp%\vcvars.txt"
Get-Content "$env:temp\vcvars.txt" | Foreach-Object {
    if ($_ -match "^(.*?)=(.*)$") {
        Set-Content "env:\$($matches[1])" $matches[2]
        Write-Host "::debug::$($matches[1])=$($matches[2])"
    }
}
Write-Host "::endgroup::"


# system SSL/TLS library is too old. so we use custom build.
Write-Host "::group::download OpenSSL source"
Set-Location "$RUNNER_TEMP"
Invoke-WebRequest "https://github.com/openssl/openssl/archive/OpenSSL_$OPENSSL_VERSION.zip" -OutFile "openssl.zip"
Write-Host "::endgroup::"

Write-Host "::group::extract OpenSSL source"
Set-Location "$RUNNER_TEMP"
Expand-Archive -Path "openssl.zip" -DestinationPath .
Write-Host "::endgroup::"

Write-Host "::group::build OpenSSL"
Set-Location "openssl-OpenSSL_$OPENSSL_VERSION"
C:\strawberry\perl\bin\perl.exe Configure --prefix="$PREFIX" VC-WIN64A
nmake
nmake install_sw
Write-Host "::endgroup::"

Write-Host "::group::download MySQL source"
Set-Location "$RUNNER_TEMP"
Invoke-WebRequest "https://github.com/mysql/mysql-server/archive/mysql-$MYSQL_VERSION.zip" -OutFile "mysql-src.zip"
Write-Host "::endgroup::"

Write-Host "::group::extract MySQL source"
Set-Location "$RUNNER_TEMP"
Expand-Archive -Path "mysql-src.zip" -DestinationPath "."
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

devenv MySQL.sln /build RelWithDebInfo
Write-Host "::endgroup::"

Write-Host "::group::install"
Set-Location "$RUNNER_TEMP/build"
devenv MySQL.sln /build RelWithDebInfo /project initial_database
devenv MySQL.sln /build RelWithDebInfo /project package
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
