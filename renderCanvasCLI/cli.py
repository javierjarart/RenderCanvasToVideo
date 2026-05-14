import argparse
import os
import sys
import textwrap

from renderCanvasCLI import __version__
from renderCanvasCLI.config import ConfigManager, RenderConfig
from renderCanvasCLI.renderer import Renderer
from renderCanvasCLI.ffmpeg import find_ffmpeg, validate_ffmpeg, get_ffmpeg_info, probe_video
from renderCanvasCLI.presets import PresetManager
from renderCanvasCLI.project import ProjectManager


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="renderCanvasCLI",
        description="Render HTML5 Canvas animations to MP4 video.",
        epilog="Examples:\n"
               "  renderCanvasCLI render --project my-anim --duration 5\n"
               "  renderCanvasCLI init my-project\n"
               "  renderCanvasCLI render --preset 4k-60 --project particle-storm\n"
               "  renderCanvasCLI projects\n"
               "  renderCanvasCLI config set fps 30\n",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument("--cwd", help="Working directory (default: current)")

    sub = parser.add_subparsers(dest="command", metavar="<command>")

    r = sub.add_parser("render", help="Render a project to video")
    r.add_argument("--project", "-p", help="Project name from proyectos/")
    r.add_argument("--dir", "-d", help="External project directory path")
    r.add_argument("--preset", help="Render preset name (use 'presets' to list)")
    r.add_argument("--width", type=int, help="Video width in pixels")
    r.add_argument("--height", type=int, help="Video height in pixels")
    r.add_argument("--fps", type=int, help="Frames per second")
    r.add_argument("--duration", type=float, help="Duration in seconds")
    r.add_argument("--bg", "--bg-color", dest="bg_color", help="Background color (hex)")
    r.add_argument("--output", "-o", help="Output directory")
    r.add_argument("--crf", type=int, help="FFmpeg CRF quality (0-51, lower=better)")
    r.add_argument("--ffpreset", "--ffmpeg-preset", dest="ffpreset", help="FFmpeg preset (ultrafast, medium, slow, etc.)")

    i = sub.add_parser("init", help="Scaffold a new canvas project")
    i.add_argument("name", help="Project name")
    i.add_argument("--template", "-t", default="basic", help="Template to use (default: basic)")

    s = sub.add_parser("projects", aliases=["ls"], help="List available projects")
    s.add_argument("--info", nargs="?", const=True, default=False, help="Show project details")

    v = sub.add_parser("validate", help="Validate a project structure")
    v.add_argument("name", help="Project name")

    pr = sub.add_parser("presets", help="List available render presets")
    pr.add_argument("name", nargs="?", help="Show details for a specific preset")

    c = sub.add_parser("config", help="View or modify configuration")
    c.add_argument("action", nargs="?", choices=["get", "set", "list", "reset"], default="list")
    c.add_argument("key", nargs="?", help="Configuration key")
    c.add_argument("value", nargs="?", help="Configuration value")

    f = sub.add_parser("ffmpeg", help="Check FFmpeg status")
    f.add_argument("--probe", help="Probe a video file for info")

    args = parser.parse_args(argv)

    base_dir = args.cwd or os.getcwd()

    if args.command is None:
        parser.print_help()
        return 0

    if args.command == "render":
        return _cmd_render(args, base_dir)
    elif args.command == "init":
        return _cmd_init(args, base_dir)
    elif args.command in ("projects", "ls"):
        return _cmd_projects(args, base_dir)
    elif args.command == "validate":
        return _cmd_validate(args, base_dir)
    elif args.command == "presets":
        return _cmd_presets(args)
    elif args.command == "config":
        return _cmd_config(args, base_dir)
    elif args.command == "ffmpeg":
        return _cmd_ffmpeg(args)
    return 0


