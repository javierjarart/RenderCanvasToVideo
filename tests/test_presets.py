import unittest

from renderCanvasCLI.presets import PresetManager, PRESETS


class TestPresetManager(unittest.TestCase):
    def test_list_returns_all_presets(self):
        presets = PresetManager.list()
        self.assertEqual(presets, PRESETS)

    def test_get_returns_preset_by_name(self):
        preset = PresetManager.get("hd-60")
        self.assertIsNotNone(preset)
        self.assertEqual(preset["width"], 1920)
        self.assertEqual(preset["height"], 1080)
        self.assertEqual(preset["fps"], 60)

    def test_get_returns_none_for_unknown_preset(self):
        self.assertIsNone(PresetManager.get("nonexistent-preset"))

    def test_apply_returns_preset_copy(self):
        result = PresetManager.apply("preview")
        self.assertEqual(result["width"], 640)
        self.assertEqual(result["height"], 360)
        self.assertEqual(result["fps"], 15)

    def test_apply_does_not_mutate_original(self):
        original = PRESETS["preview"].copy()
        PresetManager.apply("preview", {"fps": 60})
        self.assertEqual(PRESETS["preview"]["fps"], original["fps"])

    def test_apply_with_overrides(self):
        result = PresetManager.apply("hd-60", {"crf": 10, "fps": 120})
        self.assertEqual(result["crf"], 10)
        self.assertEqual(result["fps"], 120)
        self.assertEqual(result["width"], 1920)

    def test_apply_raises_for_unknown_preset(self):
        with self.assertRaises(ValueError) as ctx:
            PresetManager.apply("unknown-preset")
        self.assertIn("unknown-preset", str(ctx.exception))
        self.assertIn("Available", str(ctx.exception))

    def test_describe_returns_formatted_string(self):
        desc = PresetManager.describe("preview")
        self.assertIn("Preview", desc)
        self.assertIn("640x360", desc)
        self.assertIn("15fps", desc)

    def test_describe_unknown_returns_error_message(self):
        desc = PresetManager.describe("unknown")
        self.assertIn("Unknown preset", desc)

    def test_all_presets_have_required_fields(self):
        required = {"width", "height", "fps", "codec", "container", "pix_fmt", "preset"}
        for name, preset in PRESETS.items():
            with self.subTest(preset=name):
                missing = required - set(preset.keys())
                self.assertFalse(missing, f"Preset '{name}' missing: {missing}")

    def test_resolutions_are_positive(self):
        for name, preset in PRESETS.items():
            with self.subTest(preset=name):
                self.assertGreater(preset["width"], 0, f"{name} width must be positive")
                self.assertGreater(preset["height"], 0, f"{name} height must be positive")

    def test_frame_rates_are_positive(self):
        for name, preset in PRESETS.items():
            with self.subTest(preset=name):
                self.assertGreater(preset["fps"], 0, f"{name} fps must be positive")

    def test_preset_count(self):
        self.assertGreaterEqual(len(PRESETS), 15)


if __name__ == "__main__":
    unittest.main()
