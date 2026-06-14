#!/usr/bin/env python3
"""Extensions modules for BrowserOS build system"""

from .bundled_extensions import BundledExtensionsModule
from .pannamos_agent_extension import PannamOSAgentExtensionModule

__all__ = ["BundledExtensionsModule", "PannamOSAgentExtensionModule"]
