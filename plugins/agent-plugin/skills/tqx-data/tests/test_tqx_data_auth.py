import importlib.util
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "tqx_data_auth.py"
SPEC = importlib.util.spec_from_file_location("tqx_data_auth", MODULE_PATH)
AUTH = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(AUTH)


class CredentialStoreTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.previous_home = os.environ.get("TQX_DATA_HOME")
        self.previous_store = os.environ.get("TQX_DATA_CREDENTIAL_STORE")
        os.environ["TQX_DATA_HOME"] = self.tempdir.name
        os.environ["TQX_DATA_CREDENTIAL_STORE"] = "file"

    def tearDown(self):
        self.tempdir.cleanup()
        if self.previous_home is None:
            os.environ.pop("TQX_DATA_HOME", None)
        else:
            os.environ["TQX_DATA_HOME"] = self.previous_home
        if self.previous_store is None:
            os.environ.pop("TQX_DATA_CREDENTIAL_STORE", None)
        else:
            os.environ["TQX_DATA_CREDENTIAL_STORE"] = self.previous_store

    def test_save_load_and_remove_file_credentials(self):
        self.assertEqual(AUTH.save("secret", "https://example.test"), "file")
        self.assertEqual(AUTH.load(), ("secret", "https://example.test"))
        self.assertEqual(AUTH.remove(), ["file"])
        self.assertIsNone(AUTH.load())

    def test_read_login_accepts_json_from_stdin(self):
        stream = io.StringIO('{"api_key":"secret","base_url":"https://example.test"}')
        previous_stdin = sys.stdin
        sys.stdin = stream
        try:
            self.assertEqual(AUTH.read_login(), ("secret", "https://example.test"))
        finally:
            sys.stdin = previous_stdin


if __name__ == "__main__":
    unittest.main()
