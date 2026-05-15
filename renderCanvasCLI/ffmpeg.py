import os
import platform
import subprocess
import shutil
from pathlib import Path
from typing import Optional


def find_ffmpeg() -> Optional[str]:
    candidates = [
        os.getenv("FFMPEG_PATH"),
    ]

    bundled = os.path.join(os.path.dirname(os.path.dirname(__file__)), "bin", "ffmpeg")
    if platform.system() == "Windows":
        bundled_exe = bundled + ".exe"
        if os.path.exists(bundled_exe):
            candidates.append(bundled_exe)
    elif os.path.exists(bundled):
        candidates.append(bundled)

    node_ffmpeg_static = _find_node_ffmpeg_static()
    if node_ffmpeg_static:
        candidates.append(node_ffmpeg_static)

    candidates.append(shutil.which("ffmpeg"))

    for path in candidates:
        if path and os.path.exists(path):
            return os.path.abspath(path)

    if platform.system() == "Windows":
        for p in (r"C:\ffmpeg\bin\ffmpeg.exe", r"C:\Program Files\ffmpeg\bin\ffmpeg.exe"):
            if os.path.exists(p):
                return p

    return None


def _find_node_ffmpeg_static() -> Optional[str]:
    base = Path(os.path.dirname(os.path.dirname(__file__)))
    candidates = [
        base / "node_modules" / "ffmpeg-static" / "ffmpeg",
        base / "node_modules" / "ffmpeg-static" / "ffmpeg.exe",
    ]
    for p in candidates:
        if p.exists():
            return str(p.resolve())
    return None


def validate_ffmpeg(path: str) -> tuple[bool, str]:
    try:
        result = subprocess.run(
            [path, "-version"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            version_line = result.stdout.splitlines()[0] if result.stdout else "unknown"
            return True, version_line
        return False, f"ffmpeg exited with code {result.returncode}"
    except FileNotFoundError:
        return False, f"ffmpeg not found at {path}"
    except subprocess.TimeoutExpired:
        return False, "ffmpeg timed out"
    except Exception as e:
        return False, str(e)


def get_ffmpeg_info(path: str) -> dict:
    result = subprocess.run(
        [path, "-version"],
        capture_output=True, text=True, timeout=10
    )
    info = {"path": path, "version": "unknown", "codecs": []}
    if result.returncode == 0:
        lines = result.stdout.splitlines()
        if lines:
            info["version"] = lines[0]
        for line in lines:
            if "configuration:" in line.lower():
                info["configuration"] = line.strip()
                break
    return info


def probe_video(path: str, ffmpeg_path: str) -> Optional[dict]:
    try:
        result = subprocess.run(
            [ffmpeg_path, "-i", path],
            capture_output=True, text=True, timeout=30
        )
        stderr = result.stderr
        info = {}
        for line in stderr.splitlines():
            line = line.strip()
            if "Duration:" in line:
                info["duration"] = line.split("Duration:")[1].split(",")[0].strip()
            if "Stream" in line and "Video:" in line:
                parts = line.split("Video:")[1].split(",")
                info["codec"] = parts[0].strip()
                for p in parts:
                    p = p.strip()
                    if "x" in p and any(c.isdigit() for c in p):
                        info["resolution"] = p
        return info if info else None
    except Exception:
        return None
