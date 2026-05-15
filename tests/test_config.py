import unittest
import json
import os
import tempfile
from dataclasses import asdict

from renderCanvasCLI.config import RenderConfig, ConfigManager


class TestRenderConfig(unittest.TestCase):
    def test_default_values(self):
        config = RenderConfig()
        self.assertEqual(config.width, 1920)
        self.assertEqual(config.height, 1080)
        self.assertEqual(config.fps, 60)
        self.assertEqual(config.duration, 10)
        self.assertEqual(config.bg_color, "#000000")
        self.assertEqual(config.crf, 18)
        self.assertEqual(config.codec, "libx264")
        self.assertEqual(config.pixel_format, "yuv420p")

    def test_from_dict_filters_invalid_keys(self):
        data = {
            "width": 1280,
            "height": 720,
            "fps": 30,
            "invalid_key": "should_be_ignored",
        }
        config = RenderConfig.from_dict(data)
        self.assertEqual(config.width, 1280)
        self.assertEqual(config.height, 720)
        self.assertEqual(config.fps, 30)
        self.assertFalse(hasattr(config, "invalid_key"))

    def test_from_dict_partial_overrides(self):
        data = {"width": 640, "duration": 5}
        config = RenderConfig.from_dict(data)
        self.assertEqual(config.width, 640)
        self.assertEqual(config.duration, 5)
        self.assertEqual(config.height, 1080)

    def test_to_dict_excludes_empty_strings(self):
        config = RenderConfig(output_dir="", project="test")
        result = config.to_dict()
        self.assertNotIn("output_dir", result)
        self.assertIn("project", result)
        self.assertEqual(result["project"], "test")

    def test_to_dict_includes_non_empty_values(self):
        config = RenderConfig(width=1920, height=1080, fps=60)
        result = config.to_dict()
        self.assertEqual(result["width"], 1920)
        self.assertEqual(result["height"], 1080)
        self.assertEqual(result["fps"], 60)

    def test_resolve_sets_default_output_dir(self):
        config = RenderConfig()
        result = config.resolve(base_dir="/tmp/test")
        self.assertEqual(result["output_dir"], "/tmp/test/renders")

    def test_resolve_does_not_override_existing_output_dir(self):
        config = RenderConfig(output_dir="/custom/output")
        result = config.resolve(base_dir="/tmp/test")
        self.assertEqual(result["output_dir"], "/custom/output")

    def test_resolve_without_base_dir(self):
        config = RenderConfig(width=800, height=600)
        result = config.resolve()
        self.assertEqual(result["width"], 800)
        self.assertEqual(result["height"], 600)


class TestConfigManager(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.manager = ConfigManager(self.temp_dir)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_load_returns_default_when_no_config_file(self):
        config = self.manager.load()
        self.assertIsInstance(config, RenderConfig)
        self.assertEqual(config.width, 1920)

    def test_save_and_load_preserves_values(self):
        original = RenderConfig(width=640, height=480, fps=30, duration=5)
        self.manager.save(original)

        new_manager = ConfigManager(self.temp_dir)
        loaded = new_manager.load()
        self.assertEqual(loaded.width, 640)
        self.assertEqual(loaded.height, 480)
        self.assertEqual(loaded.fps, 30)
        self.assertEqual(loaded.duration, 5)

    def test_save_creates_config_file(self):
        config = RenderConfig(width=1280)
        self.manager.save(config)
        config_path = os.path.join(self.temp_dir, "renderCanvasCLI.json")
        self.assertTrue(os.path.exists(config_path))
        with open(config_path) as f:
            data = json.load(f)
        self.assertEqual(data["width"], 1280)

    def test_get_returns_default_for_missing_key(self):
        result = self.manager.get("nonexistent_key", "fallback")
        self.assertEqual(result, "fallback")

    def test_get_returns_value_from_config(self):
        config = RenderConfig(fps=120)
        self.manager.save(config)
        self.assertEqual(self.manager.get("fps"), 120)

    def test_set_updates_and_persists_value(self):
        self.manager.set("fps", 24)
        self.assertEqual(self.manager.get("fps"), 24)
        new_manager = ConfigManager(self.temp_dir)
        self.assertEqual(new_manager.get("fps"), 24)

    def test_set_ignores_invalid_key(self):
        self.manager.set("invalid_key", "value")
        config = self.manager.load()
        self.assertFalse(hasattr(config, "invalid_key"))

    def test_caching_returns_same_instance(self):
        first = self.manager.load()
        second = self.manager.load()
        self.assertIs(first, second)

    def test_find_project_root_with_config(self):
        nested = os.path.join(self.temp_dir, "a", "b", "c")
        os.makedirs(nested, exist_ok=True)
        config_path = os.path.join(self.temp_dir, "renderCanvasCLI.json")
        with open(config_path, "w") as f:
            json.dump({}, f)
        root = ConfigManager.find_project_root(nested)
        self.assertEqual(root, self.temp_dir)

    def test_find_project_root_with_index_html(self):
        nested = os.path.join(self.temp_dir, "x", "y")
        os.makedirs(nested, exist_ok=True)
        index_path = os.path.join(self.temp_dir, "index.html")
        with open(index_path, "w") as f:
            f.write("<html></html>")
        root = ConfigManager.find_project_root(nested)
        self.assertEqual(root, self.temp_dir)

    def test_find_project_root_returns_start_when_not_found(self):
        nested = os.path.join(self.temp_dir, "deep", "path")
        os.makedirs(nested, exist_ok=True)
        root = ConfigManager.find_project_root(nested)
        self.assertEqual(root, os.path.abspath(nested))


if __name__ == "__main__":
    unittest.main()
