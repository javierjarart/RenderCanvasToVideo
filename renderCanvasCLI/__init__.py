"""
renderCanvasCLI — Python CLI for rendering HTML5 Canvas animations to MP4.
"""

__version__ = "0.1.1"
__author__ = "Javier Jara"

from renderCanvasCLI.config import RenderConfig
from renderCanvasCLI.presets import PresetManager
from renderCanvasCLI.project import ProjectManager
from renderCanvasCLI.renderer import Renderer
