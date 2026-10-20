#!/usr/bin/env python3
"""Set up tqx-data locally and keep the user's data-account login.

The user gives the TQX data account email and password once. ``login`` verifies
them with ``tqx_data.init_token`` and saves them in the operating system's
credential store; ``run`` logs in silently at the start of every later process.
This is needed because tqx-data 0.1.2 deletes its own session file whenever a
Python process exits.

Subcommands:
  setup    Create or update the dedicated environment (any Python 3.8+).
  login    Verify {"email", "password"} from stdin, then save them.
  status   Report whether credentials are saved and still accepted.
  logout   Remove the saved credentials.
  run      Log in from the saved credentials, then run a script or stdin code.
  info     Print versions, the credential store, and the bundled doc path.

Machine-readable results go to stdout and errors to stderr, both as JSON. The
email is masked and the password and session token are never printed.

Exit codes: 0 ok, 1 error, 2 usage, 3 not logged in, 4 environment not set up,
5 saved credentials rejected or data access denied.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import runpy
import shutil
import subprocess
import sys
import time
from pathlib import Path

KEYRING_SERVICE = "trade.tqx.data"
KEYRING_ACCOUNT = "default"
# tqx-data pins numpy<2.0, which has no wheels for Python 3.13 or later.
SUPPORTED_MINORS = (12, 11, 10)
UV_PYTHON = "3.12"
# The requirements file doubles as the marker that tqx-data uses to place its
# transient session file, so it must stay in the data home.
REQUIREMENTS = "tqx-data\nkeyring\n"

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_USAGE = 2
EXIT_NOT_LOGGED_IN = 3
EXIT_NO_ENV = 4
EXIT_REJECTED = 5

CREDENTIALS_REJECTED_CODES = {200001, 200005, 200006, 401}
ACCESS_DENIED_CODES = {200007, 200101, 200102, 200103, 200104, 403}
BETA_HINT = (
    "tqx-data is in closed beta. If the user has no TQX data account or no data "
    "membership yet, they should contact Audrey (audrey@tqx.ai) to enable it."
)


def data_home() -> Path:
    override = os.environ.get("TQX_DATA_HOME", "").strip()
    if override:
        return Path(override).expanduser()
    config_root = os.environ.get("XDG_CONFIG_HOME", "").strip() or str(Path.home() / ".config")
    return Path(config_root) / "tqx" / "data"


def venv_dir() -> Path:
    return data_home() / ".venv"


def venv_python() -> Path:
    if os.name == "nt":
        return venv_dir() / "Scripts" / "python.exe"
    return venv_dir() / "bin" / "python"


def credentials_file() -> Path:
    return data_home() / "credentials.json"


def emit(payload: dict) -> None:
    print(json.dumps(payload), flush=True)


def fail(code: int, error_type: str, message: str, **extra: object) -> int:
    error = {"type": error_type, "message": message}
    error.update(extra)
    print(json.dumps({"ok": False, "error": error}), file=sys.stderr, flush=True)
    return code


def warn(message: str) -> None:
    print(json.dumps({"warning": message}), file=sys.stderr, flush=True)


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    return f"{local[:2]}***@{domain}" if domain else "***"


def in_managed_env() -> bool:
    try:
        return Path(sys.prefix).resolve() == venv_dir().resolve()
    except OSError:
        return False


def delegate_to_env(argv: list[str]) -> int:
    python = venv_python()
    if not python.exists():
        return fail(
            EXIT_NO_ENV,
            "environment_missing",
            "The tqx-data environment is not set up. Run the setup subcommand first.",
            home=str(data_home()),
        )
    # stdin, stdout, stderr and the working directory are inherited.
    return subprocess.call([str(python), str(Path(__file__).resolve()), *argv])


# ---------------------------------------------------------------------------
# setup
# ---------------------------------------------------------------------------


def find_supported_python() -> list[str] | None:
    if sys.version_info[0] == 3 and sys.version_info[1] in SUPPORTED_MINORS:
        return [sys.executable]
    candidates: list[list[str]] = []
    if os.name == "nt" and shutil.which("py"):
        candidates += [["py", f"-3.{minor}"] for minor in SUPPORTED_MINORS]
    candidates += [[f"python3.{minor}"] for minor in SUPPORTED_MINORS if shutil.which(f"python3.{minor}")]
    for candidate in candidates:
        try:
            probe = subprocess.run(
                [*candidate, "-c", "import sys; print(sys.version_info[1])"],
                capture_output=True,
                text=True,
                timeout=30,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue
        if probe.returncode == 0 and probe.stdout.strip() in {str(m) for m in SUPPORTED_MINORS}:
            return candidate
    return None


def run_step(command: list[str]) -> None:
    # Keep stdout for the final JSON result; tool progress goes to stderr.
    subprocess.run(command, check=True, stdout=sys.stderr, stderr=sys.stderr)


def cmd_setup(args: argparse.Namespace) -> int:
    home = data_home()
    home.mkdir(parents=True, exist_ok=True)
    if os.name != "nt":
        os.chmod(home, 0o700)
    requirements = home / "requirements.txt"
    if not requirements.exists():
        requirements.write_text(REQUIREMENTS, encoding="utf-8")

    uv = shutil.which("uv")
    python = venv_python()
    if venv_dir().exists() and (args.recreate or not python.exists()):
        shutil.rmtree(venv_dir())
    try:
        if not python.exists():
            if uv:
                run_step([uv, "venv", "--python", UV_PYTHON, str(venv_dir())])
            else:
                base = find_supported_python()
                if base is None:
                    return fail(
                        EXIT_NO_ENV,
                        "python_unavailable",
                        "tqx-data needs Python 3.10-3.12 (it pins numpy<2.0). Neither uv nor a "
                        "Python 3.10-3.12 interpreter was found. Ask the user before installing uv.",
                    )
                run_step([*base, "-m", "venv", str(venv_dir())])
        if uv:
            install = [uv, "pip", "install", "--python", str(python), "-r", str(requirements)]
        else:
            install = [str(python), "-m", "pip", "install", "-r", str(requirements)]
        if args.upgrade:
            install.append("--upgrade")
        run_step(install)
    except subprocess.CalledProcessError as exc:
        return fail(
            EXIT_ERROR,
            "setup_failed",
            f"Command exited with status {exc.returncode}: {' '.join(map(str, exc.cmd))}",
            hint="If the environment uses Python 3.13 or later, rerun setup with --recreate.",
        )

    probe = subprocess.run(
        [str(python), str(Path(__file__).resolve()), "info"],
        capture_output=True,
        text=True,
    )
    if probe.returncode != 0:
        sys.stderr.write(probe.stderr)
        return fail(EXIT_ERROR, "setup_verification_failed", "tqx-data could not be imported after setup.")
    info = json.loads(probe.stdout)
    if not info.get("session_file_in_home"):
        warn(
            "tqx-data would write its transient session file outside the data home: "
            f"{info.get('session_file')}. Recreate the environment inside the data home."
        )
    info["setup"] = "ready"
    emit(info)
    return EXIT_OK


# ---------------------------------------------------------------------------
# credential store (runs inside the managed environment)
# ---------------------------------------------------------------------------


def system_keyring():
    if os.environ.get("TQX_DATA_CREDENTIAL_STORE", "").strip().lower() == "file":
        return None
    try:
        import keyring
        from keyring.backends import fail as fail_backend

        if isinstance(keyring.get_keyring(), fail_backend.Keyring):
            return None
    except Exception:
        return None
    return keyring


def describe_store() -> str:
    keyring = system_keyring()
    if keyring is None:
        return "file"
    backend = keyring.get_keyring()
    return f"keychain ({type(backend).__module__}.{type(backend).__name__})"


def write_private_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    descriptor = os.open(str(temporary), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
    os.replace(temporary, path)
    if os.name != "nt":
        os.chmod(path, 0o600)


def save_credentials(email: str, password: str) -> str:
    keyring = system_keyring()
    if keyring is not None:
        try:
            keyring.set_password(
                KEYRING_SERVICE,
                KEYRING_ACCOUNT,
                json.dumps({"email": email, "password": password}),
            )
        except Exception as exc:
            warn(f"System credential store unavailable ({type(exc).__name__}); using a private file.")
        else:
            if credentials_file().exists():
                credentials_file().unlink()
            return "keychain"
    write_private_json(
        credentials_file(),
        {"version": 1, "email": email, "password": password, "saved_at": int(time.time())},
    )
    return "file"


def parse_credentials(raw: object) -> tuple[str, str] | None:
    if not isinstance(raw, dict):
        return None
    email, password = raw.get("email"), raw.get("password")
    if isinstance(email, str) and email and isinstance(password, str) and password:
        return email, password
    return None


def load_credentials() -> tuple[str, str, str] | None:
    keyring = system_keyring()
    if keyring is not None:
        try:
            blob = keyring.get_password(KEYRING_SERVICE, KEYRING_ACCOUNT)
        except Exception as exc:
            warn(f"System credential store unavailable ({type(exc).__name__}).")
            blob = None
        if blob:
            try:
                parsed = parse_credentials(json.loads(blob))
            except ValueError:
                parsed = None
            if parsed:
                return parsed[0], parsed[1], "keychain"
    path = credentials_file()
    if path.exists():
        try:
            parsed = parse_credentials(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            parsed = None
        if parsed:
            return parsed[0], parsed[1], "file"
    return None


def delete_credentials() -> list[str]:
    removed = []
    keyring = system_keyring()
    if keyring is not None:
        try:
            if keyring.get_password(KEYRING_SERVICE, KEYRING_ACCOUNT) is not None:
                keyring.delete_password(KEYRING_SERVICE, KEYRING_ACCOUNT)
                removed.append("keychain")
        except Exception as exc:
            warn(f"Could not remove the keychain entry ({type(exc).__name__}).")
    if credentials_file().exists():
        credentials_file().unlink()
        removed.append("file")
    return removed


# ---------------------------------------------------------------------------
# login against the data service (runs inside the managed environment)
# ---------------------------------------------------------------------------


def error_code(exc: Exception, message: str) -> int | None:
    code = getattr(exc, "code", None)
    if isinstance(code, int):
        return code
    # Business errors read "[<error code label> <code> : <message>]"; the label is Chinese.
    match = re.search("错误码\\s*(\\d+)", message) or re.search(r"\bHTTP (\d{3})\b", message)
    return int(match.group(1)) if match else None


def tqx_login(email: str, password: str) -> int | None:
    """Log this process in. Return None on success, or the exit code after reporting."""
    import tqx_data

    try:
        tqx_data.init_token(username=email, password=password)
    except Exception as exc:
        message = str(exc).replace(password, "***")
        code = error_code(exc, message)
        if code in CREDENTIALS_REJECTED_CODES:
            return fail(
                EXIT_REJECTED,
                "credentials_rejected",
                message,
                hint="Ask the user to re-enter the email and password, then run login. " + BETA_HINT,
            )
        if code in ACCESS_DENIED_CODES:
            return fail(EXIT_REJECTED, "access_denied", message, hint=BETA_HINT)
        return fail(
            EXIT_ERROR,
            "login_failed",
            message,
            hint="The data service could not complete the login; retry later. "
            "Previously saved credentials are unchanged, so do not ask the user again.",
        )
    return None


def read_login_input() -> tuple[str, str] | None:
    if sys.stdin.isatty():
        import getpass

        email = input("TQX data account email: ").strip()
        password = getpass.getpass("Password: ")
    else:
        try:
            parsed = parse_credentials(json.loads(sys.stdin.read()))
        except ValueError:
            return None
        if parsed is None:
            return None
        email, password = parsed[0].strip(), parsed[1]
    if "@" not in email or not password:
        return None
    return email, password


def cmd_login(args: argparse.Namespace) -> int:
    supplied = read_login_input()
    if supplied is None:
        return fail(
            EXIT_USAGE,
            "invalid_input",
            'Pass {"email": "...", "password": "..."} as JSON on stdin.',
        )
    email, password = supplied
    failure = tqx_login(email, password)
    if failure is not None:
        return failure
    store = save_credentials(email, password)
    emit(
        {
            "ok": True,
            "logged_in": True,
            "email": mask_email(email),
            "credential_store": store,
            "home": str(data_home()),
        }
    )
    return EXIT_OK


def cmd_status(args: argparse.Namespace) -> int:
    saved = load_credentials()
    if saved is None:
        emit({"ok": True, "saved": False, "logged_in": False, "home": str(data_home())})
        return EXIT_NOT_LOGGED_IN
    email, password, store = saved
    result = {"ok": True, "saved": True, "email": mask_email(email), "credential_store": store}
    if args.offline:
        emit(result)
        return EXIT_OK
    failure = tqx_login(email, password)
    if failure is not None:
        return failure
    result["logged_in"] = True
    emit(result)
    return EXIT_OK


def cmd_logout(args: argparse.Namespace) -> int:
    removed = delete_credentials()
    try:
        import tqx_data

        tqx_data.clear_auth()
    except Exception:
        pass
    emit({"ok": True, "removed": removed})
    return EXIT_OK


def cmd_run(args: argparse.Namespace) -> int:
    saved = load_credentials()
    if saved is None:
        return fail(
            EXIT_NOT_LOGGED_IN,
            "not_logged_in",
            "No saved tqx-data credentials. Ask the user once for the TQX data account "
            "email and password, then run login.",
        )
    failure = tqx_login(saved[0], saved[1])
    if failure is not None:
        return failure

    if args.target == "-":
        source = sys.stdin.read()
        sys.argv = ["-", *args.args]
        namespace = {"__name__": "__main__", "__file__": "<stdin>", "__builtins__": __builtins__}
        exec(compile(source, "<stdin>", "exec"), namespace)
    else:
        script = Path(args.target).resolve()
        sys.argv = [str(script), *args.args]
        sys.path.insert(0, str(script.parent))
        runpy.run_path(str(script), run_name="__main__")
    return EXIT_OK


def cmd_info(args: argparse.Namespace) -> int:
    from importlib import metadata

    import tqx_data

    doc = Path(tqx_data.__file__).parent / "tqx_data.md"
    session_file = None
    try:
        from tqx_data.auth_manager import _get_user_json_path

        session_file = _get_user_json_path()
    except Exception:
        pass
    emit(
        {
            "ok": True,
            "home": str(data_home()),
            "python": sys.executable,
            "python_version": "%d.%d.%d" % sys.version_info[:3],
            "tqx_data_version": metadata.version("tqx-data"),
            "doc": str(doc) if doc.exists() else None,
            "credential_store": describe_store(),
            "session_file": session_file,
            "session_file_in_home": session_file is not None
            and Path(session_file).resolve().parent == data_home().resolve(),
        }
    )
    return EXIT_OK


# ---------------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------------

ENVIRONMENT_COMMANDS = {"login", "status", "logout", "run", "info"}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Set up tqx-data and keep the data-account login.")
    commands = parser.add_subparsers(dest="command", required=True)

    setup = commands.add_parser("setup", help="create or update the dedicated environment")
    setup.add_argument("--upgrade", action="store_true", help="upgrade tqx-data and keyring")
    setup.add_argument("--recreate", action="store_true", help="delete and rebuild the environment")
    setup.set_defaults(func=cmd_setup)

    login = commands.add_parser("login", help="verify and save credentials read from stdin")
    login.set_defaults(func=cmd_login)

    status = commands.add_parser("status", help="report the saved login")
    status.add_argument("--offline", action="store_true", help="do not contact the data service")
    status.set_defaults(func=cmd_status)

    logout = commands.add_parser("logout", help="remove the saved credentials")
    logout.set_defaults(func=cmd_logout)

    run = commands.add_parser("run", help="log in, then run a Python script ('-' reads stdin)")
    run.add_argument("target")
    run.add_argument("args", nargs=argparse.REMAINDER)
    run.set_defaults(func=cmd_run)

    info = commands.add_parser("info", help="print environment and documentation details")
    info.set_defaults(func=cmd_info)
    return parser


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    args = build_parser().parse_args(argv)
    if args.command in ENVIRONMENT_COMMANDS and not in_managed_env():
        return delegate_to_env(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
