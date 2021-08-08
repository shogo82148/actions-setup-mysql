#!/bin/bash

set -eux

ROOT=$(cd "$(dirname "$0")" && pwd)
ACTIONS_VERSION=v$(< "$GITHUB_WORKSPACE/package.json" jq -r .version)

"$ROOT/retry.pl" azcopy login --service-principal --application-id "$AZCOPY_SPA_APPLICATION_ID" --tenant-id "$AZCOPY_TENANT_ID"

for archive in */*
do
    "$ROOT/retry.pl" azcopy cp "$archive" "https://setupmysql.blob.core.windows.net/actions-setup-mysql/$ACTIONS_VERSION/$(dirname "$archive")"
done
