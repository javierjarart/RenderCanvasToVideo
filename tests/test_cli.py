import unittest
from unittest.mock import patch, MagicMock

from renderCanvasCLI.cli import main, _coerce_value


class TestCoerceValue(unittest.TestCase):
    def test_returns_booleans(self):
        self.assertTrue(_coerce_value("true"))
        self.assertTrue(_coerce_value("yes"))
        self.assertTrue(_coerce_value("1"))
        self.assertFalse(_coerce_value("false"))
        self.assertFalse(_coerce_value("no"))
        self.assertFalse(_coerce_value("0"))

    def test_returns_int(self):
        self.assertEqual(_coerce_value("42"), 42)
        self.assertEqual(_coerce_value("-5"), -5)

    def test_returns_float(self):
        self.assertEqual(_coerce_value("3.14"), 3.14)
        self.assertEqual(_coerce_value("-0.5"), -0.5)

    def test_returns_string_as_fallback(self):
        self.assertEqual(_coerce_value("hello"), "hello")
        self.assertEqual(_coerce_value("libx264"), "libx264")


class TestMainCommandDispatch(unittest.TestCase):
    @patch("renderCanvasCLI.cli._cmd_render")
    def test_render_command_dispatched(self, mock_cmd):
        mock_cmd.return_value = 0
        exit_code = main(["render", "--project", "test"])
        self.assertEqual(exit_code, 0)
        mock_cmd.assert_called_once()

    @patch("renderCanvasCLI.cli._cmd_init")
    def test_init_command_dispatched(self, mock_cmd):
        mock_cmd.return_value = 0
        exit_code = main(["init", "my-project"])
        self.assertEqual(exit_code, 0)
        mock_cmd.assert_called_once()

    @patch("renderCanvasCLI.cli._cmd_projects")
    def test_projects_command_dispatched(self, mock_cmd):
        mock_cmd.return_value = 0
        exit_code = main(["projects"])
        self.assertEqual(exit_code, 0)
        mock_cmd.assert_called_once()

    @patch("renderCanvasCLI.cli._cmd_projects")
    def test_ls_alias_dispatched(self, mock_cmd):
        mock_cmd.return_value = 0
        exit_code = main(["ls"])
        self.assertEqual(exit_code, 0)
        mock_cmd.assert_called_once()

    @patch("renderCanvasCLI.cli._cmd_validate")
    def test_validate_command_dispatched(self, mock_cmd):
        mock_cmd.return_value = 0
        exit_code = main(["validate", "test-project"])
        self.assertEqual(exit_code, 0)
        mock_cmd.assert_called_once()

    @patch("renderCanvasCLI.cli._cmd_presets")
    def test_presets_command_dispatched(self, mock_cmd):
        mock_cmd.return_value = 0
        exit_code = main(["presets"])
        self.assertEqual(exit_code, 0)
        mock_cmd.assert_called_once()

    @patch("renderCanvasCLI.cli._cmd_config")
    def test_config_command_dispatched(self, mock_cmd):
        mock_cmd.return_value = 0
        exit_code = main(["config", "list"])
        self.assertEqual(exit_code, 0)
        mock_cmd.assert_called_once()

    @patch("renderCanvasCLI.cli._cmd_ffmpeg")
    def test_ffmpeg_command_dispatched(self, mock_cmd):
        mock_cmd.return_value = 0
        exit_code = main(["ffmpeg"])
        self.assertEqual(exit_code, 0)
        mock_cmd.assert_called_once()

    def test_no_command_prints_help(self):
        with patch("renderCanvasCLI.cli.argparse.ArgumentParser.print_help") as mock_help:
            exit_code = main([])
            self.assertEqual(exit_code, 0)
            mock_help.assert_called_once()

    def test_version_flag(self):
        with patch("sys.exit") as mock_exit:
            with patch.object(
                type("MockParser", (), {"parse_args": lambda self: type('a', (), {'command': None, 'cwd': None, 'version': None})()})(),
                "parse_args",
            ):
                pass
            exit_code = main(["--version"])

    @patch("renderCanvasCLI.cli._cmd_render")
    def test_render_with_all_options(self, mock_cmd):
        mock_cmd.return_value = 0
        exit_code = main([
            "render",
            "--project", "demo",
            "--dir", "/some/path",
            "--preset", "hd-60",
            "--width", "1920",
            "--height", "1080",
            "--fps", "60",
            "--duration", "10",
            "--bg", "#ff0000",
            "--output", "/output",
            "--crf", "18",
            "--ffpreset", "slow",
            "--codec", "libx264",
            "--container", ".mp4",
            "--pix-fmt", "yuv420p",
        ])
        self.assertEqual(exit_code, 0)
        mock_cmd.assert_called_once()

    @patch("renderCanvasCLI.cli._cmd_render")
    def test_render_cwd_passed_to_command(self, mock_cmd):
        mock_cmd.return_value = 0
        mock_cmd.side_effect = lambda *a, **kw: 0
        main(["--cwd", "/custom/path", "render", "--project", "test"])
        args, kwargs = mock_cmd.call_args
        _, base_dir = args
        self.assertEqual(base_dir, "/custom/path")


class TestCmdFunctions(unittest.TestCase):
    @patch("renderCanvasCLI.cli.Renderer")
    def test_cmd_render_success(self, MockRenderer):
        mock_instance = MockRenderer.return_value
        mock_instance.render.return_value = "/output/video.mp4"
        from renderCanvasCLI.cli import _cmd_render
        args = MagicMock()
        args.project = "test"
        args.dir = None
        args.preset = None
        args.width = None
        args.height = None
        args.fps = None
        args.duration = None
        args.bg_color = None
        args.output = None
        args.crf = None
        args.ffpreset = None
        args.codec = None
        args.container = None
        args.pix_fmt = None
        exit_code = _cmd_render(args, "/base")
        self.assertEqual(exit_code, 0)

    @patch("renderCanvasCLI.cli.ProjectManager")
    def test_cmd_init_success(self, MockProjectManager):
        mock_instance = MockProjectManager.return_value
        from renderCanvasCLI.cli import _cmd_init
        args = MagicMock()
        args.name = "my-project"
        args.template = "particles"
        exit_code = _cmd_init(args, "/base")
        self.assertEqual(exit_code, 0)

    @patch("renderCanvasCLI.cli.ProjectManager")
    def test_cmd_validate_invalid(self, MockProjectManager):
        mock_instance = MockProjectManager.return_value
        mock_instance.validate.return_value = (False, "Missing canvas element")
        from renderCanvasCLI.cli import _cmd_validate
        args = MagicMock()
        args.name = "bad-project"
        exit_code = _cmd_validate(args, "/base")
        self.assertEqual(exit_code, 1)


if __name__ == "__main__":
    unittest.main()
