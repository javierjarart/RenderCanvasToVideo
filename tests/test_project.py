import unittest
import tempfile
import os
import shutil

from renderCanvasCLI.project import ProjectManager


class TestProjectManager(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.projects_dir = os.path.join(self.temp_dir, "proyectos")
        os.makedirs(self.projects_dir, exist_ok=True)
        self.manager = ProjectManager(self.temp_dir)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _create_project(self, name, has_canvas=True):
        project_path = os.path.join(self.projects_dir, name)
        os.makedirs(project_path, exist_ok=True)
        canvas_tag = "<canvas id='c'></canvas>" if has_canvas else ""
        with open(os.path.join(project_path, "index.html"), "w") as f:
            f.write(f"<html><body>{canvas_tag}</body></html>")
        return project_path

    def test_list_returns_empty_when_no_projects(self):
        self.assertEqual(self.manager.list(), [])

    def test_list_returns_project_names(self):
        self._create_project("test-1")
        self._create_project("test-2")
        projects = self.manager.list()
        names = [p["name"] for p in projects]
        self.assertIn("test-1", names)
        self.assertIn("test-2", names)

    def test_list_excludes_directories_without_index_html(self):
        self._create_project("valid-project")
        os.makedirs(os.path.join(self.projects_dir, "no-index"), exist_ok=True)
        projects = self.manager.list()
        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0]["name"], "valid-project")

    def test_list_returns_has_config_flag(self):
        self._create_project("with-config")
        config_path = os.path.join(self.projects_dir, "with-config", "renderCanvasCLI.json")
        with open(config_path, "w") as f:
            f.write("{}")

        self._create_project("without-config")
        projects = {p["name"]: p for p in self.manager.list()}
        self.assertTrue(projects["with-config"]["has_config"])
        self.assertFalse(projects["without-config"]["has_config"])

    def test_get_info_returns_none_for_nonexistent_project(self):
        self.assertIsNone(self.manager.get_info("nonexistent"))

    def test_get_info_returns_project_details(self):
        self._create_project("my-anim")
        with open(os.path.join(self.projects_dir, "my-anim", "script.js"), "w") as f:
            f.write("console.log('test');")
        info = self.manager.get_info("my-anim")
        self.assertIsNotNone(info)
        self.assertEqual(info["name"], "my-anim")
        self.assertIn("script.js", info["scripts"])
        self.assertGreater(info["index_size"], 0)
        self.assertFalse(info["has_config"])

    def test_validate_returns_false_for_nonexistent(self):
        valid, msg = self.manager.validate("nonexistent")
        self.assertFalse(valid)
        self.assertIn("does not exist", msg)

    def test_validate_returns_false_for_missing_index_html(self):
        project_path = os.path.join(self.projects_dir, "no-index")
        os.makedirs(project_path, exist_ok=True)
        valid, msg = self.manager.validate("no-index")
        self.assertFalse(valid)
        self.assertIn("Missing index.html", msg)

    def test_validate_returns_false_for_missing_canvas(self):
        self._create_project("no-canvas", has_canvas=False)
        valid, msg = self.manager.validate("no-canvas")
        self.assertFalse(valid)
        self.assertIn("canvas", msg)

    def test_validate_returns_true_for_valid_project(self):
        self._create_project("valid-project")
        valid, msg = self.manager.validate("valid-project")
        self.assertTrue(valid)
        self.assertEqual(msg, "Project is valid")

    def test_scaffold_creates_project_from_template(self):
        project_path = self.manager.scaffold("new-project", "basic")
        self.assertTrue(project_path.exists())
        self.assertTrue((project_path / "index.html").exists())
        self.assertTrue((project_path / "script.js").exists())
        self.assertTrue((project_path / "style.css").exists())

    def test_scaffold_raises_if_project_exists(self):
        self._create_project("existing")
        with self.assertRaises(FileExistsError):
            self.manager.scaffold("existing", "basic")

    def test_scaffold_raises_for_invalid_template(self):
        with self.assertRaises(ValueError) as ctx:
            self.manager.scaffold("test", "nonexistent-template")
        self.assertIn("Template 'nonexistent-template' not found", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
