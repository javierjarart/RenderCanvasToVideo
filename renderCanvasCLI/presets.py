from typing import Any


PRESETS: dict[str, dict[str, Any]] = {
    "hd-30": {
        "name": "HD 30fps",
        "description": "1920x1080 at 30 fps - standard quality",
        "width": 1920,
        "height": 1080,
        "fps": 30,
        "crf": 23,
        "codec": "libx264",
        "container": ".mp4",
        "pix_fmt": "yuv420p",
        "preset": "medium",
    },
    "hd-60": {
        "name": "HD 60fps",
        "description": "1920x1080 at 60 fps - smooth quality",
        "width": 1920,
        "height": 1080,
        "fps": 60,
        "crf": 18,
        "codec": "libx264",
        "container": ".mp4",
        "pix_fmt": "yuv420p",
        "preset": "medium",
    },
    "fullhd-60": {
        "name": "Full HD 60fps",
        "description": "1920x1080 at 60 fps - high quality",
        "width": 1920,
        "height": 1080,
        "fps": 60,
        "crf": 16,
        "codec": "libx264",
        "container": ".mp4",
        "pix_fmt": "yuv420p",
        "preset": "slow",
    },
    "4k-30": {
        "name": "4K 30fps",
        "description": "3840x2160 at 30 fps",
        "width": 3840,
        "height": 2160,
        "fps": 30,
        "crf": 18,
        "codec": "libx264",
        "container": ".mp4",
        "pix_fmt": "yuv420p",
        "preset": "medium",
    },
    "4k-60": {
        "name": "4K 60fps",
        "description": "3840x2160 at 60 fps",
        "width": 3840,
        "height": 2160,
        "fps": 60,
        "crf": 16,
        "codec": "libx264",
        "container": ".mp4",
        "pix_fmt": "yuv420p",
        "preset": "slow",
    },
    "square-1k-30": {
        "name": "Square 1K 30fps",
        "description": "1080x1080 at 30 fps - social media",
        "width": 1080,
        "height": 1080,
        "fps": 30,
        "crf": 23,
        "codec": "libx264",
        "container": ".mp4",
        "pix_fmt": "yuv420p",
        "preset": "medium",
    },
    "vertical-hd-30": {
        "name": "Vertical HD 30fps",
        "description": "1080x1920 at 30 fps - stories/reels",
        "width": 1080,
        "height": 1920,
        "fps": 30,
        "crf": 23,
        "codec": "libx264",
        "container": ".mp4",
        "pix_fmt": "yuv420p",
        "preset": "medium",
    },
    "preview": {
        "name": "Preview",
        "description": "640x360 at 15 fps - fast draft",
        "width": 640,
        "height": 360,
        "fps": 15,
        "crf": 28,
        "codec": "libx264",
        "container": ".mp4",
        "pix_fmt": "yuv420p",
        "preset": "ultrafast",
    },
    "draft": {
        "name": "Draft",
        "description": "854x480 at 24 fps - quick preview",
        "width": 854,
        "height": 480,
        "fps": 24,
        "crf": 26,
        "codec": "libx264",
        "container": ".mp4",
        "pix_fmt": "yuv420p",
        "preset": "veryfast",
    },
    "hap-q-hd": {
        "name": "HAP_Q HD",
        "description": "1920x1080 with HAP_Q codec - optimized for real-time playback",
        "width": 1920,
        "height": 1080,
        "fps": 60,
        "codec": "hap",
        "container": ".mov",
        "pix_fmt": "yuv420p",
        "codec_params": {"format": "hap_q"},
        "preset": "medium",
    },
    "hap-q-4k": {
        "name": "HAP_Q 4K",
        "description": "3840x2160 with HAP_Q codec - 4K for real-time playback",
        "width": 3840,
        "height": 2160,
        "fps": 30,
        "codec": "hap",
        "container": ".mov",
        "pix_fmt": "yuv420p",
        "codec_params": {"format": "hap_q"},
        "preset": "medium",
    },
    "hap-alpha-hd": {
        "name": "HAP_Alpha HD",
        "description": "1920x1080 with HAP_Alpha codec - includes alpha channel",
        "width": 1920,
        "height": 1080,
        "fps": 60,
        "codec": "hap",
        "container": ".mov",
        "pix_fmt": "yuv420p",
        "codec_params": {"format": "hap_alpha"},
        "preset": "medium",
    },
    "cfhd-film-hd": {
        "name": "CineForm Film HD",
        "description": "1920x1080 with GoPro CineForm at film quality - highest quality intermediate",
        "width": 1920,
        "height": 1080,
        "fps": 60,
        "codec": "cfhd",
        "container": ".mov",
        "pix_fmt": "yuv422p",
        "codec_params": {"quality": "film1"},
        "preset": "medium",
    },
    "cfhd-high-hd": {
        "name": "CineForm High HD",
        "description": "1920x1080 with GoPro CineForm at high quality",
        "width": 1920,
        "height": 1080,
        "fps": 60,
        "codec": "cfhd",
        "container": ".mov",
        "pix_fmt": "yuv422p",
        "codec_params": {"quality": "high"},
        "preset": "medium",
    },
    "cfhd-medium-hd": {
        "name": "CineForm Medium HD",
        "description": "1920x1080 with GoPro CineForm at medium quality",
        "width": 1920,
        "height": 1080,
        "fps": 60,
        "codec": "cfhd",
        "container": ".mov",
        "pix_fmt": "yuv422p",
        "codec_params": {"quality": "medium"},
        "preset": "medium",
    },
    "cfhd-film-4k": {
        "name": "CineForm Film 4K",
        "description": "3840x2160 with GoPro CineForm at film quality",
        "width": 3840,
        "height": 2160,
        "fps": 30,
        "codec": "cfhd",
        "container": ".mov",
        "pix_fmt": "yuv422p",
        "codec_params": {"quality": "film1"},
        "preset": "medium",
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
        codec = preset.get("codec", "libx264")
        container = preset.get("container", ".mp4")
        pix_fmt = preset.get("pix_fmt", "yuv420p")
        params = preset.get("codec_params", {})
        params_str = " ".join(f"{k}={v}" for k, v in params.items()) if params else ""
        crf_str = f"crf={preset['crf']}" if 'crf' in preset else ""
        codec_str = f"codec={codec} pix_fmt={pix_fmt}"
        extras = f" {codec_str}"
        if crf_str:
            extras += f" {crf_str}"
        extras += f" preset={preset['preset']} container={container}"
        if params_str:
            extras += f" {params_str}"
        return (
            f"{preset['name']}: {preset['description']}\n"
            f"  {preset['width']}x{preset['height']} @ {preset['fps']}fps{extras}"
        )
