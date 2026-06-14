#!/usr/bin/env python3
"""Tests for private PannamOS agent extension bundling."""

import json
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from build.common.context import Context
from build.common.module import ValidationError
from build.modules.extensions.pannamos_agent_extension import (
    PANNAMOS_AGENT_CRX_ENV,
    PANNAMOS_AGENT_EXTENSION_DIR_ENV,
    PANNAMOS_AGENT_EXTENSION_ID_ENV,
    PannamOSAgentExtensionModule,
    _derive_chrome_extension_id_from_public_key,
    _derive_chrome_extension_id_from_public_key_bytes,
    _read_crx_extension_id,
)


TEST_PUBLIC_KEY = b"pannamos-private-test-public-key"
TEST_EXTENSION_ID = _derive_chrome_extension_id_from_public_key_bytes(TEST_PUBLIC_KEY)
UPSTREAM_AGENT_PUBLIC_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvBDAaDRvv61NpBeLR8etBRw82lv9VJO3sz/mA26gDzWKtVuzW4DXCl8Zfj5oWmoXLTfv3aiTigUXo/LHOoGpSucEVroMmAc7cgu2KuQ1fZPpMvYa0npD/m4h89360q8Oz0oKKaZGS905IJ04M2IkF4CuU3YEHFJBWb+cUyK9H8YVugelYbPD0IVs63T1SkGbh/t/Tfb2DpkinduSO8+x26sKydm30SRt+iZ2+7Nolcdum3LExInUiX2Pgb65Jb+mVw8NqyTVJyCEp8uq0cSHomWFQirSJ80tsDhISp4btwaRKHrXqovQx9XHQv4hCd+3LuB830eUEVMUNuCO+OyPxQIDAQAB"


