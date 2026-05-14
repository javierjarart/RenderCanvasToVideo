import os
import shutil
from pathlib import Path


TEMPLATES_DIR = Path(__file__).parent / "templates"


class ProjectManager:
    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir).resolve()
        self.projects_dir = self.base_dir / "proyectos"

    def list(self) -> list[dict]:
        if not self.projects_dir.exists():
            return []
        projects = []
        for entry in sorted(self.projects_dir.iterdir()):
            if entry.is_dir() and (entry / "index.html").exists():
                projects.append({
                    "name": entry.name,
                    "path": str(entry),
                    "has_config": (entry / "renderCanvasCLI.json").exists(),
                })
        return projects

    def scaffold(self, name: str, template: str = "basic") -> Path:
        target = self.projects_dir / name
        if target.exists():
            raise FileExistsError(f"Project '{name}' already exists at {target}")
        template_dir = TEMPLATES_DIR / template
        if not template_dir.exists():
            available = [d.name for d in TEMPLATES_DIR.iterdir() if d.is_dir()]
            raise ValueError(f"Template '{template}' not found. Available: {', '.join(available)}")

        shutil.copytree(template_dir, target)
        return target

    def get_info(self, name: str) -> dict | None:
        path = self.projects_dir / name
        if not path.exists() or not (path / "index.html").exists():
            return None
        index_path = path / "index.html"
        scripts = list(path.glob("*.js"))
        styles = list(path.glob("*.css"))
        return {
            "name": name,
            "path": str(path),
            "index_size": index_path.stat().st_size if index_path.exists() else 0,
            "scripts": [s.name for s in scripts],
            "styles": [s.name for s in styles],
            "has_config": (path / "renderCanvasCLI.json").exists(),
            "files": [str(f.relative_to(path)) for f in sorted(path.rglob("*")) if f.is_file()],
        }

    def validate(self, name: str) -> tuple[bool, str]:
        path = self.projects_dir / name
        if not path.exists():
            return False, f"Project '{name}' does not exist"
        index = path / "index.html"
        if not index.exists():
            return False, f"Missing index.html in project '{name}'"
        content = index.read_text()
        if "<canvas" not in content:
            return False, f"index.html does not contain a <canvas> element"
        return True, "Project is valid"
