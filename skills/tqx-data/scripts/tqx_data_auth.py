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


def decode_credentials(raw: str) -> tuple[str, str] | None:
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if not isinstance(value, dict):
        return None
    key = value.get("api_key")
    base = value.get("base_url", "")
    if not isinstance(key, str) or not isinstance(base, str) or not key.strip():
        return None
    return key.strip(), base.strip()


def load() -> tuple[str, str] | None:
    kr = keyring_module()
    if kr:
        try:
            value = decode_credentials(kr.get_password(SERVICE, ACCOUNT))
            if value:
                return value
        except Exception:
            pass
    try:
        return decode_credentials(credentials_file().read_text(encoding="utf-8"))
    except OSError:
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
    return decode_credentials(sys.stdin.read())


def ensure_env(args: list[str]) -> int | None:
    if Path(sys.prefix).resolve() == venv().resolve():
        return None
    target = python_path()
    if not target.exists():
        return fail("environment is not set up; run setup first", 4)
    return subprocess.call([str(target), str(Path(__file__).resolve()), *args])


def login(args: argparse.Namespace) -> int:
    supplied = read_login()
    if supplied is None:
        return fail('pass {"api_key":"...","base_url":"..."} as JSON on stdin', 2)
    key, base = supplied
    store = save(key, base)
    emit({"ok": True, "saved": True, "credential_store": store, "base_url": base or None})
    return 0


def status(args: argparse.Namespace) -> int:
    value = load()
    emit({"ok": True, "saved": value is not None, "base_url": value[1] if value else None})
    return 0 if value else 3


def logout(args: argparse.Namespace) -> int:
    emit({"ok": True, "removed": remove()})
    return 0


def info(args: argparse.Namespace) -> int:
    import tqx_data
    version = getattr(tqx_data, "__version__", None)
    store = "keychain" if keyring_module() else "file"
    emit({"ok": True, "tqx_data_version": version, "home": str(home()), "credential_store": store})
    return 0


def execution_environment() -> dict[str, str] | None:
    env = os.environ.copy()
    if env.get("TQX_API_KEY", "").strip():
        return env
    value = load()
    if value is None:
        return None
    key, base = value
    env["TQX_API_KEY"] = key
    if base and not env.get("TQX_API_BASE_URL"):
        env["TQX_API_BASE_URL"] = base
    return env


def run(args: argparse.Namespace) -> int:
    env = execution_environment()
    if env is None:
        return fail("no API key is configured", 3)
    command = args.script_args or ["-"]
    return subprocess.call([sys.executable, *command], env=env)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    install = commands.add_parser("setup")
    install.add_argument("--upgrade", action="store_true")
    install.add_argument("--recreate", action="store_true")
    for name in ("login", "status", "logout", "info"):
        commands.add_parser(name)
    execute = commands.add_parser("run")
    execute.add_argument("script_args", nargs=argparse.REMAINDER)
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args(sys.argv[1:])
    if args.command == "setup":
        return setup(args)
    delegated = ensure_env(sys.argv[1:])
    if delegated is not None:
        return delegated
    handlers = {"login": login, "status": status, "logout": logout, "info": info, "run": run}
    return handlers[args.command](args)


if __name__ == "__main__":
    raise SystemExit(main())
