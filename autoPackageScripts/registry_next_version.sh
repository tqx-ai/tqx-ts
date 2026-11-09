#!/usr/bin/env bash
# 从 Registry 拉取 tag 列表，按 REGISTRY_VERSION_MODE 计算下一版本号，单行输出到 stdout。
# workflow 模式生成 0.0.1、0.0.2 ... 版本标签；首次构建从 0.0.1 开始。
set -euo pipefail

: "${DOCKER_IMAGE:?DOCKER_IMAGE required}"
: "${DOCKER_REGISTRY_USER:?DOCKER_REGISTRY_USER required}"
: "${DOCKER_REGISTRY_PASSWORD:?DOCKER_REGISTRY_PASSWORD required}"
: "${REGISTRY_VERSION_MODE:?REGISTRY_VERSION_MODE required (workflow|graph)}"

REGISTRY_HOST="${DOCKER_IMAGE%%/*}"
REPO_PATH="${DOCKER_IMAGE#*/}"

printf '%s' "$DOCKER_REGISTRY_PASSWORD" |
  docker login "$REGISTRY_HOST" -u "$DOCKER_REGISTRY_USER" --password-stdin >/dev/null

export REGISTRY_HOST REPO_PATH
export VERSION_TAG_PREFIX="${VERSION_TAG_PREFIX:-0.0.}"

python3 - <<'PY'
import base64
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request


def basic_header(user: str, password: str) -> str:
    raw = f"{user}:{password}".encode("utf-8")
    return "Basic " + base64.b64encode(raw).decode("ascii")


def bearer_challenge(value: str) -> tuple[str | None, str | None, str | None]:
    if "bearer" not in value.lower():
        return None, None, None
    params = dict(re.findall(r'([a-zA-Z_]+)="([^"]*)"', value))
    return params.get("realm"), params.get("service"), params.get("scope")


def read_json(request: urllib.request.Request) -> dict:
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def get_bearer_token(realm: str, service: str | None, scope: str | None) -> str:
    query: dict[str, str] = {}
    if service:
        query["service"] = service
    if scope:
        query["scope"] = scope
    token_url = realm
    if query:
        token_url += ("&" if "?" in realm else "?") + urllib.parse.urlencode(query)
    body = read_json(
        urllib.request.Request(
            token_url,
            headers={
                "Authorization": basic_header(
                    os.environ["DOCKER_REGISTRY_USER"],
                    os.environ["DOCKER_REGISTRY_PASSWORD"],
                )
            },
        )
    )
    token = body.get("token") or body.get("access_token")
    if not token:
        raise SystemExit("registry token response did not contain token")
    return token


def fetch_tags() -> list[str]:
    url = f"https://{os.environ['REGISTRY_HOST']}/v2/{os.environ['REPO_PATH']}/tags/list"
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": basic_header(
                os.environ["DOCKER_REGISTRY_USER"],
                os.environ["DOCKER_REGISTRY_PASSWORD"],
            )
        },
    )
    try:
        return read_json(request).get("tags") or []
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return []
        if error.code != 401:
            raise
        realm, service, scope = bearer_challenge(
            error.headers.get("WWW-Authenticate", "")
        )
        if not realm:
            raise
        request = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {get_bearer_token(realm, service, scope)}"},
        )
        try:
            return read_json(request).get("tags") or []
        except urllib.error.HTTPError as retry_error:
            if retry_error.code == 404:
                return []
            raise


tags = [tag for tag in fetch_tags() if tag and tag != "latest"]
mode = os.environ["REGISTRY_VERSION_MODE"]

if mode == "workflow":
    prefix = os.environ["VERSION_TAG_PREFIX"]
    numbers = [
        int(tag[len(prefix) :])
        for tag in tags
        if tag.startswith(prefix) and tag[len(prefix) :].isdigit()
    ]
    next_number = max(numbers, default=0) + 1
    print(f"{prefix}{next_number}")
else:
    raise SystemExit(f"unsupported REGISTRY_VERSION_MODE: {mode}")
PY
