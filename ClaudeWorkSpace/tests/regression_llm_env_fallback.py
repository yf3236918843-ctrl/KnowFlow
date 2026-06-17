import os
import sys
import types
import importlib
from pathlib import Path


ROOT = Path(r"D:\FIles\documents\Project FIles\PT\Project\core\llm_gateway\__init__.py")
CORE = ROOT.parent.parent


def load_module():
    if str(CORE) not in sys.path:
        sys.path.insert(0, str(CORE))
    return importlib.import_module("llm_gateway")


def main():
    module = load_module()
    getter = getattr(module, "_read_env_value", None)
    if getter is None:
      raise RuntimeError("_read_env_value helper should exist")

    original = os.environ.get("ARK_API_KEY")
    try:
        os.environ.pop("ARK_API_KEY", None)

        # monkeypatch winreg path inside module
        fake_winreg = types.SimpleNamespace(
            HKEY_CURRENT_USER=1,
            HKEY_LOCAL_MACHINE=2,
            KEY_READ=0,
            KEY_WOW64_64KEY=0,
            OpenKey=lambda root, path, *args: (root, path),
            QueryValueEx=lambda handle, name: ("ark-from-registry", None),
            CloseKey=lambda handle: None,
        )
        module.winreg = fake_winreg

        value = getter("ARK_API_KEY")
        if value != "ark-from-registry":
            raise RuntimeError("env fallback should read Windows registry value")
    finally:
        if original is not None:
            os.environ["ARK_API_KEY"] = original

    print("PASS: llm env fallback regression")


if __name__ == "__main__":
    main()
