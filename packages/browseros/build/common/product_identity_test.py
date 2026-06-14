#!/usr/bin/env python3
"""Tests for private PannamOS build identity."""

import unittest
import re
import tempfile
import uuid
from pathlib import Path
from unittest.mock import patch

import yaml

from .context import Context
from .product_identity import PANNAMOS_PRODUCT_IDENTITY


class PannamOSProductIdentityTest(unittest.TestCase):
    def test_context_uses_pannamos_artifact_identity(self):
        ctx = Context(architecture="x64")

        self.assertEqual(ctx.BROWSEROS_APP_BASE_NAME, "PannamOS")
        self.assertEqual(
            ctx.get_artifact_name("installer"),
            f"PannamOS_v{ctx.semantic_version}_x64_installer.exe",
        )
        self.assertNotIn("Chromium", ctx.get_artifact_name("installer"))
        self.assertNotIn("BrowserOS", ctx.get_artifact_name("installer"))

    def test_context_uses_inert_extension_manifest_by_default(self):
        with patch.dict("os.environ", {}, clear=True):
            ctx = Context(architecture="x64")
            self.assertEqual(
                ctx.get_extensions_manifest_url(),
                "https://browseros.invalid/extensions/update-manifest.xml",
            )

        with patch.dict(
            "os.environ",
            {
                "PANNAMOS_EXTENSIONS_MANIFEST_URL": (
                    "https://updates.example.test/extensions.xml"
                )
            },
            clear=True,
        ):
            ctx = Context(architecture="x64")
            self.assertEqual(
                ctx.get_extensions_manifest_url(),
                "https://updates.example.test/extensions.xml",
            )

    def test_windows_install_identity_is_side_by_side_specific(self):
        windows = PANNAMOS_PRODUCT_IDENTITY.windows

        self.assertEqual(windows.product_path_name, "PannamOS")
        self.assertEqual(windows.base_app_name, "PannamOS")
        self.assertEqual(windows.direct_launch_url_scheme, "pannamos")
        self.assertEqual(windows.browser_prog_id_prefix, "PannamOSHTML")
        self.assertEqual(windows.pdf_prog_id_prefix, "PannamOSPDF")
        self.assertNotEqual(
            windows.app_guid,
            "{7D2B3E1D-D096-4594-9D8F-A6667F12E0AC}",
        )
        self.assertNotIn("Chromium", windows.product_path_name)
        self.assertNotIn("BrowserOS", windows.product_path_name)

    def test_windows_install_patch_matches_private_identity(self):
        windows = PANNAMOS_PRODUCT_IDENTITY.windows
        patch = _read_added_patch_lines(
            Path(__file__).resolve().parents[2]
            / "chromium_patches"
            / "chrome"
            / "install_static"
            / "chromium_install_modes.h"
        )
        compact_patch = re.sub(r"\s+", "", patch)

        self.assertIn(f'L"{windows.product_path_name}"', patch)
        self.assertIn(f'L"{windows.base_app_name}"', patch)
        self.assertIn(f'L"{windows.base_app_id}"', patch)
        self.assertIn(f'L"{windows.browser_prog_id_prefix}"', patch)
        self.assertIn(f'"{windows.direct_launch_url_scheme}"', patch)
        self.assertIn(f'L"{windows.pdf_prog_id_prefix}"', patch)
        self.assertIn(f'L"{windows.app_guid}"', patch)
        self.assertIn(f'L"{windows.active_setup_guid}"', patch)
        self.assertIn(f'L"{windows.legacy_command_execute_clsid}"', patch)
        self.assertIn(_guid_initializer(windows.toast_activator_clsid), compact_patch)
        self.assertIn(_guid_initializer(windows.elevator_clsid), compact_patch)
        self.assertIn(_guid_initializer(windows.elevator_iid), compact_patch)
        self.assertIn(_guid_initializer(windows.tracing_service_clsid), compact_patch)
        self.assertIn(_guid_initializer(windows.tracing_service_iid), compact_patch)

        self.assertNotIn('L"Chromium"', patch)
        self.assertNotIn('L"BrowserOS"', patch)
        self.assertNotIn('L"BOSHTML"', patch)
        self.assertNotIn('"browseros"', patch)

    def test_chromium_branding_files_are_pannamos(self):
        branding_dir = (
            Path(__file__).resolve().parents[2]
            / "chromium_files"
            / "chrome"
            / "app"
            / "theme"
            / "chromium"
        )

        release = _read_branding_file(branding_dir / "BRANDING.release")
        debug = _read_branding_file(branding_dir / "BRANDING.debug")

        self.assertEqual(release["PRODUCT_FULLNAME"], "PannamOS")
        self.assertEqual(release["PRODUCT_INSTALLER_FULLNAME"], "PannamOS Installer")
        self.assertEqual(release["MAC_BUNDLE_ID"], "com.pannamos.PannamOS")
        self.assertEqual(debug["PRODUCT_FULLNAME"], "PannamOS Dev")
        self.assertEqual(debug["MAC_BUNDLE_ID"], "com.pannamos.dev.PannamOS")

    def test_windows_installer_packages_pannamos_agent_extension(self):
        chrome_release = _read_added_patch_lines(
            Path(__file__).resolve().parents[2]
            / "chromium_patches"
            / "chrome"
            / "installer"
            / "mini_installer"
            / "chrome.release"
        )

        self.assertIn("PannamOSServer\\default\\resources", chrome_release)
        self.assertIn(
            "PannamOSServer\\default\\resources\\db\\migrations\\*.sql",
            chrome_release,
        )
        self.assertIn(
            "PannamOSServer\\default\\resources\\db\\migrations\\meta\\*.json",
            chrome_release,
        )
        self.assertIn("browseros_extensions\\*.crx", chrome_release)
        self.assertIn("browseros_extensions\\bundled_extensions.json", chrome_release)
        self.assertNotIn("BrowserOSServer\\default", chrome_release)

    def test_extension_runtime_defaults_are_local_only(self):
        constants = _read_added_patch_lines(
            Path(__file__).resolve().parents[2]
            / "chromium_patches"
            / "chrome"
            / "browser"
            / "browseros"
            / "core"
            / "browseros_constants.h"
        )

        self.assertIn('inline constexpr char kBrowserOSConfigUrl[] =\n    "";', constants)
        self.assertIn(
            'inline constexpr char kBrowserOSAlphaConfigUrl[] =\n    "";',
            constants,
        )
        self.assertIn('inline constexpr char kBrowserOSUpdateUrl[] =\n    "";', constants)
        self.assertIn(
            'inline constexpr char kBrowserOSAlphaUpdateUrl[] =\n    "";',
            constants,
        )
        self.assertNotIn("cdn.browseros.com/extensions", constants)
        self.assertNotIn("bflpfmnmnokmjhmgnolecpppdbdophmk", constants)
        self.assertNotIn("adlpneommgkgeanpaekgoaolcpncohkf", constants)
        self.assertNotIn("nlnihljpboknmfagkikhkdblbedophja", constants)

        active_extensions = constants.split("kBrowserOSExtensions[] = {", 1)[
            1
        ].split("};", 1)[0]
        self.assertIn("kAgentExtensionId", active_extensions)
        self.assertNotIn("kBugReporterExtensionId", active_extensions)
        self.assertNotIn("kControllerExtensionId", active_extensions)

    def test_string_replacements_use_pannamos_product_identity(self):
        from build.modules.resources.string_replaces import (
            apply_string_replacements_impl,
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            chromium_src = Path(temp_dir)
            app_dir = chromium_src / "chrome" / "app"
            app_dir.mkdir(parents=True)
            strings_path = app_dir / "chromium_strings.grd"
            settings_path = app_dir / "settings_chromium_strings.grdp"
            strings_path.write_text(
                """
                <message name="IDS_PRODUCT_NAME">BrowserOS</message>
                <message name="IDS_SHORT_PRODUCT_NAME">BrowserOS</message>
                <message name="IDS_PRODUCT_DESCRIPTION">
                  Google Chrome and Chromium should become private product names.
                </message>
                <message name="IDS_ABOUT_VERSION_COPYRIGHT">
                  The BrowserOS Authors. All rights reserved.
                </message>
                """,
                encoding="utf-8",
            )
            settings_path.write_text("BrowserOS settings mention Chrome.", encoding="utf-8")

            ctx = Context(chromium_src=chromium_src)
            self.assertTrue(apply_string_replacements_impl(ctx))

            strings = strings_path.read_text(encoding="utf-8")
            settings = settings_path.read_text(encoding="utf-8")
            self.assertIn("PannamOS", strings)
            self.assertIn("PannamOS settings mention PannamOS.", settings)
            self.assertNotIn("BrowserOS</message>", strings)
            self.assertIn("The BrowserOS Authors. All rights reserved.", strings)

    def test_windows_local_installer_config_is_unsigned_pannamos_pipeline(self):
        config_path = (
            Path(__file__).resolve().parents[1]
            / "config"
            / "release.windows.pannamos.local.yaml"
        )
        config = yaml.safe_load(config_path.read_text())
        modules = config["modules"]

        self.assertEqual(config["build"]["type"], "release")
        self.assertEqual(config["build"]["architecture"], "x64")
        self.assertIn("pannamos_server_resources", modules)
        self.assertIn("resources", modules)
        self.assertIn("pannamos_agent_extension", modules)
        self.assertIn("compile_windows_installer", modules)
        self.assertIn("package_windows", modules)
        self.assertLess(
            modules.index("pannamos_server_resources"),
            modules.index("resources"),
        )
        self.assertLess(
            modules.index("pannamos_agent_extension"),
            modules.index("configure"),
        )
        self.assertLess(
            modules.index("compile_windows_installer"),
            modules.index("package_windows"),
        )
        self.assertNotIn("sign_windows", modules)
        self.assertNotIn("download_resources", modules)
        self.assertNotIn("bundled_extensions", modules)
        self.assertNotIn("upload", modules)
        self.assertEqual(
            config["required_envs"],
            ["PANNAMOS_AGENT_CRX", "PANNAMOS_AGENT_EXTENSION_ID"],
        )
        self.assertFalse(config["notifications"]["slack"])

    def test_windows_local_installer_config_modules_are_registered(self):
        from build.cli.build import AVAILABLE_MODULES
        from .pipeline import validate_pipeline

        config_path = (
            Path(__file__).resolve().parents[1]
            / "config"
            / "release.windows.pannamos.local.yaml"
        )
        config = yaml.safe_load(config_path.read_text())

        validate_pipeline(config["modules"], AVAILABLE_MODULES)

    def test_windows_release_flags_disable_public_updater(self):
        flags_path = (
            Path(__file__).resolve().parents[1]
            / "config"
            / "gn"
            / "flags.windows.release.gn"
        )
        flags = flags_path.read_text()

        self.assertIn("enable_updater=false", flags)
        self.assertNotIn("update_check_url", flags)
        self.assertNotIn("cdn.browseros.com", flags)

    def test_server_runtime_paths_and_update_defaults_are_pannamos_specific(self):
        identity = PANNAMOS_PRODUCT_IDENTITY
        patches_dir = Path(__file__).resolve().parents[2] / "chromium_patches"
        server_dir = patches_dir / "chrome" / "browser" / "browseros" / "server"

        runtime_patches = "\n".join(
            _read_added_patch_lines(path)
            for path in (
                patches_dir
                / "chrome"
                / "browser"
                / "browseros"
                / "core"
                / "browseros_switches.h",
                patches_dir
                / "chrome"
                / "install_static"
                / "user_data_dir.cc",
                server_dir / "browseros_server_utils.cc",
                server_dir / "browseros_server_manager.cc",
                server_dir / "browseros_server_updater.cc",
                server_dir / "browseros_server_config.h",
                server_dir / "browseros_server_utils.h",
                server_dir / "process_controller_impl.cc",
            )
        )
        resources_build = _read_added_patch_lines(server_dir / "BUILD.gn")
        constants = _read_added_patch_lines(
            server_dir / "browseros_server_constants.h"
        )

        self.assertIn(identity.server_data_dir_name, runtime_patches)
        self.assertIn("E:\\\\PannamOS", runtime_patches)
        self.assertIn("BrowserProfile", runtime_patches)
        self.assertIn("ServerState", runtime_patches)
        self.assertIn("Outputs", runtime_patches)
        self.assertIn("pannamos-storage-root", runtime_patches)
        self.assertIn("pannamos-user-data-dir", runtime_patches)
        self.assertIn("pannamos-execution-dir", runtime_patches)
        self.assertNotIn('FILE_PATH_LITERAL(".browseros")', runtime_patches)
        self.assertNotIn("~/.browseros", runtime_patches)
        self.assertIn(identity.server_resources_dir_name, resources_build)
        self.assertIn(identity.server_resources_dir_name, runtime_patches)
        self.assertNotIn("BrowserOSServer/default", resources_build)
        self.assertNotIn('FILE_PATH_LITERAL("BrowserOSServer")', runtime_patches)
        self.assertIn(identity.server_appcast_url, constants)
        self.assertIn(identity.server_alpha_appcast_url, constants)
        self.assertNotIn("cdn.browseros.com/appcast-server", constants)

    def test_server_updater_is_manual_opt_in(self):
        identity = PANNAMOS_PRODUCT_IDENTITY
        patches_dir = Path(__file__).resolve().parents[2] / "chromium_patches"
        browseros_dir = patches_dir / "chrome" / "browser" / "browseros"

        switches = _read_added_patch_lines(
            browseros_dir / "core" / "browseros_switches.h"
        )
        manager = _read_added_patch_lines(
            browseros_dir / "server" / "browseros_server_manager.cc"
        )

        self.assertFalse(identity.server_updater_default_enabled)
        self.assertIn("kEnableServerUpdater", switches)
        self.assertIn("pannamos-enable-server-updater", switches)
        self.assertIn("HasSwitch(browseros::kEnableServerUpdater)", manager)
        self.assertIn("HasSwitch(browseros::kDisableServerUpdater)", manager)
        self.assertIn("PannamOS server updater disabled by default", manager)


def _read_branding_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text().splitlines():
        if not line or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = value
    return values


def _read_added_patch_lines(path: Path) -> str:
    added_lines: list[str] = []
    for line in path.read_text().splitlines():
        if line.startswith("+++") or not line.startswith("+"):
            continue
        added_lines.append(line[1:])
    return "\n".join(added_lines)


def _guid_initializer(guid: str) -> str:
    value = uuid.UUID(guid.strip("{}"))
    raw = value.bytes
    data1 = int.from_bytes(raw[0:4], "big")
    data2 = int.from_bytes(raw[4:6], "big")
    data3 = int.from_bytes(raw[6:8], "big")
    data4 = ", ".join(f"0x{byte:02X}" for byte in raw[8:])
    return f"{{0x{data1:08X},0x{data2:04X},0x{data3:04X},{{{data4}}}}}".replace(
        " ",
        "",
    )


if __name__ == "__main__":
    unittest.main()
