import json
import os
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional


CONFIG_FILE = "renderCanvasCLI.json"


@dataclass
class RenderConfig:
    width: int = 1920
    height: int = 1080
    fps: int = 60
    duration: int = 10
    bg_color: str = "#000000"
    output_dir: str = ""
    crf: int = 18
    preset: str = "medium"
    codec: str = "libx264"
    pixel_format: str = "yuv420p"
    color_primaries: str = ""
    color_trc: str = ""
    color_space: str = ""
    project: str = ""
    custom_project_path: str = ""

    @classmethod
    def from_dict(cls, data: dict) -> "RenderConfig":
        valid_keys = set(cls.__dataclass_fields__.keys())
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v != ""}

    def resolve(self, base_dir: str | None = None) -> dict:
        d = self.to_dict()
        if base_dir and not d.get("output_dir"):
            d["output_dir"] = os.path.join(base_dir, "renders")
        return d


class ConfigManager:
    def __init__(self, base_dir: str | None = None):
        self.base_dir = base_dir or os.getcwd()
        self.config_path = os.path.join(self.base_dir, CONFIG_FILE)
        self._config: RenderConfig | None = None

    def load(self) -> RenderConfig:
        if self._config:
            return self._config
        if os.path.exists(self.config_path):
            with open(self.config_path) as f:
                data = json.load(f)
            self._config = RenderConfig.from_dict(data)
        else:
            self._config = RenderConfig()
        return self._config

    def save(self, config: RenderConfig) -> None:
        with open(self.config_path, "w") as f:
            json.dump(config.to_dict(), f, indent=2)
        self._config = config

    def get(self, key: str, default=None):
        cfg = self.load()
        return getattr(cfg, key, default)

    def set(self, key: str, value) -> None:
        cfg = self.load()
        if hasattr(cfg, key):
            setattr(cfg, key, value)
            self.save(cfg)

    @classmethod
    def find_project_root(cls, path: str | None = None) -> str:
        start = Path(path or os.getcwd()).resolve()
        for parent in [start] + list(start.parents):
            if (parent / CONFIG_FILE).exists() or (parent / "index.html").exists():
                return str(parent)
        return str(start)
