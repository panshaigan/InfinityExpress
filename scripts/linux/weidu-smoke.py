"""Exercise bundled Linux WeiDU on a disposable, minimal Infinity Engine fixture.

Uses the app's install/uninstall flags and setup naming, without --nogame.
This verifies file operations and rollback, not compatibility with real game data.
"""
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
WEIDU = ROOT / "src-tauri/resources/weidu/linux-amd64/weidu"


def main():
    with tempfile.TemporaryDirectory(prefix="ie-linux-weidu-") as folder:
        game = Path(folder)
        mod = game / "fixture"
        mod.mkdir()
        (game / "chitin.key").write_bytes(b"KEY V1  " + struct.pack("<IIII", 0, 0, 24, 24))
        tlk = b"TLK V1  " + struct.pack("<HII", 0, 0, 18)
        (game / "dialog.tlk").write_bytes(tlk)
        lang = game / "lang/en_US"
        lang.mkdir(parents=True)
        (lang / "dialog.tlk").write_bytes(tlk)
        (mod / "payload.txt").write_text("Linux install fixture\n")
        (mod / "setup-fixture.tp2").write_text('''BACKUP ~fixture/backup~
AUTHOR ~InfinityExpress Linux smoke test~
BEGIN ~Linux file installation fixture~
LABEL ~ie_linux_smoke~
COPY ~fixture/payload.txt~ ~override/linux-smoke.txt~
''')
        setup = game / "setup-fixture"
        shutil.copy2(WEIDU, setup)
        setup.chmod(0o755)

        def run(*args):
            result = subprocess.run([str(setup), "--noautoupdate", "--no-exit-pause",
                                     "--skip-at-view", *args], cwd=game,
                                    input="", text=True, capture_output=True, timeout=60)
            if result.returncode not in (0, 3):
                raise RuntimeError(f"WeiDU {args}: exit {result.returncode}\n{result.stdout}\n{result.stderr}")
            return result.stdout

        listing = run("--nogame", "--list-components-json", "fixture/setup-fixture.tp2", "0")
        decoder = json.JSONDecoder()
        rows = None
        for i, char in enumerate(listing):
            if char != "[":
                continue
            try:
                candidate, _ = decoder.raw_decode(listing[i:])
                if isinstance(candidate, list) and candidate and isinstance(candidate[0], dict):
                    rows = candidate
                    break
            except json.JSONDecodeError:
                pass
        assert rows and rows[0]["number"] == 0 and "ie_linux_smoke" in rows[0]["label"], listing

        flags = ["--language", "0", "--use-lang", "en_US"]
        def installed():
            # WeiDU preserves commented history after uninstall.
            return any(line.startswith("~") and "#0 #0" in line
                       for line in (game / "weidu.log").read_text().splitlines())

        for _ in range(2):  # reinstall exercises WeiDU's uninstall-before-install path
            run(*flags, "--force-install", "0")
            assert (game / "override/linux-smoke.txt").read_bytes() == (mod / "payload.txt").read_bytes()
            assert installed()
        run(*flags, "--force-uninstall", "0")
        assert not (game / "override/linux-smoke.txt").exists()
        assert not installed()
        print("PASS: native WeiDU metadata, install, reinstall, and uninstall/rollback")


if __name__ == "__main__":
    main()
