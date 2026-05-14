import os
import time
import json
import sys
from pathlib import Path
from typing import Optional

from renderCanvasCLI.config import RenderConfig, ConfigManager
from renderCanvasCLI.ffmpeg import find_ffmpeg, validate_ffmpeg
from renderCanvasCLI.browser import BrowserCapture
from renderCanvasCLI.progress import ProgressTracker
from renderCanvasCLI.project import ProjectManager


class Renderer:
    def __init__(self, base_dir: str | None = None):
        self.base_dir = base_dir or os.getcwd()
        self.config_mgr = ConfigManager(self.base_dir)
        self.project_mgr = ProjectManager(self.base_dir)
        self.progress = ProgressTracker()

    def render(self, config: dict | None = None, preset: str | None = None, **overrides) -> str:
        overrides = {k: v for k, v in overrides.items() if v is not None}
        if preset:
            from renderCanvasCLI.presets import PresetManager
            cfg = PresetManager.apply(preset)
            cfg.update(overrides)
        elif config:
            cfg = dict(config)
            cfg.update(overrides)
        else:
            cfg = self.config_mgr.load().to_dict()
            cfg.update(overrides)

        project = cfg.get("project", "")
        custom_path = cfg.get("custom_project_path", "")

        if not project and not custom_path:
            projects = self.project_mgr.list()
            if not projects:
                raise ValueError(
                    "No project specified and no projects found in 'proyectos/'. "
                    "Use --project or 'python -m renderCanvasCLI init <name>' first."
                )
            cfg["project"] = projects[0]["name"]

        ffmpeg_path = find_ffmpeg()
        if not ffmpeg_path:
            raise RuntimeError(
                "FFmpeg not found. Install ffmpeg or ensure ffmpeg-static is installed via npm."
            )

        valid, msg = validate_ffmpeg(ffmpeg_path)
        if not valid:
            raise RuntimeError(f"FFmpeg validation failed: {msg}")

        fps = int(cfg.get("fps", 60))
        duration = int(cfg.get("duration", 10))
        total_frames = fps * duration

        width = int(cfg.get("width", 1920))
        height = int(cfg.get("height", 1080))
        project_name = custom_path and os.path.basename(custom_path) or cfg.get("project", "unknown")
        timestamp = int(time.time())
        filename = f"Render_{project_name}_{timestamp}.mp4"
        output_dir = cfg.get("output_dir", "") or os.path.join(self.base_dir, "renders")
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, filename)

        renders_dir = output_dir

        capture_cfg = {
            "project": project,
            "custom_project_path": custom_path,
            "width": width,
            "height": height,
            "fps": fps,
            "duration": duration,
            "bg_color": cfg.get("bg_color", "#000000"),
            "output_dir": output_dir,
            "crf": int(cfg.get("crf", 18)),
            "preset": cfg.get("ffmpeg_preset", cfg.get("preset", "medium")),
        }

        project_name_display = custom_path and os.path.basename(custom_path) or project
        print(f"  Project:   {project_name_display}")
        print(f"  Resolution: {width}x{height}")
        print(f"  Frames:    {total_frames} ({fps} fps x {duration}s)")
        print(f"  Output:    {output_path}")
        print(f"  Codec:     libx264  CRF={capture_cfg['crf']}  preset={capture_cfg['preset']}")
        print()

        capture = BrowserCapture(self.base_dir, progress=self.progress)
        result = capture.render(config=capture_cfg)

        return result

    def list_projects(self) -> list[dict]:
        return self.project_mgr.list()

    def project_info(self, name: str) -> dict | None:
        return self.project_mgr.get_info(name)

    def validate_project(self, name: str) -> tuple[bool, str]:
        return self.project_mgr.validate(name)

    def scaffold_project(self, name: str, template: str = "basic") -> Path:
        return self.project_mgr.scaffold(name, template)
