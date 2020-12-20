Param($MARIADB_VERSION)
$OPENSSL_VERSION = "1_1_1i"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$RUNNER_TEMP = $env:RUNNER_TEMP
if ($null -eq $RUNNER_TEMP) {
    $RUNNER_TEMP = Join-Path $ROOT "working"
}
$RUNNER_TOOL_CACHE = $env:RUNNER_TOOL_CACHE
if ($null -eq $RUNNER_TOOL_CACHE) {
    $RUNNER_TOOL_CACHE = Join-Path $RUNNER_TEMP "dist"
}
$PREFIX = Join-Path $RUNNER_TOOL_CACHE "mariadb" $MARIADB_VERSION "x64"


Write-Host "::group::Set up Visual Studio 2019"
New-Item $RUNNER_TEMP -ItemType Directory -Force
Set-Location "$RUNNER_TEMP"
Remove-Item -Path * -Recurse -Force

# https://help.appveyor.com/discussions/questions/18777-how-to-use-vcvars64bat-from-powershell
# https://stackoverflow.com/questions/2124753/how-can-i-use-powershell-with-the-visual-studio-command-prompt
cmd.exe /c "call `"C:\Program Files (x86)\Microsoft Visual Studio\2019\Enterprise\VC\Auxiliary\Build\vcvarsall.bat`" x64 && set > %temp%\vcvars.txt"
Get-Content "$env:temp\vcvars.txt" | Foreach-Object {
    if ($_ -match "^(.*?)=(.*)$") {
        Set-Item -Path "env:$($matches[1])" $matches[2]
        Write-Host "::debug::$($matches[1])=$($matches[2])"
    }
}
Write-Host "::endgroup::"


# NASM is required by OpenSSL
Write-Host "::group::Set up NASM"
choco install nasm
Set-Item -Path "env:PATH" "C:\Program Files\NASM;$env:PATH"
Write-Host "::endgroup::"


# system SSL/TLS library is too old. so we use custom build.
Write-Host "::group::fetch OpenSSL source"
Set-Location "$RUNNER_TEMP"
Write-Host "Downloading zip archive..."
Invoke-WebRequest "https://github.com/openssl/openssl/archive/OpenSSL_$OPENSSL_VERSION.zip" -OutFile "openssl.zip"
Write-Host "Unzipping..."
Expand-Archive -Path "openssl.zip" -DestinationPath .
Remove-Item -Path "openssl.zip"
Write-Host "::endgroup::"


Write-Host "::group::build OpenSSL"
Set-Location "$RUNNER_TEMP"
Set-Location "openssl-OpenSSL_$OPENSSL_VERSION"
C:\strawberry\perl\bin\perl.exe Configure --prefix="$PREFIX" VC-WIN64A
nmake
nmake install_sw
Set-Location "$RUNNER_TEMP"
Remove-Item -Path "openssl-OpenSSL_$OPENSSL_VERSION" -Recurse -Force

# remove debug information
Get-ChildItem "$PREFIX" -Include *.pdb -Recurse | Remove-Item

Write-Host "::endgroup::"


# Bison
Write-Host "::group::Set up Bison"
$BISON_VERSION = "2.4.1"
$BISON_PREFIX = Join-Path "C:" "GnuWin32"
Set-Location "$RUNNER_TEMP"
Write-Host "Downloading zip archive of binary..."
Invoke-WebRequest "https://versaweb.dl.sourceforge.net/project/gnuwin32/bison/$BISON_VERSION/bison-$BISON_VERSION-bin.zip" -OutFile "bison-bin.zip"
Write-Host "Unzipping..."
Expand-Archive -Path "bison-bin.zip" -DestinationPath "$BISON_PREFIX"
Write-Host "Downloading zip archive of dependencies..."
Invoke-WebRequest "https://versaweb.dl.sourceforge.net/project/gnuwin32/bison/$BISON_VERSION/bison-$BISON_VERSION-dep.zip" -OutFile "bison-dep.zip"
Write-Host "Unzipping..."
Expand-Archive -Path "bison-dep.zip" -DestinationPath "$BISON_PREFIX"
Set-Item -Path "env:PATH" "$(Join-Path $BISON_PREFIX "bin");$env:PATH"
Remove-Item -Path "bison-bin.zip"
Remove-Item -Path "bison-dep.zip"
Write-Host "::endgroup::"

# use C drive to avoid disk full
$RUNNER_TEMP = "C:\Temp"
New-Item "$RUNNER_TEMP" -ItemType Directory -Force

Write-Host "::group::fetch MariaDB source"
Set-Location "$RUNNER_TEMP"
Write-Host "Downloading zip archive..."
Invoke-WebRequest "https://downloads.mariadb.com/MariaDB/mariadb-$MARIADB_VERSION/source/mariadb-$MARIADB_VERSION.tar.gz" -OutFile "mariadb-src.tar.gz"
Write-Host "Untar..."
tar zxvf mariadb-src.tar.gz
Remove-Item -Path "mariadb-src.tar.gz"
Write-Host "::endgroup::"

Write-Host "::group::build MariaDB"
Set-Location "$RUNNER_TEMP"

New-Item "boost" -ItemType Directory -Force
$BOOST = Join-Path $RUNNER_TEMP "boost"
New-Item "build" -ItemType Directory -Force
Set-Location build
cmake ( Join-Path $RUNNER_TEMP "mariadb-$MARIADB_VERSION" ) `
    -DDOWNLOAD_BOOST=1 -DWITH_BOOST="$BOOST" `
    -DCMAKE_INSTALL_PREFIX="$PREFIX" `
    -DWITH_SSL="$PREFIX" `
    -DCMAKE_BUILD_TYPE=MinSizeRel

devenv MySQL.sln /build RelWithDebInfo
Write-Host "::endgroup::"

Write-Host "::group::install"
Set-Location "$RUNNER_TEMP\build"
devenv MySQL.sln /build RelWithDebInfo /project initial_database
devenv MySQL.sln /build RelWithDebInfo /project package
Write-Host "::endgroup::"


# archive
Write-Host "::group::archive"

Set-Location "$RUNNER_TEMP"
Expand-Archive -Path ".\build\mariadb-$MARIADB_VERSION-winx64.zip" -DestinationPath "."
Set-Location "mariadb-$MARIADB_VERSION-winx64"

# remove extra files
if (Test-Path mysql-test) {
    Remove-Item -Path mysql-test -Recurse -Force
}
if (Test-Path sql-bench) {
    Remove-Item -Path sql-bench -Recurse -Force
}

# remove debug information
Get-ChildItem "." -Include *.pdb -Recurse | Remove-Item

# copy libraries
Copy-Item -Path "$PREFIX\*" -Recurse -Destination "." -Force

Compress-Archive -Path * -DestinationPath "$RUNNER_TEMP\mariadb.zip" -CompressionLevel Optimal
Write-Host "::endgroup::"
