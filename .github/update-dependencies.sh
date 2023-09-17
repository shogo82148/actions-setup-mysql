#!/bin/bash

set -eu

cd "$(dirname "$0")"

OPENSSL_VERSION1_1_1=$(gh api --jq '[.[] | select(.ref != "refs/tags/OpenSSL_1_1_1")] | last.ref | sub("refs/tags/OpenSSL_"; "")' /repos/openssl/openssl/git/matching-refs/tags/OpenSSL_1_1_1)
export OPENSSL_VERSION1_1_1

perl -i -pe 's/^OPENSSL_VERSION1_1_1=.*$/OPENSSL_VERSION1_1_1=$ENV{OPENSSL_VERSION1_1_1}/' build-mariadb-darwin.sh
perl -i -pe 's/^OPENSSL_VERSION1_1_1=.*$/OPENSSL_VERSION1_1_1=$ENV{OPENSSL_VERSION1_1_1}/' build-mariadb-linux.sh
perl -i -pe 's/^\$OPENSSL_VERSION1_1_1\s*=.*$/\$OPENSSL_VERSION1_1_1 = "$ENV{OPENSSL_VERSION1_1_1}"/' build-mariadb-windows.ps1

perl -i -pe 's/^OPENSSL_VERSION1_1_1=.*$/OPENSSL_VERSION1_1_1=$ENV{OPENSSL_VERSION1_1_1}/' build-mysql-darwin.sh
perl -i -pe 's/^OPENSSL_VERSION1_1_1=.*$/OPENSSL_VERSION1_1_1=$ENV{OPENSSL_VERSION1_1_1}/' build-mysql-linux.sh
perl -i -pe 's/^\$OPENSSL_VERSION1_1_1\s*=.*$/\$OPENSSL_VERSION1_1_1 = "$ENV{OPENSSL_VERSION1_1_1}"/' build-mysql-windows.ps1

OPENSSL_VERSION3=$(gh api --jq 'map(select(.ref | test("/openssl-[0-9]+[.][0-9]+[.][0-9]+$"))) | last.ref | sub("refs/tags/openssl-"; "")' /repos/openssl/openssl/git/matching-refs/tags/openssl-3.)
export OPENSSL_VERSION3

perl -i -pe 's/^OPENSSL_VERSION3=.*$/OPENSSL_VERSION3=$ENV{OPENSSL_VERSION3}/' build-mariadb-darwin.sh
perl -i -pe 's/^OPENSSL_VERSION3=.*$/OPENSSL_VERSION3=$ENV{OPENSSL_VERSION3}/' build-mariadb-linux.sh
perl -i -pe 's/^\$OPENSSL_VERSION3\s*=.*$/\$OPENSSL_VERSION3 = "$ENV{OPENSSL_VERSION3}"/' build-mariadb-windows.ps1

perl -i -pe 's/^OPENSSL_VERSION3=.*$/OPENSSL_VERSION3=$ENV{OPENSSL_VERSION3}/' build-mysql-darwin.sh
perl -i -pe 's/^OPENSSL_VERSION3=.*$/OPENSSL_VERSION3=$ENV{OPENSSL_VERSION3}/' build-mysql-linux.sh
perl -i -pe 's/^\$OPENSSL_VERSION3\s*=.*$/\$OPENSSL_VERSION3 = "$ENV{OPENSSL_VERSION3}"/' build-mysql-windows.ps1
