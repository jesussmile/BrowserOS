#!/usr/bin/env python3
"""Stage private local PannamOS server resources for browser packaging."""

import os
import shutil
from pathlib import Path

from ...common.context import Context
from ...common.module import CommandModule, ValidationError
from ...common.utils import get_platform, log_info, log_success


PANNAMOS_SERVER_RESOURCES_DIR_ENV = "PANNAMOS_SERVER_RESOURCES_DIR"
PANNAMOS_SERVER_MIGRATIONS_DIR_ENV = "PANNAMOS_SERVER_MIGRATIONS_DIR"


class PannamOSServerResourcesModule(CommandModule):
    """Copy locally built server resources instead of downloading from R2."""

    produces = ["pannamos_server_resources"]
    requires = []
    description = "Stage private local PannamOS server resources"

    def validate(self, ctx: Context) -> None:
        source = self._get_source_dir(ctx)
        if not source.exists() or not source.is_dir():
            raise ValidationError(
                f"PannamOS server resources not found: {source}. Run "
                "'bun run build:server:ci' in packages/browseros-agent or set "
                f"{PANNAMOS_SERVER_RESOURCES_DIR_ENV}."
            )

        bin_dir = source / "bin"
        if not bin_dir.is_dir():
            raise ValidationError(f"Server resources missing bin directory: {bin_dir}")

        migrations_dir = self._get_migrations_source_dir(ctx, source)
        if not migrations_dir.is_dir():
            raise ValidationError(
                f"Server resources missing db migrations directory: {migrations_dir}"
            )
        if not any(migrations_dir.glob("*.sql")):
            raise ValidationError(
                f"Server resources migrations directory has no SQL migrations: "
                f"{migrations_dir}"
            )

    def execute(self, ctx: Context) -> None:
        log_info("\n📦 Staging private PannamOS server resources...")

        source = self._get_source_dir(ctx)
        destination = self._get_destination_dir(ctx)

        if destination.exists():
            shutil.rmtree(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, destination)

        migrations_source = self._get_migrations_source_dir(ctx, source)
        migrations_destination = destination / "db" / "migrations"
        if migrations_destination.exists():
            shutil.rmtree(migrations_destination)
        migrations_destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(migrations_source, migrations_destination)

        ctx.artifact_registry.add("pannamos_server_resources", destination)
        log_success(f"Staged PannamOS server resources from {source}")

    def _get_source_dir(self, ctx: Context) -> Path:
        override = os.environ.get(PANNAMOS_SERVER_RESOURCES_DIR_ENV)
        if override:
            return Path(override).expanduser().resolve()

        return (
            ctx.root_dir.parent
            / "browseros-agent"
            / "dist"
            / "prod"
            / "server"
            / self._get_target(ctx)
            / "resources"
        )

    def _get_migrations_source_dir(self, ctx: Context, source: Path) -> Path:
        override = os.environ.get(PANNAMOS_SERVER_MIGRATIONS_DIR_ENV)
        if override:
            return Path(override).expanduser().resolve()

        bundled_migrations = source / "db" / "migrations"
        if bundled_migrations.is_dir():
            return bundled_migrations

        return (
            ctx.root_dir.parent
            / "browseros-agent"
            / "apps"
            / "server"
            / "src"
            / "lib"
            / "db"
            / "migrations"
        )

    def _get_destination_dir(self, ctx: Context) -> Path:
        return (
            ctx.root_dir
            / "resources"
            / "binaries"
            / "browseros_server"
            / self._get_target(ctx)
            / "resources"
        )

    def _get_target(self, ctx: Context) -> str:
        platform = get_platform()
        match platform:
            case "windows":
                platform_name = "windows"
            case "macos":
                platform_name = "darwin"
            case "linux":
                platform_name = "linux"
            case _:
                raise ValidationError(f"Unsupported platform: {platform}")

        arch = ctx.architecture
        if arch not in {"x64", "arm64"}:
            raise ValidationError(f"Unsupported architecture for server resources: {arch}")

        return f"{platform_name}-{arch}"
