#!/usr/bin/env python3
"""Set up and persist the local tqx-data API key without printing it."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

SERVICE = "tqx.data.api-key"
ACCOUNT = "default"


def home() -> Path:
    override = os.environ.get("TQX_DATA_HOME", "").strip()
    if override:
        return Path(override).expanduser()
    root = os.environ.get("XDG_CONFIG_HOME", "").strip() or str(Path.home() / ".config")
    return Path(root) / "tqx" / "data"


def credentials_file() -> Path:
    return home() / "credentials.json"


def venv() -> Path:
    return home() / ".venv"


def python_path() -> Path:
    return venv() / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def emit(value: dict) -> None:
    print(json.dumps(value), flush=True)


def fail(message: str, code: int = 1) -> int:
    print(json.dumps({"ok": False, "error": message}), file=sys.stderr, flush=True)
    return code


def keyring_module():
    if os.environ.get("TQX_DATA_CREDENTIAL_STORE", "").lower() == "file":
        return None
    try:
        import keyring
        from keyring.backends import fail
        if isinstance(keyring.get_keyring(), fail.Keyring):
            return None
        return keyring
    except Exception:
        return None


def load() -> tuple[str, str] | None:
    kr = keyring_module()
    if kr:
        try:
            raw = kr.get_password(SERVICE, ACCOUNT)
            if raw:
                value = json.loads(raw)
                if isinstance(value, dict) and value.get("api_key"):
                    return str(value["api_key"]), str(value.get("base_url", ""))
        except Exception:
            pass
    path = credentials_file()
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if isinstance(value, dict) and value.get("api_key"):
        return str(value["api_key"]), str(value.get("base_url", ""))
    return None


def save(api_key: str, base_url: str) -> str:
    value = {"version": 1, "api_key": api_key, "base_url": base_url}
    kr = keyring_module()
    if kr:
        try:
            kr.set_password(SERVICE, ACCOUNT, json.dumps(value))
            if credentials_file().exists():
                credentials_file().unlink()
            return "keychain"
        except Exception:
            pass
    path = credentials_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")
    if os.name != "nt":
        path.chmod(0o600)
    return "file"


def remove() -> list[str]:
    removed: list[str] = []
    kr = keyring_module()
    if kr:
        try:
            if kr.get_password(SERVICE, ACCOUNT) is not None:
                kr.delete_password(SERVICE, ACCOUNT)
                removed.append("keychain")
        except Exception:
            pass
    if credentials_file().exists():
        credentials_file().unlink()
        removed.append("file")
    return removed


def setup(args: argparse.Namespace) -> int:
    target = python_path()
    home().mkdir(parents=True, exist_ok=True)
    if args.recreate and venv().exists():
        shutil.rmtree(venv())
    if not target.exists():
        subprocess.run([sys.executable, "-m", "venv", str(venv())], check=True)
    command = [str(target), "-m", "pip", "install"]
    if args.upgrade:
        command.append("--upgrade")
    command.append("tqx-data")
    subprocess.run(command, check=True)
    emit({"ok": True, "setup": "ready", "home": str(home())})
    return 0


def read_login() -> tuple[str, str] | None:
    try:
        value = json.loads(sys.stdin.read())
    except ValueError:
        return None
    if not isinstance(value, dict):
        return None
    key = str(value.get("api_key", "")).strip()
    base = str(value.get("base_url", "")).strip()
    return (key, base) if key else None


def ensure_env(args: list[str]) -> int | None:
    if Path(sys.prefix).resolve() == venv().resolve():
        return None
    target = python_path()
    if not target.exists():
        return fail("environment is not set up; run setup first", 4)
    return subprocess.call([str(target), str(Path(__file__).resolve()), *args])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["setup", "login", "status", "logout", "run", "info"])
    parser.add_argument("script_args", nargs=argparse.REMAINDER)
    parser.add_argument("--upgrade", action="store_true")
    parser.add_argument("--recreate", action="store_true")
    args = parser.parse_args()
    if args.command == "setup":
        return setup(args)
    delegated = ensure_env(sys.argv[1:])
    if delegated is not None:
        return delegated
    if args.command == "login":
        supplied = read_login()
        if supplied is None:
            return fail('pass {"api_key":"...","base_url":"..."} as JSON on stdin', 2)
        key, base = supplied
        store = save(key, base)
        emit({"ok": True, "saved": True, "credential_store": store, "base_url": base or None})
        return 0
    if args.command == "status":
        value = load()
        emit({"ok": True, "saved": value is not None, "base_url": value[1] if value else None})
        return 0 if value else 3
    if args.command == "logout":
        emit({"ok": True, "removed": remove()})
        return 0
    if args.command == "info":
        import tqx_data
        emit({"ok": True, "tqx_data_version": getattr(tqx_data, "__version__", None), "home": str(home()), "credential_store": "keychain" if keyring_module() else "file"})
        return 0
    value = load()
    if value is None:
        return fail("no API key is saved", 3)
    key, base = value
    if args.command == "run":
        env = os.environ.copy()
        env["TQX_API_KEY"] = key
        if base:
            env["TQX_API_BASE_URL"] = base
        command = args.script_args or ["-"]
        if command[0] == "-":
            return subprocess.call([sys.executable, "-"], env=env)
        return subprocess.call([sys.executable, *command], env=env)
    return fail("unsupported command")


if __name__ == "__main__":
    raise SystemExit(main())
