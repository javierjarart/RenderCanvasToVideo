import unittest
from unittest.mock import patch, MagicMock
import io

from renderCanvasCLI.progress import ProgressTracker


class TestProgressTracker(unittest.TestCase):
    def setUp(self):
        self.tracker = ProgressTracker()

    def test_initial_state_is_idle(self):
        self.assertEqual(self.tracker.state, "idle")
        self.assertEqual(self.tracker.current, 0)
        self.assertEqual(self.tracker.total, 0)
        self.assertIsNone(self.tracker.error_msg)
        self.assertIsNone(self.tracker.file_url)

    def test_start_sets_rendering_state(self):
        self.tracker.start(total=100)
        self.assertEqual(self.tracker.state, "rendering")
        self.assertEqual(self.tracker.total, 100)
        self.assertEqual(self.tracker.current, 0)
        self.assertIsNone(self.tracker.error_msg)

    def test_update_increases_progress(self):
        self.tracker.start(total=100)
        self.tracker.update(50)
        self.assertEqual(self.tracker.current, 50)

    def test_update_with_zero_total_does_not_divide_by_zero(self):
        self.tracker.start(total=0)
        self.tracker.update(0)
        self.assertEqual(self.tracker.current, 0)

    def test_error_sets_state_and_message(self):
        self.tracker.error("Something went wrong")
        self.assertEqual(self.tracker.state, "error")
        self.assertEqual(self.tracker.error_msg, "Something went wrong")

    def test_done_sets_state(self):
        self.tracker.start(total=50)
        self.tracker.update(50)
        self.tracker.done()
        self.assertEqual(self.tracker.state, "done")

    def test_set_file_url(self):
        url = "/renders/test.mp4"
        self.tracker.set_file_url(url)
        self.assertEqual(self.tracker.file_url, url)

    @patch("sys.stdout", new_callable=io.StringIO)
    def test_start_renders_progress(self, mock_stdout):
        self.tracker.start(total=100)
        output = mock_stdout.getvalue()
        self.assertIn("0.0%", output)
        self.assertIn("0/100", output)

    @patch("sys.stdout", new_callable=io.StringIO)
    def test_update_renders_progress(self, mock_stdout):
        self.tracker.start(total=200)
        self.tracker.update(100)
        output = mock_stdout.getvalue()
        self.assertIn("50.0%", output)
        self.assertIn("100/200", output)

    @patch("sys.stderr", new_callable=io.StringIO)
    def test_error_prints_to_stderr(self, mock_stderr):
        self.tracker.error("FFmpeg failed")
        output = mock_stderr.getvalue()
        self.assertIn("FFmpeg failed", output)


if __name__ == "__main__":
    unittest.main()
