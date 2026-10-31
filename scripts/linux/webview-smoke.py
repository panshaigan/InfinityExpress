"""Drive the packaged WebKit view and real Tauri commands using disposable data."""
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def main():
    output = Path(os.environ["IE_SMOKE_RESULT_DIR"])
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    os.environ["TAURI_WEBVIEW_AUTOMATION"] = "true"
    with (output / "webdriver.log").open("w") as log:
        driver = subprocess.Popen(["WebKitWebDriver", f"--port={port}"], stdout=log, stderr=log)
        session = None
        def request(method, path, data=None):
            payload = None if data is None else json.dumps(data).encode()
            req = Request(f"http://127.0.0.1:{port}{path}", data=payload, method=method,
                          headers={"Content-Type": "application/json"})
            try:
                with urlopen(req, timeout=90) as response:
                    return json.load(response)["value"]
            except HTTPError as error:
                raise RuntimeError(error.read().decode()) from error

        try:
            for _ in range(50):
                try:
                    request("GET", "/status")
                    break
                except OSError:
                    time.sleep(0.1)
            result = request("POST", "/session", {"capabilities": {"alwaysMatch": {
                "webkitgtk:browserOptions": {"binary": os.environ["IE_SMOKE_BINARY"], "args": []}
            }}})
            session = result["sessionId"]
            prefix = f"/session/{session}"
            request("POST", prefix + "/timeouts", {"script": 60000})
            def execute(script, args=None):
                return request("POST", prefix + "/execute/sync", {"script": script, "args": args or []})

            for _ in range(50):
                if execute("return document.querySelector('#root')?.childElementCount > 0 && document.body.innerText.length > 100"):
                    break
                time.sleep(0.2)
            else:
                raise AssertionError("React did not render the initial app screen")
            # WebKit's screenshot endpoint can stall without a compositor under
            # Xvfb. Capture the real X11 display independently of WebDriver.
            window = subprocess.check_output(["xdotool", "search", "--name", "iNfinity eXpress"], text=True).splitlines()[0]
            subprocess.run(["xdotool", "windowmap", window, "windowraise", window], check=True)
            time.sleep(3)  # DOM readiness precedes the first native paint.
            subprocess.run(["import", "-window", window, str(output / "linux-window.png")], check=True, timeout=15)
            print("PASS: packaged React UI rendered", flush=True)

            def invoke(command, **args):
                print(f"Checking native command: {command}", flush=True)
                value = request("POST", prefix + "/execute/async", {
                    "script": "const done=arguments[arguments.length-1]; window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value}),error=>done({ok:false,error:String(error)}));",
                    "args": [command, args],
                })
                if not value["ok"]:
                    raise RuntimeError(f"{command}: {value['error']}")
                return value.get("value")

            weidu = invoke("bundled_weidu_path")
            assert Path(weidu).is_file() and os.access(weidu, os.X_OK), weidu
            with tempfile.TemporaryDirectory(prefix="ie-native-ipc-") as folder:
                root = Path(folder)
                game = root / "game"
                game.mkdir()
                (game / "chitin.key").write_bytes(b"KEY V1  " + struct.pack("<IIII", 0, 0, 24, 24))
                tlk = b"TLK V1  " + struct.pack("<HII", 0, 0, 18)
                (game / "dialog.tlk").write_bytes(tlk)
                (game / "lang/en_US").mkdir(parents=True)
                (game / "lang/en_US/dialog.tlk").write_bytes(tlk)
                (game / "BaldursGate").write_bytes(b"\x7fELFfixture")
                (game / "BaldursGate").chmod(0o755)
                assert invoke("read_game_exe_version", gameDir=str(game), exeName="Baldur.exe") == ""
                issues = invoke("check_install_compatibility", requests=[
                    {"stepId": "bubb", "gameDir": str(game), "componentId": "bubb_revert_pathfinding:0", "modId": "IE-Snippets"},
                    {"stepId": "eeex", "gameDir": str(game), "componentId": "EEex:1", "modId": "EEex"},
                ])
                assert [issue["action"] for issue in issues] == ["skip", "block"], issues
                backup = invoke("backup_game_dir", input={"sourceDir": str(game), "backupRoot": str(root / "backups"),
                                "gameKey": "bg1", "kind": "vanilla", "excludeSafeDirs": False})
                assert os.access(Path(backup["path"]) / "BaldursGate", os.X_OK)
                source = root / "mods/download/fixture"
                source.mkdir(parents=True)
                (source / "payload.txt").write_text("Native backend installation\n")
                (source / "setup-fixture.tp2").write_text('BACKUP ~fixture/backup~\nAUTHOR ~Linux IPC smoke~\nBEGIN ~Fixture~\nLABEL ~ie_native_ipc~\nCOPY ~fixture/payload.txt~ ~override/ie-native-ipc.txt~\n')
                tp2 = invoke("stage_mod_into_game_dir", modsDownloadDir=str(root / "mods"), codename="download",
                             gameDir=str(game), tp2Hint="fixture", gameVersion=None)
                step = {"weiduPath": weidu, "tp2Path": tp2, "gameDir": str(game), "componentNumber": 0,
                        "languageIndex": 0, "logDir": str(root / "logs"), "stepFolder": "fixture-0"}
                for _ in range(2):
                    installed = invoke("run_weidu_step", input={**step, "componentId": "fixture:0", "stepId": "single:0000", "timeoutSecs": 60})
                    assert installed["exitCode"] in (0, 3) and installed["logVerified"], installed
                    assert (game / "override/ie-native-ipc.txt").read_bytes() == (source / "payload.txt").read_bytes()
                snapshot = invoke("create_named_backup", input={"sourceDir": str(game), "backupRoot": str(root / "backups"),
                                  "gameKey": "bg1", "kind": "snapshot", "name": "installed", "excludeSafeDirs": False})
                invoke("run_weidu_force_uninstall", input=step)
                assert not (game / "override/ie-native-ipc.txt").exists()
                invoke("restore_game_dir", backupPath=snapshot["path"], targetDir=str(game))
                assert (game / "override/ie-native-ipc.txt").exists()
                invoke("restore_game_dir", backupPath=backup["path"], targetDir=str(game))
                assert not (game / "override/ie-native-ipc.txt").exists()
                assert os.access(game / "BaldursGate", os.X_OK)
            print("PASS: packaged React view, bundled tools, native game probe, compatibility, staging, install/reinstall, uninstall, snapshot and vanilla restore")
        finally:
            try:
                if session:
                    request("DELETE", f"/session/{session}")
            finally:
                driver.terminate()
                driver.wait(timeout=10)


if __name__ == "__main__":
    main()
