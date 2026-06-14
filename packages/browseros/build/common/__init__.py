"""Common modules for the BrowserOS build system"""

from .context import Context, ArtifactRegistry, PathConfig, BuildConfig
from .product_identity import PANNAMOS_PRODUCT_IDENTITY, ProductIdentity
from .config import load_config, validate_required_envs
from .notify import Notifier, get_notifier
from .module import CommandModule, ValidationError
from .env import EnvConfig

__all__ = [
    # Core context
    'Context',
    # Sub-components
    'ArtifactRegistry',
    'PathConfig',
    'BuildConfig',
    'ProductIdentity',
    'PANNAMOS_PRODUCT_IDENTITY',
    'CommandModule',
    'ValidationError',
    'EnvConfig',
    # Config loading
    'load_config',
    'validate_required_envs',
    # Notifications
    'Notifier',
    'get_notifier',
]