def _cmd_render(args, base_dir: str) -> int:
    renderer = Renderer(base_dir)
    overrides = {}
    if args.project:
        overrides["project"] = args.project
    if args.dir:
        overrides["custom_project_path"] = os.path.abspath(args.dir)
    if args.width:
        overrides["width"] = args.width
    if args.height:
        overrides["height"] = args.height
    if args.fps:
        overrides["fps"] = args.fps
    if args.duration:
        overrides["duration"] = args.duration
    if args.bg_color:
        overrides["bg_color"] = args.bg_color
    if args.output:
        overrides["output_dir"] = os.path.abspath(args.output)
    if args.crf is not None:
        overrides["crf"] = args.crf
    if args.ffpreset:
        overrides["ffmpeg_preset"] = args.ffpreset

    kwargs = {}
    if args.preset:
        kwargs["preset"] = args.preset
    try:
        result = renderer.render(**kwargs, **overrides)
        print(f"\n  Output: {result}")
        return 0
    except (ValueError, RuntimeError, FileNotFoundError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def _cmd_init(args, base_dir: str) -> int:
    mgr = ProjectManager(base_dir)
    try:
        path = mgr.scaffold(args.name, args.template)
        print(f"Created project '{args.name}' at {path}")
        print(f"  Edit {path / 'script.js'} to create your animation,")
        print(f"  then run: renderCanvasCLI render --project {args.name}")
        return 0
    except (FileExistsError, ValueError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def _cmd_projects(args, base_dir: str) -> int:
    mgr = ProjectManager(base_dir)
    projects = mgr.list()
    if not projects:
        print("No projects found in 'proyectos/'")
        print("Create one: renderCanvasCLI init <name>")
        return 0

    if args.info:
        target = args.info if isinstance(args.info, str) else None
        if target:
            info = mgr.get_info(target)
            if not info:
                print(f"Project '{target}' not found")
                return 1
            print(f"  Name:    {info['name']}")
            print(f"  Path:    {info['path']}")
            print(f"  Scripts: {', '.join(info['scripts']) or 'none'}")
            print(f"  Styles:  {', '.join(info['styles']) or 'none'}")
            print(f"  Config:  {'yes' if info['has_config'] else 'no'}")
            print(f"  Files:")
            for f in info["files"]:
                print(f"    - {f}")
        else:
            print("Projects:")
            for p in projects:
                print(f"  - {p['name']}")
            print(f"\n{len(projects)} project(s)")
    else:
        width = max((len(p["name"]) for p in projects), default=0)
        print(f"{'Project':<{width+2}} {'Scripts':<20} {'Config':<8}")
        print("-" * (width + 30))
        for p in projects:
            info = mgr.get_info(p["name"])
            scripts = ", ".join(info["scripts"]) if info else ""
            has_cfg = "yes" if p["has_config"] else "no"
            print(f"{p['name']:<{width+2}} {scripts:<20} {has_cfg:<8}")
    return 0


def _cmd_validate(args, base_dir: str) -> int:
    mgr = ProjectManager(base_dir)
    valid, msg = mgr.validate(args.name)
    if valid:
        print(f"  Project '{args.name}' is valid")
        return 0
    else:
        print(f"  Project '{args.name}' is invalid: {msg}", file=sys.stderr)
        return 1


def _cmd_presets(args) -> int:
    if args.name:
        desc = PresetManager.describe(args.name)
        print(desc)
    else:
        presets = PresetManager.list()
        print(f"{'Name':<16} {'Resolution':<14} {'FPS':<6} {'CRF':<5} {'Preset':<12} Description")
        print("-" * 90)
        for name, p in presets.items():
            res = f"{p['width']}x{p['height']}"
            print(f"{name:<16} {res:<14} {p['fps']:<6} {p['crf']:<5} {p['preset']:<12} {p['description']}")
    return 0


def _cmd_config(args, base_dir: str) -> int:
    mgr = ConfigManager(base_dir)
    if args.action == "list":
        cfg = mgr.load()
        print(f"Configuration ({mgr.config_path}):")
        for key, value in sorted(cfg.to_dict().items()):
            print(f"  {key}: {value}")
    elif args.action == "get":
        if not args.key:
            print("Usage: renderCanvasCLI config get <key>", file=sys.stderr)
            return 1
        val = mgr.get(args.key)
        print(val if val is not None else f"Key '{args.key}' not set")
    elif args.action == "set":
        if not args.key or args.value is None:
            print("Usage: renderCanvasCLI config set <key> <value>", file=sys.stderr)
            return 1
        val = _coerce_value(args.value)
        mgr.set(args.key, val)
        print(f"  Set {args.key} = {val}")
    elif args.action == "reset":
        cfg = RenderConfig()
        mgr.save(cfg)
        print(f"  Configuration reset to defaults")
    return 0


def _cmd_ffmpeg(args) -> int:
    path = find_ffmpeg()
    if not path:
        print("FFmpeg not found. Install it or run: npm install ffmpeg-static")
        return 1

    print(f"  FFmpeg: {path}")
    valid, msg = validate_ffmpeg(path)
    if not valid:
        print(f"  Error: {msg}", file=sys.stderr)
        return 1
    print(f"  Status: OK")
    info = get_ffmpeg_info(path)
    print(f"  Version: {info['version']}")

    if args.probe:
        vid_info = probe_video(args.probe, path)
        if vid_info:
            print(f"\n  Video info for {args.probe}:")
            for k, v in vid_info.items():
                print(f"    {k}: {v}")
        else:
            print(f"\n  Could not probe {args.probe}")
    return 0


def _coerce_value(val: str):
    if val.lower() in ("true", "yes", "1"):
        return True
    if val.lower() in ("false", "no", "0"):
        return False
    try:
        return int(val)
    except ValueError:
        pass
    try:
        return float(val)
    except ValueError:
        pass
    return val


if __name__ == "__main__":
    sys.exit(main())
