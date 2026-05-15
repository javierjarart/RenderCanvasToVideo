import unittest
from unittest.mock import patch, MagicMock
import os
import tempfile
import platform

from renderCanvasCLI.ffmpeg import (
    find_ffmpeg,
    validate_ffmpeg,
    get_ffmpeg_info,
    probe_video,
    _find_node_ffmpeg_static,
)


class TestFindFfmpeg(unittest.TestCase):
    @patch("renderCanvasCLI.ffmpeg.os.getenv")
    @patch("renderCanvasCLI.ffmpeg.os.path.exists")
    @patch("renderCanvasCLI.ffmpeg.shutil.which")
    def test_uses_env_var_when_set(self, mock_which, mock_exists, mock_getenv):
        mock_getenv.return_value = "/custom/ffmpeg"
        mock_exists.return_value = True
        result = find_ffmpeg()
        self.assertEqual(result, os.path.abspath("/custom/ffmpeg"))

    @patch("renderCanvasCLI.ffmpeg.os.getenv")
    @patch("renderCanvasCLI.ffmpeg.os.path.exists")
    @patch("renderCanvasCLI.ffmpeg.shutil.which")
    def test_env_var_not_set_falls_through(self, mock_which, mock_exists, mock_getenv):
        mock_getenv.return_value = None
        mock_exists.return_value = False
        mock_which.return_value = None
        result = find_ffmpeg()
        self.assertIsNone(result)

    @patch("renderCanvasCLI.ffmpeg.os.getenv")
    @patch("renderCanvasCLI.ffmpeg.os.path.exists")
    @patch("renderCanvasCLI.ffmpeg._find_node_ffmpeg_static")
    @patch("renderCanvasCLI.ffmpeg.shutil.which")
    def test_returns_system_ffmpeg_as_last_resort(self, mock_which, mock_static, mock_exists, mock_getenv):
        mock_getenv.return_value = None
        mock_static.return_value = None
        def exists_side_effect(p):
            return p == os.path.abspath("/usr/bin/ffmpeg")
        mock_exists.side_effect = exists_side_effect
        mock_which.return_value = "/usr/bin/ffmpeg"
        result = find_ffmpeg()
        self.assertEqual(result, os.path.abspath("/usr/bin/ffmpeg"))

    @patch("renderCanvasCLI.ffmpeg.os.getenv")
    @patch("renderCanvasCLI.ffmpeg.os.path.exists")
    @patch("renderCanvasCLI.ffmpeg.shutil.which")
    def test_returns_first_found_path(self, mock_which, mock_exists, mock_getenv):
        mock_getenv.return_value = "/env/ffmpeg"
        mock_exists.side_effect = lambda p: p == os.path.abspath("/env/ffmpeg")
        result = find_ffmpeg()
        self.assertEqual(result, os.path.abspath("/env/ffmpeg"))


class TestValidateFfmpeg(unittest.TestCase):
    @patch("renderCanvasCLI.ffmpeg.subprocess.run")
    def test_valid_ffmpeg_returns_success(self, mock_run):
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "ffmpeg version 6.0\nconfig: ...\n"
        mock_run.return_value = mock_result
        valid, msg = validate_ffmpeg("/usr/bin/ffmpeg")
        self.assertTrue(valid)
        self.assertIn("ffmpeg version", msg)

    @patch("renderCanvasCLI.ffmpeg.subprocess.run")
    def test_invalid_ffmpeg_returns_error(self, mock_run):
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stdout = ""
        mock_run.return_value = mock_result
        valid, msg = validate_ffmpeg("/usr/bin/ffmpeg")
        self.assertFalse(valid)

    @patch("renderCanvasCLI.ffmpeg.subprocess.run")
    def test_not_found_returns_error(self, mock_run):
        mock_run.side_effect = FileNotFoundError()
        valid, msg = validate_ffmpeg("/nonexistent")
        self.assertFalse(valid)
        self.assertIn("not found", msg)

    @patch("renderCanvasCLI.ffmpeg.subprocess.run")
    def test_timeout_returns_error(self, mock_run):
        import subprocess
        mock_run.side_effect = subprocess.TimeoutExpired(cmd="ffmpeg", timeout=10)
        valid, msg = validate_ffmpeg("/usr/bin/ffmpeg")
        self.assertFalse(valid)
        self.assertIn("timed out", msg)


class TestGetFfmpegInfo(unittest.TestCase):
    @patch("renderCanvasCLI.ffmpeg.subprocess.run")
    def test_returns_version_and_config(self, mock_run):
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = (
            "ffmpeg version 6.0 Copyright ...\n"
            "configuration: --enable-libx264 --enable-gpl\n"
            "libavutil ...\n"
        )
        mock_run.return_value = mock_result
        info = get_ffmpeg_info("/usr/bin/ffmpeg")
        self.assertEqual(info["path"], "/usr/bin/ffmpeg")
        self.assertEqual(info["version"], "ffmpeg version 6.0 Copyright ...")
        self.assertIn("configuration", info)
        self.assertIn("--enable-libx264", info["configuration"])

    @patch("renderCanvasCLI.ffmpeg.subprocess.run")
    def test_failure_returns_unknown_version(self, mock_run):
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stdout = ""
        mock_run.return_value = mock_result
        info = get_ffmpeg_info("/usr/bin/ffmpeg")
        self.assertEqual(info["version"], "unknown")


class TestProbeVideo(unittest.TestCase):
    @patch("renderCanvasCLI.ffmpeg.subprocess.run")
    def test_parses_duration_and_codec(self, mock_run):
        mock_result = MagicMock()
        mock_result.stderr = (
            "  Duration: 00:01:30.00, start: 0.0, bitrate: 1000 kb/s\n"
            "    Stream #0:0: Video: h264, yuv420p, 1920x1080\n"
        )
        mock_run.return_value = mock_result
        info = probe_video("/path/to/video.mp4", "/usr/bin/ffmpeg")
        self.assertIsNotNone(info)
        self.assertEqual(info["duration"], "00:01:30.00")
        self.assertEqual(info["codec"], "h264")
        self.assertEqual(info["resolution"], "1920x1080")

    @patch("renderCanvasCLI.ffmpeg.subprocess.run")
    def test_returns_none_on_exception(self, mock_run):
        mock_run.side_effect = Exception("probe failed")
        info = probe_video("/bad/path.mp4", "/usr/bin/ffmpeg")
        self.assertIsNone(info)


class TestFindNodeFfmpegStatic(unittest.TestCase):
    @patch("renderCanvasCLI.ffmpeg.Path.exists")
    def test_returns_ffmpeg_when_exists(self, mock_exists):
        mock_exists.return_value = True
        result = _find_node_ffmpeg_static()
        self.assertIsNotNone(result)
        self.assertTrue("ffmpeg" in result or result.endswith("ffmpeg"))

    def test_returns_none_when_not_found(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch(
                "renderCanvasCLI.ffmpeg.os.path.dirname",
                return_value=os.path.join(tmp, "renderCanvasCLI"),
            ):
                self.assertIsNone(_find_node_ffmpeg_static())


if __name__ == "__main__":
    unittest.main()
