#!/usr/bin/env python3
"""Tests for local PannamOS server resource staging."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from build.common.context import Context
from build.common.module import ValidationError
from build.modules.resources.pannamos_server_resources import (
    PANNAMOS_SERVER_MIGRATIONS_DIR_ENV,
    PANNAMOS_SERVER_RESOURCES_DIR_ENV,
    PannamOSServerResourcesModule,
)


class PannamOSServerResourcesModuleTest(unittest.TestCase):
    def test_stages_local_server_resources(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            root = temp / "browseros"
            chromium_src = temp / "chromium"
            source = temp / "server-resources"
            migrations = (
                temp
                / "browseros-agent"
                / "apps"
                / "server"
                / "src"
                / "lib"
                / "db"
                / "migrations"
            )
            (source / "bin").mkdir(parents=True)
            (source / "bin" / "browseros_server.exe").write_bytes(b"server")
            (migrations / "meta").mkdir(parents=True)
            (migrations / "0000_init.sql").write_text(
                "create table test(id integer);",
                encoding="utf-8",
            )
            (migrations / "meta" / "_journal.json").write_text(
                '{"entries":[]}',
                encoding="utf-8",
            )
            chromium_src.mkdir()

            ctx = Context(
                root_dir=root,
                chromium_src=chromium_src,
                architecture="x64",
                build_type="release",
            )

            with patch.dict(
                "os.environ",
                {PANNAMOS_SERVER_RESOURCES_DIR_ENV: str(source)},
                clear=True,
            ):
                module = PannamOSServerResourcesModule()
                module.validate(ctx)
                module.execute(ctx)

            destination = (
                root
                / "resources"
                / "binaries"
                / "browseros_server"
                / "windows-x64"
                / "resources"
            )
            self.assertEqual(
                (destination / "bin" / "browseros_server.exe").read_bytes(),
                b"server",
            )
            self.assertEqual(
                (destination / "db" / "migrations" / "0000_init.sql").read_text(
                    encoding="utf-8",
                ),
                "create table test(id integer);",
            )
            self.assertTrue(
                (destination / "db" / "migrations" / "meta" / "_journal.json")
                .is_file()
            )

    def test_can_stage_packaged_server_migrations(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            root = temp / "browseros"
            chromium_src = temp / "chromium"
            source = temp / "server-resources"
            (source / "bin").mkdir(parents=True)
            (source / "bin" / "browseros_server.exe").write_bytes(b"server")
            (source / "db" / "migrations").mkdir(parents=True)
            (source / "db" / "migrations" / "0000_packaged.sql").write_text(
                "create table packaged(id integer);",
                encoding="utf-8",
            )
            chromium_src.mkdir()

            ctx = Context(
                root_dir=root,
                chromium_src=chromium_src,
                architecture="x64",
                build_type="release",
            )

            with patch.dict(
                "os.environ",
                {PANNAMOS_SERVER_RESOURCES_DIR_ENV: str(source)},
                clear=True,
            ):
                module = PannamOSServerResourcesModule()
                module.validate(ctx)
                module.execute(ctx)

            destination = (
                root
                / "resources"
                / "binaries"
                / "browseros_server"
                / "windows-x64"
                / "resources"
            )
            self.assertTrue(
                (destination / "db" / "migrations" / "0000_packaged.sql").is_file()
            )

    def test_requires_local_server_resources(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "browseros"
            chromium_src = Path(temp_dir) / "chromium"
            chromium_src.mkdir()
            ctx = Context(
                root_dir=root,
                chromium_src=chromium_src,
                architecture="x64",
                build_type="release",
            )

            with patch.dict("os.environ", {}, clear=True):
                with self.assertRaisesRegex(ValidationError, "server resources"):
                    PannamOSServerResourcesModule().validate(ctx)

    def test_requires_server_migrations(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            root = temp / "browseros"
            chromium_src = temp / "chromium"
            source = temp / "server-resources"
            (source / "bin").mkdir(parents=True)
            (source / "bin" / "browseros_server.exe").write_bytes(b"server")
            chromium_src.mkdir()

            ctx = Context(
                root_dir=root,
                chromium_src=chromium_src,
                architecture="x64",
                build_type="release",
            )

            with patch.dict(
                "os.environ",
                {
                    PANNAMOS_SERVER_RESOURCES_DIR_ENV: str(source),
                    PANNAMOS_SERVER_MIGRATIONS_DIR_ENV: "",
                },
                clear=True,
            ):
                with self.assertRaisesRegex(ValidationError, "migrations"):
                    PannamOSServerResourcesModule().validate(ctx)


if __name__ == "__main__":
    unittest.main()
