from typing import Any


PRESETS: dict[str, dict[str, Any]] = {
    "hd-30": {
        "name": "HD 30fps",
        "description": "1920x1080 at 30 fps - standard quality",
        "width": 1920,
        "height": 1080,
        "fps": 30,
        "crf": 23,
        "preset": "medium",
    },
    "hd-60": {
        "name": "HD 60fps",
        "description": "1920x1080 at 60 fps - smooth quality",
        "width": 1920,
        "height": 1080,
        "fps": 60,
        "crf": 18,
        "preset": "medium",
    },
    "fullhd-60": {
        "name": "Full HD 60fps",
        "description": "1920x1080 at 60 fps - high quality",
        "width": 1920,
        "height": 1080,
        "fps": 60,
        "crf": 16,
        "preset": "slow",
    },
    "4k-30": {
        "name": "4K 30fps",
        "description": "3840x2160 at 30 fps",
        "width": 3840,
        "height": 2160,
        "fps": 30,
        "crf": 18,
        "preset": "medium",
    },
    "4k-60": {
        "name": "4K 60fps",
        "description": "3840x2160 at 60 fps",
        "width": 3840,
        "height": 2160,
        "fps": 60,
        "crf": 16,
        "preset": "slow",
    },
    "square-1k-30": {
        "name": "Square 1K 30fps",
        "description": "1080x1080 at 30 fps - social media",
        "width": 1080,
        "height": 1080,
        "fps": 30,
        "crf": 23,
        "preset": "medium",
    },
    "vertical-hd-30": {
        "name": "Vertical HD 30fps",
        "description": "1080x1920 at 30 fps - stories/reels",
        "width": 1080,
        "height": 1920,
        "fps": 30,
        "crf": 23,
        "preset": "medium",
    },
    "preview": {
        "name": "Preview",
        "description": "640x360 at 15 fps - fast draft",
        "width": 640,
        "height": 360,
        "fps": 15,
        "crf": 28,
        "preset": "ultrafast",
    },
    "draft": {
        "name": "Draft",
        "description": "854x480 at 24 fps - quick preview",
        "width": 854,
        "height": 480,
        "fps": 24,
        "crf": 26,
        "preset": "veryfast",
    },
}


class PresetManager:
    @staticmethod
    def list() -> dict[str, dict]:
        return dict(PRESETS)

    @staticmethod
    def get(name: str) -> dict | None:
        return PRESETS.get(name)

    @staticmethod
    def apply(name: str, overrides: dict | None = None) -> dict:
        preset = PRESETS.get(name)
        if preset is None:
            raise ValueError(f"Unknown preset: {name}. Available: {', '.join(PRESETS)}")
        result = dict(preset)
        if overrides:
            result.update(overrides)
        return result

    @staticmethod
    def describe(name: str) -> str:
        preset = PRESETS.get(name)
        if preset is None:
            return f"Unknown preset: {name}"
        return (
            f"{preset['name']}: {preset['description']}\n"
            f"  {preset['width']}x{preset['height']} @ {preset['fps']}fps"
            f"  crf={preset['crf']} preset={preset['preset']}"
        )
