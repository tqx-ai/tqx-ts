import argparse
import contextlib
import importlib.util
import io
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

MODULE_PATH = Path(__file__).parents[1] / "scripts" / "tqx_data_auth.py"
SPEC = importlib.util.spec_from_file_location("tqx_data_auth", MODULE_PATH)
AUTH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUTH)


class DataAuthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = patch.dict(os.environ, {
            "TQX_DATA_HOME": self.temp.name,
            "TQX_DATA_CREDENTIAL_STORE": "file",
            "TQX_API_KEY": "",
            "TQX_API_BASE_URL": "",
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    def invoke(self, *args, stdin=""):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(sys, "argv", [str(MODULE_PATH), *args]), \
                patch.object(sys, "stdin", io.StringIO(stdin)), \
                contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = AUTH.main()
        return code, stdout.getvalue(), stderr.getvalue()

    def test_file_credentials_roundtrip_and_permissions(self):
        self.assertEqual(AUTH.save("secret", "https://example.test"), "file")
        self.assertEqual(AUTH.load(), ("secret", "https://example.test"))
        if os.name != "nt":
            self.assertEqual(stat.S_IMODE(AUTH.credentials_file().stat().st_mode), 0o600)
        self.assertEqual(AUTH.remove(), ["file"])
        self.assertIsNone(AUTH.load())

    def test_keychain_roundtrip_removes_obsolete_file(self):
        AUTH.save("old", "")
        keychain = Mock()
        keychain.get_password.return_value = '{"api_key":"new","base_url":""}'
        with patch.object(AUTH, "keyring_module", return_value=keychain):
            self.assertEqual(AUTH.save("new", ""), "keychain")
            self.assertFalse(AUTH.credentials_file().exists())
            self.assertEqual(AUTH.load(), ("new", ""))
            self.assertEqual(AUTH.remove(), ["keychain"])
        keychain.delete_password.assert_called_once_with(AUTH.SERVICE, AUTH.ACCOUNT)

    def test_keychain_failure_falls_back_to_file(self):
        keychain = Mock()
        keychain.set_password.side_effect = RuntimeError("unavailable")
        keychain.get_password.side_effect = RuntimeError("unavailable")
        with patch.object(AUTH, "keyring_module", return_value=keychain):
            self.assertEqual(AUTH.save("secret", ""), "file")
            self.assertEqual(AUTH.load(), ("secret", ""))

    def test_invalid_login_does_not_write_credentials(self):
        for raw in ('not json', '[]', '{}', '{"api_key":null}',
                    '{"api_key":123}', '{"api_key":" "}', '{"api_key":"secret","base_url":null}'):
            with self.subTest(raw=raw), patch.object(AUTH, "ensure_env", return_value=None):
                code, stdout, stderr = self.invoke("login", stdin=raw)
                self.assertEqual(code, 2)
                self.assertEqual(stdout, "")
                self.assertFalse(json.loads(stderr)["ok"])
                self.assertFalse(AUTH.credentials_file().exists())

    def test_login_status_and_logout_never_print_key(self):
        with patch.object(AUTH, "ensure_env", return_value=None):
            responses = [self.invoke("login", stdin='{"api_key":"secret","base_url":"https://example.test"}'),
                         self.invoke("status"), self.invoke("logout"), self.invoke("status")]
        self.assertEqual([r[0] for r in responses], [0, 0, 0, 3])
        for _, stdout, stderr in responses:
            self.assertNotIn("secret", stdout + stderr)
        self.assertFalse(AUTH.credentials_file().exists())

    def test_corrupted_store_is_reported_as_missing(self):
        AUTH.credentials_file().write_text("not json")
        self.assertIsNone(AUTH.load())

    def test_setup_flags_after_subcommand_reach_pip(self):
        AUTH.venv().mkdir()
        (AUTH.venv() / "old").write_text("old")
        with patch.object(AUTH.subprocess, "run") as run, \
                patch.object(AUTH, "ensure_env", side_effect=AssertionError("setup must not delegate")):
            code, _, _ = self.invoke("setup", "--upgrade", "--recreate")
        self.assertEqual(code, 0)
        self.assertFalse((AUTH.venv() / "old").exists())
        self.assertEqual(run.call_args_list[0].args[0],
                         [sys.executable, "-m", "venv", str(AUTH.venv())])
        self.assertEqual(run.call_args_list[1].args[0],
                         [str(AUTH.python_path()), "-m", "pip", "install", "--upgrade", "tqx-data"])

    def test_setup_reuses_existing_environment(self):
        target = AUTH.python_path()
        target.parent.mkdir(parents=True)
        target.touch()
        with patch.object(AUTH.subprocess, "run") as run:
            AUTH.setup(argparse.Namespace(upgrade=False, recreate=False))
        self.assertEqual(run.call_count, 1)
        self.assertNotIn("--upgrade", run.call_args.args[0])

    def test_missing_environment_returns_setup_error(self):
        code, stdout, stderr = self.invoke("status")
        self.assertEqual(code, 4)
        self.assertEqual(stdout, "")
        self.assertIn("setup", json.loads(stderr)["error"])

    def test_delegation_preserves_argv_and_exit_status(self):
        target = AUTH.python_path()
        target.parent.mkdir(parents=True)
        target.touch()
        with patch.object(AUTH.subprocess, "call", return_value=7) as call:
            self.assertEqual(AUTH.ensure_env(["run", "analysis.py", "--window=5"]), 7)
        self.assertEqual(call.call_args.args[0],
                         [str(target), str(MODULE_PATH.resolve()), "run", "analysis.py", "--window=5"])

    def test_no_delegation_inside_managed_environment(self):
        with patch.object(sys, "prefix", str(AUTH.venv())):
            self.assertIsNone(AUTH.ensure_env(["status"]))

    def test_run_forwards_script_args_environment_and_exit_code(self):
        AUTH.save("stored-secret", "https://saved.test")
        with patch.object(AUTH, "ensure_env", return_value=None), \
                patch.object(AUTH.subprocess, "call", return_value=9) as call:
            code, stdout, stderr = self.invoke("run", "analysis.py", "--window=5")
        self.assertEqual(code, 9)
        self.assertEqual(call.call_args.args[0], [sys.executable, "analysis.py", "--window=5"])
        self.assertEqual(call.call_args.kwargs["env"]["TQX_API_KEY"], "stored-secret")
        self.assertEqual(call.call_args.kwargs["env"]["TQX_API_BASE_URL"], "https://saved.test")
        self.assertNotIn("stored-secret", stdout + stderr)
        self.assertEqual(os.environ["TQX_API_KEY"], "")

    def test_process_credentials_take_precedence(self):
        AUTH.save("stored-secret", "https://saved.test")
        with patch.dict(os.environ, {"TQX_API_KEY": "process-secret", "TQX_API_BASE_URL": "https://process.test"}):
            env = AUTH.execution_environment()
        self.assertEqual(env["TQX_API_KEY"], "process-secret")
        self.assertEqual(env["TQX_API_BASE_URL"], "https://process.test")

    def test_process_key_does_not_inherit_saved_environment(self):
        AUTH.save("stored-secret", "https://saved.test")
        with patch.dict(os.environ, {"TQX_API_KEY": "process-secret"}):
            env = AUTH.execution_environment()
        self.assertEqual(env["TQX_API_BASE_URL"], "")

    def test_run_without_key_stops_before_child_process(self):
        with patch.object(AUTH, "ensure_env", return_value=None), \
                patch.object(AUTH.subprocess, "call") as call:
            code, _, stderr = self.invoke("run", "analysis.py")
        self.assertEqual(code, 3)
        self.assertFalse(json.loads(stderr)["ok"])
        call.assert_not_called()

    def test_stdin_execution_preserves_script_arguments(self):
        with patch.dict(os.environ, {"TQX_API_KEY": "process-secret"}), \
                patch.object(AUTH, "ensure_env", return_value=None), \
                patch.object(AUTH.subprocess, "call", return_value=0) as call:
            self.assertEqual(self.invoke("run", "-", "arg")[0], 0)
        self.assertEqual(call.call_args.args[0], [sys.executable, "-", "arg"])

    def test_run_executes_real_child_in_isolated_environment(self):
        script = Path(self.temp.name) / "check.py"
        script.write_text('import os,sys\nassert os.environ["TQX_API_KEY"] == "fake-test-key"\n'
                          'assert sys.argv[1:] == ["--window=5"]\nsys.exit(6)\n')
        AUTH.save("fake-test-key", "https://example.test")
        self.assertEqual(AUTH.run(argparse.Namespace(script_args=[str(script), "--window=5"])), 6)


if __name__ == "__main__":
    unittest.main()
