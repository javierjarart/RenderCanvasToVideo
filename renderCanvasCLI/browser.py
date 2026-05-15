import os
import json
import time
import subprocess
import shutil
import urllib.request
import urllib.error
import signal
from pathlib import Path
from typing import Optional

from renderCanvasCLI.progress import ProgressTracker


NODE_SERVER_SCRIPT = "server.js"


class BrowserCapture:
    def __init__(self, base_dir: str, progress: Optional[ProgressTracker] = None):
        self.base_dir = base_dir
        self.progress = progress or ProgressTracker()
        self._server_proc: subprocess.Popen | None = None

    def _find_free_port(self) -> int:
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]

    def _wait_for_server(self, port: int, timeout: float = 30.0) -> bool:
        start = time.time()
        while time.time() - start < timeout:
            try:
                resp = urllib.request.urlopen(f"http://127.0.0.1:{port}/api/projects", timeout=5)
                if resp.status == 200:
                    return True
            except (urllib.error.URLError, ConnectionRefusedError, OSError):
                pass
            time.sleep(0.5)
        return False

    def start_server(self) -> int:
        port = self._find_free_port()
        server_path = os.path.join(self.base_dir, NODE_SERVER_SCRIPT)

        env = os.environ.copy()
        env["APP_ROOT"] = self.base_dir
        env["PORT"] = str(port)
        env["CHROME_CACHE_DIR"] = os.path.join(self.base_dir, ".cache", "puppeteer")

        self._server_proc = subprocess.Popen(
            ["node", server_path],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )

        if not self._wait_for_server(port):
            stderr_output = ""
            try:
                stderr_output = self._server_proc.stderr.read(1024).decode("utf-8", errors="replace")
            except Exception:
                pass
            self.stop_server()
            raise RuntimeError(
                f"Node.js server did not start within 30s on port {port}. "
                f"stderr: {stderr_output[:300]}"
            )

        return port

    def stop_server(self) -> None:
        if self._server_proc:
            try:
                self._server_proc.terminate()
                self._server_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._server_proc.kill()
                self._server_proc.wait(timeout=2)
            except Exception:
                pass
            self._server_proc = None

    def render(self, config: dict) -> str:
        try:
            port = self.start_server()
            return self._render_via_api(port, config)
        finally:
            self.stop_server()

    def _render_via_api(self, port: int, config: dict) -> str:
        project = config.get("project", "")
        custom_path = config.get("custom_project_path", "")
        width = config.get("width", 1920)
        height = config.get("height", 1080)
        fps = config.get("fps", 60)
        duration = config.get("duration", 10)
        bg_color = config.get("bg_color", "#000000")
        output_dir = config.get("output_dir", os.path.join(self.base_dir, "renders"))
        crf = config.get("crf", 18)
        ffmpeg_preset = config.get("preset", "medium")
        codec = config.get("codec", "libx264")
        container = config.get("container", ".mp4")
        pix_fmt = config.get("pix_fmt", "yuv420p")
        codec_params = config.get("codec_params", {})

        total_frames = fps * duration
        os.makedirs(output_dir, exist_ok=True)
        self.progress.start(total_frames)

        payload = {
            "project": project,
            "width": width,
            "height": height,
            "fps": fps,
            "duration": duration,
            "bgColor": bg_color,
            "customOutputDir": output_dir,
            "crf": crf,
            "ffmpegPreset": ffmpeg_preset,
            "codec": codec,
            "container": container,
            "pixFmt": pix_fmt,
            "codecParams": codec_params,
        }
        if custom_path:
            payload["customProjectPath"] = custom_path

        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/render",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            resp = urllib.request.urlopen(req, timeout=30)
            if resp.status != 200:
                raise RuntimeError(f"Render API returned status {resp.status}")
            resp_data = json.loads(resp.read().decode("utf-8"))
            if "error" in resp_data:
                raise RuntimeError(resp_data["error"])
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Render API error ({e.code}): {err_body[:300]}")

        last_error = None
        while True:
            try:
                status_resp = urllib.request.urlopen(
                    f"http://127.0.0.1:{port}/api/status", timeout=10
                )
                status = json.loads(status_resp.read().decode("utf-8"))
            except Exception as e:
                last_error = str(e)
                time.sleep(1)
                continue

            if status["state"] == "rendering":
                self.progress.update(status.get("progress", 0))
            elif status["state"] == "done":
                self.progress.done()
                file_url = status.get("fileUrl", "")
                if file_url:
                    base_url = f"http://127.0.0.1:{port}"
                    download_url = base_url + file_url
                    try:
                        resp = urllib.request.urlopen(download_url, timeout=30)
                        filename = os.path.basename(file_url)
                        output_path = os.path.join(output_dir, filename)
                        with open(output_path, "wb") as f:
                            f.write(resp.read())
                        return output_path
                    except Exception as e:
                        self.progress.error(f"Failed to download result: {e}")
                        raise RuntimeError(f"Failed to download render: {e}")
                return os.path.join(output_dir, f"Render_{project or 'unknown'}_{int(time.time())}.mp4")
            elif status["state"] == "error":
                err = status.get("error", "Unknown error")
                self.progress.error(err)
                raise RuntimeError(f"Render failed: {err}")

            time.sleep(0.5)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.stop_server()
