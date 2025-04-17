Param($MYSQL_VERSION)
$OPENSSL_VERSION1_1_1 = "1_1_1w"
$OPENSSL_VERSION3 = "3.5.0"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$RUNNER_TEMP = $env:RUNNER_TEMP
if ($null -eq $RUNNER_TEMP) {
    $RUNNER_TEMP = Join-Path $ROOT "working"
}
$RUNNER_TOOL_CACHE = $env:RUNNER_TOOL_CACHE
if ($null -eq $RUNNER_TOOL_CACHE) {
    $RUNNER_TOOL_CACHE = Join-Path $RUNNER_TEMP "dist"
}
$PREFIX = Join-Path $RUNNER_TOOL_CACHE "mysql" $MYSQL_VERSION "x64"

$ACTION_VERSION = Get-Content (Join-Path $ROOT ".." "package.json") | jq -r ".version"

if (Test-Path "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvarsall.bat") {
    Write-Host "::group::Set up Visual Studio 2022"
    New-Item $RUNNER_TEMP -ItemType Directory -Force
    Set-Location "$RUNNER_TEMP"
    Remove-Item -Path * -Recurse -Force

    # https://help.appveyor.com/discussions/questions/18777-how-to-use-vcvars64bat-from-powershell
    # https://stackoverflow.com/questions/2124753/how-can-i-use-powershell-with-the-visual-studio-command-prompt
    cmd.exe /c "call `"C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvarsall.bat`" x64 && set > %temp%\vcvars.txt"
    Get-Content "$env:temp\vcvars.txt" | Foreach-Object {
        if ($_ -match "^(.*?)=(.*)$") {
            Set-Item -Path "env:$($matches[1])" $matches[2]
            Write-Host "::debug::$($matches[1])=$($matches[2])"
        }
    }
    Write-Host "::endgroup::"
}

if (Test-Path "C:\Program Files (x86)\Microsoft Visual Studio\2019\Enterprise\VC\Auxiliary\Build\vcvarsall.bat") {
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
}

# NASM is required by OpenSSL
Write-Host "::group::Set up NASM"
choco install nasm
Set-Item -Path "env:PATH" "C:\Program Files\NASM;$env:PATH"
Write-Host "::endgroup::"


# system SSL/TLS library is too old. so we use custom build.
if ( $MYSQL_VERSION -match '^([1-9][0-9][.]|[89][.])') # MySQL 8.0 or later
{
    $OPENSSL_VERSION = $OPENSSL_VERSION3
    Write-Host "::group::fetch OpenSSL 3 source"
    Set-Location "$RUNNER_TEMP"
    Write-Host "Downloading zip archive..."
    Invoke-WebRequest "https://github.com/openssl/openssl/archive/openssl-$OPENSSL_VERSION.zip" -OutFile "openssl.zip"
    Write-Host "Unzipping..."
    Expand-Archive -Path "openssl.zip" -DestinationPath .
    Remove-Item -Path "openssl.zip"
    Write-Host "::endgroup::"

    Write-Host "::group::build OpenSSL 3"
    Set-Location "$RUNNER_TEMP"
    Set-Location "openssl-openssl-$OPENSSL_VERSION"

    C:\strawberry\perl\bin\perl.exe Configure --prefix="$PREFIX" --openssldir="$PREFIX" --libdir=lib
    nmake
    nmake install_sw install_ssldirs
    Set-Location "$RUNNER_TEMP"
    Remove-Item -Path "openssl-openssl-$OPENSSL_VERSION" -Recurse -Force

    # remove debug information
    Get-ChildItem "$PREFIX" -Include *.pdb -Recurse | Remove-Item

    Write-Host "::endgroup::"
} else {
    $OPENSSL_VERSION = $OPENSSL_VERSION1_1_1
    Write-Host "::group::fetch OpenSSL 1.1 source"
    Set-Location "$RUNNER_TEMP"
    Write-Host "Downloading zip archive..."
    Invoke-WebRequest "https://github.com/openssl/openssl/archive/OpenSSL_$OPENSSL_VERSION.zip" -OutFile "openssl.zip"
    Write-Host "Unzipping..."
    Expand-Archive -Path "openssl.zip" -DestinationPath .
    Remove-Item -Path "openssl.zip"
    Write-Host "::endgroup::"

    Write-Host "::group::build OpenSSL 1.1"
    Set-Location "$RUNNER_TEMP"
    Set-Location "openssl-OpenSSL_$OPENSSL_VERSION"

    C:\strawberry\perl\bin\perl.exe Configure --prefix="$PREFIX" VC-WIN64A
    nmake
    nmake install_sw install_ssldirs
    Set-Location "$RUNNER_TEMP"
    Remove-Item -Path "openssl-OpenSSL_$OPENSSL_VERSION" -Recurse -Force

    # remove debug information
    Get-ChildItem "$PREFIX" -Include *.pdb -Recurse | Remove-Item

    Write-Host "::endgroup::"
}

# Bison
Write-Host "::group::Set up Bison"
if ( $MYSQL_VERSION -match '^([1-9][0-9][.]|[89][.])' ) # MySQL 8.0 or later
{
    choco install winflexbison3
}
else
{
    # MySQL 5.7 or earlier
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
}
Write-Host "::endgroup::"

# use C drive to avoid disk full
$RUNNER_TEMP = "C:\Temp"
New-Item "$RUNNER_TEMP" -ItemType Directory -Force

Write-Host "::group::fetch MySQL source"
Set-Location "$RUNNER_TEMP"
Write-Host "Downloading zip archive..."
Invoke-WebRequest "https://github.com/mysql/mysql-server/archive/mysql-$MYSQL_VERSION.zip" -OutFile "mysql-src.zip"
Write-Host "Unzipping..."
choco install patch
Expand-Archive -Path "mysql-src.zip" -DestinationPath "."
Remove-Item -Path "mysql-src.zip"
if (Test-Path ( Join-Path $ROOT .. "patches" "mysql" $MYSQL_VERSION )) {
    Set-Location ( Join-Path $RUNNER_TEMP "mysql-server-mysql-$MYSQL_VERSION" )
    Get-Content ( Join-Path $ROOT .. "patches" "mysql" $MYSQL_VERSION *.patch ) | patch -s -f -p1
}
if (Test-Path ( Join-Path $ROOT .. "patches" "mysql" $MYSQL_VERSION "windows")) {
    Set-Location ( Join-Path $RUNNER_TEMP "mysql-server-mysql-$MYSQL_VERSION" )
    Get-Content ( Join-Path $ROOT .. "patches" "mysql" $MYSQL_VERSION "windows" *.patch ) | patch -s -f -p1
}
Write-Host "::endgroup::"

Write-Host "::group::build MySQL"
Set-Location "$RUNNER_TEMP"

New-Item "boost" -ItemType Directory -Force
$BOOST = Join-Path $RUNNER_TEMP "boost"
New-Item "build" -ItemType Directory -Force
Set-Location build
if ( $MYSQL_VERSION -match '^([1-9][0-9][.]|9[.])' ) # MySQL 9.0 or later
{
    cmake ( Join-Path $RUNNER_TEMP "mysql-server-mysql-$MYSQL_VERSION" ) `
        -DCOMPILATION_COMMENT="shogo82148/actions-setup-mysql@v$ACTION_VERSION" `
        -DWITH_UNIT_TESTS=0 `
        -DWITH_AUTHENTICATION_CLIENT_PLUGINS=1 `
        -DCMAKE_INSTALL_PREFIX="$PREFIX" `
        -DWITH_SSL="$PREFIX" `
        -DCMAKE_BUILD_TYPE=Release
}
elseif ( $MYSQL_VERSION -match '^8[.]' ) # MySQL 8.0
{
    cmake ( Join-Path $RUNNER_TEMP "mysql-server-mysql-$MYSQL_VERSION" ) `
        -DCOMPILATION_COMMENT="shogo82148/actions-setup-mysql@v$ACTION_VERSION" `
        -DDOWNLOAD_BOOST=1 -DWITH_BOOST="$BOOST" `
        -DWITH_UNIT_TESTS=0 `
        -DCMAKE_INSTALL_PREFIX="$PREFIX" `
        -DWITH_SSL="$PREFIX" `
        -DCMAKE_BUILD_TYPE=Release
}
else
{
    cmake ( Join-Path $RUNNER_TEMP "mysql-server-mysql-$MYSQL_VERSION" ) `
        -DCOMPILATION_COMMENT="shogo82148/actions-setup-mysql@v$ACTION_VERSION" `
        -DDOWNLOAD_BOOST=1 -DWITH_BOOST="$BOOST" `
        -DWITH_ROCKSDB_LZ4=0 -DWITH_ROCKSDB_BZip2=0 -DWITH_ROCKSDB_Snappy=0 -DWITH_ROCKSDB_ZSTD=0 `
        -DWITH_UNIT_TESTS=0 `
        -DCMAKE_INSTALL_PREFIX="$PREFIX" `
        -DWITH_SSL="$PREFIX" `
        -DCMAKE_BUILD_TYPE=Release
}

try {
    devenv MySQL.sln /build Release
} catch {
    # try again
    devenv MySQL.sln /build Release
}
Write-Host "::endgroup::"

Write-Host "::group::install"
Set-Location "$RUNNER_TEMP\build"
devenv MySQL.sln /build Release /project initial_database
devenv MySQL.sln /build Release /project package
Write-Host "::endgroup::"


# archive
Write-Host "::group::archive"

Set-Location "$RUNNER_TEMP"
Expand-Archive -Path ".\build\mysql-$MYSQL_VERSION-winx64.zip" -DestinationPath "."
Set-Location "mysql-$MYSQL_VERSION-winx64"

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

Compress-Archive -Path * -DestinationPath "$RUNNER_TEMP\mysql.zip" -CompressionLevel Optimal
Write-Host "::endgroup::"