class PannamOSAgentExtensionModuleTest(unittest.TestCase):
    def test_derives_chrome_extension_id_from_manifest_key(self):
        self.assertEqual(
            _derive_chrome_extension_id_from_public_key(UPSTREAM_AGENT_PUBLIC_KEY),
            "bflpfmnmnokmjhmgnolecpppdbdophmk",
        )

    def test_reads_crx3_extension_id_from_signed_header(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            crx_path = Path(temp_dir) / "test.crx"
            crx_id = bytes(range(16))
            signed_header = _proto_bytes_field(1, crx_id)
            header = _proto_bytes_field(10000, signed_header)
            crx_path.write_bytes(b"Cr24" + struct.pack("<II", 3, len(header)) + header)

            self.assertEqual(
                _read_crx_extension_id(crx_path),
                "aaabacadaeafagahaiajakalamanaoap",
            )

    def test_bundles_local_agent_crx_only(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            chromium_src = temp / "chromium"
            chromium_src.mkdir()
            constants_path = _write_browseros_constants(chromium_src)

            crx_path = temp / "pannamos-agent.crx"
            _write_fake_crx2(crx_path)

            extension_dir = temp / "agent"
            extension_dir.mkdir()
            (extension_dir / "manifest.json").write_text(
                json.dumps({"version": "1.2.3"}),
                encoding="utf-8",
            )

            ctx = Context(
                chromium_src=chromium_src,
                architecture="x64",
                build_type="release",
            )

            with patch.dict(
                "os.environ",
                {
                    PANNAMOS_AGENT_CRX_ENV: str(crx_path),
                    PANNAMOS_AGENT_EXTENSION_DIR_ENV: str(extension_dir),
                    PANNAMOS_AGENT_EXTENSION_ID_ENV: TEST_EXTENSION_ID,
                },
                clear=True,
            ):
                module = PannamOSAgentExtensionModule()
                module.validate(ctx)
                module.execute(ctx)

            output_dir = (
                chromium_src / "chrome" / "browser" / "browseros" / "bundled_extensions"
            )
            bundled_crx = output_dir / f"{TEST_EXTENSION_ID}.crx"
            self.assertEqual(bundled_crx.read_bytes(), crx_path.read_bytes())

            manifest = json.loads(
                (output_dir / "bundled_extensions.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                manifest,
                {
                    TEST_EXTENSION_ID: {
                        "external_crx": f"{TEST_EXTENSION_ID}.crx",
                        "external_version": "1.2.3",
                    }
                },
            )

            build_gn = (output_dir / "BUILD.gn").read_text(encoding="utf-8")
            self.assertIn(f'"{TEST_EXTENSION_ID}.crx"', build_gn)
            self.assertNotIn("adlpneommgkgeanpaekgoaolcpncohkf", build_gn)
            self.assertNotIn("nlnihljpboknmfagkikhkdblbedophja", build_gn)
            self.assertNotIn("cdn.browseros.com", build_gn)

            constants = constants_path.read_text(encoding="utf-8")
            self.assertIn(f'"{TEST_EXTENSION_ID}"', constants)
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
            self.assertIn("{kAgentExtensionId, false, false}", constants)
            self.assertNotIn("cdn.browseros.com", constants)
            self.assertNotIn("bflpfmnmnokmjhmgnolecpppdbdophmk", constants)
            self.assertNotIn("adlpneommgkgeanpaekgoaolcpncohkf", constants)
            self.assertNotIn("nlnihljpboknmfagkikhkdblbedophja", constants)
            active_extensions = constants.split("kBrowserOSExtensions[] = {", 1)[
                1
            ].split("};", 1)[0]
            self.assertNotIn("kBugReporterExtensionId", active_extensions)
            self.assertNotIn("kControllerExtensionId", active_extensions)

    def test_requires_local_agent_crx(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            chromium_src = Path(temp_dir) / "chromium"
            chromium_src.mkdir()
            ctx = Context(
                chromium_src=chromium_src,
                architecture="x64",
                build_type="release",
            )

            with patch.dict("os.environ", {}, clear=True):
                with self.assertRaisesRegex(
                    ValidationError,
                    PANNAMOS_AGENT_CRX_ENV,
                ):
                    PannamOSAgentExtensionModule().validate(ctx)

    def test_requires_private_extension_id(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            chromium_src = temp / "chromium"
            chromium_src.mkdir()
            crx_path = temp / "pannamos-agent.crx"
            _write_fake_crx2(crx_path)
            extension_dir = temp / "agent"
            extension_dir.mkdir()
            (extension_dir / "manifest.json").write_text(
                json.dumps({"version": "1.2.3"}),
                encoding="utf-8",
            )
            ctx = Context(
                chromium_src=chromium_src,
                architecture="x64",
                build_type="release",
            )

            with patch.dict(
                "os.environ",
                {
                    PANNAMOS_AGENT_CRX_ENV: str(crx_path),
                    PANNAMOS_AGENT_EXTENSION_DIR_ENV: str(extension_dir),
                },
                clear=True,
            ):
                with self.assertRaisesRegex(
                    ValidationError,
                    PANNAMOS_AGENT_EXTENSION_ID_ENV,
                ):
                    PannamOSAgentExtensionModule().validate(ctx)

    def test_rejects_upstream_browseros_extension_id(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            chromium_src = temp / "chromium"
            chromium_src.mkdir()
            crx_path = temp / "pannamos-agent.crx"
            _write_fake_crx2(crx_path)
            extension_dir = temp / "agent"
            extension_dir.mkdir()
            (extension_dir / "manifest.json").write_text(
                json.dumps({"version": "1.2.3"}),
                encoding="utf-8",
            )
            ctx = Context(
                chromium_src=chromium_src,
                architecture="x64",
                build_type="release",
            )

            with patch.dict(
                "os.environ",
                {
                    PANNAMOS_AGENT_CRX_ENV: str(crx_path),
                    PANNAMOS_AGENT_EXTENSION_DIR_ENV: str(extension_dir),
                    PANNAMOS_AGENT_EXTENSION_ID_ENV: (
                        "bflpfmnmnokmjhmgnolecpppdbdophmk"
                    ),
                },
                clear=True,
            ):
                with self.assertRaisesRegex(ValidationError, "upstream BrowserOS"):
                    PannamOSAgentExtensionModule().validate(ctx)

    def test_rejects_crx_with_mismatched_extension_id(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            chromium_src = temp / "chromium"
            chromium_src.mkdir()
            crx_path = temp / "pannamos-agent.crx"
            _write_fake_crx2(crx_path, public_key=b"different-public-key")
            extension_dir = temp / "agent"
            extension_dir.mkdir()
            (extension_dir / "manifest.json").write_text(
                json.dumps({"version": "1.2.3"}),
                encoding="utf-8",
            )
            ctx = Context(
                chromium_src=chromium_src,
                architecture="x64",
                build_type="release",
            )

            with patch.dict(
                "os.environ",
                {
                    PANNAMOS_AGENT_CRX_ENV: str(crx_path),
                    PANNAMOS_AGENT_EXTENSION_DIR_ENV: str(extension_dir),
                    PANNAMOS_AGENT_EXTENSION_ID_ENV: TEST_EXTENSION_ID,
                },
                clear=True,
            ):
                with self.assertRaisesRegex(ValidationError, "does not match"):
                    PannamOSAgentExtensionModule().validate(ctx)


def _write_browseros_constants(chromium_src: Path) -> Path:
    constants_path = (
        chromium_src
        / "chrome"
        / "browser"
        / "browseros"
        / "core"
        / "browseros_constants.h"
    )
    constants_path.parent.mkdir(parents=True, exist_ok=True)
    constants_path.write_text(
        """
inline constexpr char kBrowserOSConfigUrl[] =
    "https://cdn.browseros.com/extensions/extensions.json";
inline constexpr char kBrowserOSAlphaConfigUrl[] =
    "https://cdn.browseros.com/extensions/extensions.alpha.json";
inline constexpr char kAgentExtensionId[] =
    "bflpfmnmnokmjhmgnolecpppdbdophmk";
inline constexpr char kBugReporterExtensionId[] =
    "adlpneommgkgeanpaekgoaolcpncohkf";
inline constexpr char kControllerExtensionId[] =
    "nlnihljpboknmfagkikhkdblbedophja";
inline constexpr char kBrowserOSUpdateUrl[] =
    "https://cdn.browseros.com/extensions/update-manifest.xml";
inline constexpr char kBrowserOSAlphaUpdateUrl[] =
    "https://cdn.browseros.com/extensions/update-manifest.alpha.xml";

struct BrowserOSExtensionInfo {
  const char* id;
  bool is_pinned;
  bool is_labelled;
};

inline constexpr BrowserOSExtensionInfo kBrowserOSExtensions[] = {
    {kAgentExtensionId, false, false},
    {kBugReporterExtensionId, true, false},
    {kControllerExtensionId, false, false},
};
""".lstrip(),
        encoding="utf-8",
    )
    return constants_path


def _write_fake_crx2(path: Path, public_key: bytes = TEST_PUBLIC_KEY) -> None:
    path.write_bytes(
        b"Cr24"
        + struct.pack("<III", 2, len(public_key), 0)
        + public_key
    )


def _proto_bytes_field(field_number: int, value: bytes) -> bytes:
    return (
        _proto_varint((field_number << 3) | 2)
        + _proto_varint(len(value))
        + value
    )


def _proto_varint(value: int) -> bytes:
    chunks = []
    while True:
        byte = value & 0x7F
        value >>= 7
        if value:
            chunks.append(byte | 0x80)
        else:
            chunks.append(byte)
            return bytes(chunks)


if __name__ == "__main__":
    unittest.main()
