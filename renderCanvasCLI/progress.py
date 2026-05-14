import sys
import time
from typing import Optional


class ProgressTracker:
    def __init__(self):
        self.total: int = 0
        self.current: int = 0
        self.state: str = "idle"
        self.error_msg: Optional[str] = None
        self.file_url: Optional[str] = None
        self._start_time: float = 0.0

    def start(self, total: int) -> None:
        self.total = total
        self.current = 0
        self.state = "rendering"
        self.error_msg = None
        self.file_url = None
        self._start_time = time.time()
        self._render("0.0%")

    def update(self, current: int) -> None:
        self.current = current
        pct = (current / self.total) * 100 if self.total > 0 else 0
        self._render(f"{pct:.1f}%")

    def error(self, msg: str) -> None:
        self.state = "error"
        self.error_msg = msg
        print(f"\n  ERROR: {msg}", file=sys.stderr)

    def done(self) -> None:
        self.state = "done"
        elapsed = time.time() - self._start_time
        fps = self.total / elapsed if elapsed > 0 else 0
        self._render("100.0%")
        print(f"\n  Complete! {self.total} frames in {elapsed:.1f}s ({fps:.1f} fps)")

    def set_file_url(self, url: str) -> None:
        self.file_url = url

    def _render(self, pct: str) -> None:
        bar_width = 40
        filled = int((self.current / self.total) * bar_width) if self.total > 0 else 0
        bar = "█" * filled + "░" * (bar_width - filled)
        elapsed = time.time() - self._start_time if self._start_time else 0
        eta = ""
        if self.current > 0 and self.total > 0:
            rate = self.current / elapsed if elapsed > 0 else 0
            remaining = (self.total - self.current) / rate if rate > 0 else 0
            eta = f" ETA {remaining:.0f}s"

        sys.stdout.write(f"\r  [{bar}] {pct} ({self.current}/{self.total}){eta}")
        sys.stdout.flush()
