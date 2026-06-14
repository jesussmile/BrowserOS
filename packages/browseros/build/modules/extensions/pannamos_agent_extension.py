#!/usr/bin/env python3
"""Bundle a private local PannamOS agent extension CRX."""

import json
import os
import re
import shutil
import base64
import binascii
import hashlib
import struct
from pathlib import Path

from ...common.context import Context
from ...common.module import CommandModule, ValidationError
from ...common.utils import log_info, log_success


UPSTREAM_BROWSEROS_AGENT_EXTENSION_IDS = {
    "bflpfmnmnokmjhmgnolecpppdbdophmk",
    "adlpneommgkgeanpaekgoaolcpncohkf",
    "nlnihljpboknmfagkikhkdblbedophja",
    "djhdjhlnljbjgejbndockeedocneiaei",
}
PANNAMOS_AGENT_EXTENSION_ID_ENV = "PANNAMOS_AGENT_EXTENSION_ID"
PANNAMOS_AGENT_CRX_ENV = "PANNAMOS_AGENT_CRX"
PANNAMOS_AGENT_EXTENSION_DIR_ENV = "PANNAMOS_AGENT_EXTENSION_DIR"
PANNAMOS_AGENT_VERSION_ENV = "PANNAMOS_AGENT_VERSION"
CHROME_EXTENSION_ID_RE = re.compile(r"^[a-p]{32}$")


class PannamOSAgentExtensionModule(CommandModule):
    """Bundle a local PannamOS agent CRX without BrowserOS CDN access."""

    produces = ["pannamos_agent_extension", "bundled_extensions"]
    requires = []
    description = "Bundle private local PannamOS agent extension CRX"

    def validate(self, ctx: Context) -> None:
        if not ctx.chromium_src or not ctx.chromium_src.exists():
            raise ValidationError(
                f"Chromium source directory not found: {ctx.chromium_src}"
            )

        crx_path = self._get_crx_path()
        if not crx_path:
            raise ValidationError(
                f"{PANNAMOS_AGENT_CRX_ENV} must point to a locally packed "
                "PannamOS agent .crx file"
            )
        if not crx_path.exists():
            raise ValidationError(f"{PANNAMOS_AGENT_CRX_ENV} not found: {crx_path}")
        if crx_path.suffix.lower() != ".crx":
            raise ValidationError(f"{PANNAMOS_AGENT_CRX_ENV} must be a .crx file")

        self._get_extension_id(ctx)
        self._validate_crx_extension_id(crx_path, ctx)
        self._read_agent_manifest(ctx)

    def execute(self, ctx: Context) -> None:
        log_info("\n📦 Bundling private PannamOS agent extension...")

        output_dir = self._get_output_dir(ctx)
        output_dir.mkdir(parents=True, exist_ok=True)
        extension_id = self._get_extension_id(ctx)

        for old_crx in output_dir.glob("*.crx"):
            old_crx.unlink()

        crx_path = self._get_crx_path()
        assert crx_path is not None
        dest_crx = output_dir / f"{extension_id}.crx"
        shutil.copyfile(crx_path, dest_crx)

        manifest = self._read_agent_manifest(ctx)
        version = self._read_agent_version(manifest)
        self._write_bundled_manifest(output_dir, extension_id, version)
        self._write_build_gn(output_dir, extension_id)
        self._rewrite_chromium_extension_identity(ctx, extension_id)

        ctx.artifact_registry.add("pannamos_agent_extension", dest_crx)
        ctx.artifact_registry.add("bundled_extensions", output_dir)

        log_success(
            f"Bundled PannamOS agent extension {extension_id} v{version}"
        )

    def _get_output_dir(self, ctx: Context) -> Path:
        return ctx.chromium_src / "chrome" / "browser" / "browseros" / "bundled_extensions"

    def _get_crx_path(self) -> Path | None:
        value = os.environ.get(PANNAMOS_AGENT_CRX_ENV)
        if not value:
            return None
        return Path(value).expanduser().resolve()

    def _get_extension_id(self, ctx: Context) -> str:
        extension_id = os.environ.get(PANNAMOS_AGENT_EXTENSION_ID_ENV, "").strip()
        if not extension_id:
            raise ValidationError(
                f"{PANNAMOS_AGENT_EXTENSION_ID_ENV} must be set to the private "
                "PannamOS agent extension ID"
            )
        if not CHROME_EXTENSION_ID_RE.match(extension_id):
            raise ValidationError(
                f"{PANNAMOS_AGENT_EXTENSION_ID_ENV} must be a 32-character "
                "Chrome extension ID using only letters a-p"
            )
        if extension_id in UPSTREAM_BROWSEROS_AGENT_EXTENSION_IDS:
            raise ValidationError(
                f"{PANNAMOS_AGENT_EXTENSION_ID_ENV} must be PannamOS-private, "
                "not an upstream BrowserOS extension ID"
            )

        manifest = self._read_agent_manifest(ctx)
        manifest_key = manifest.get("key")
        if isinstance(manifest_key, str) and manifest_key.strip():
            derived_id = _derive_chrome_extension_id_from_public_key(manifest_key)
            if derived_id != extension_id:
                raise ValidationError(
                    f"{PANNAMOS_AGENT_EXTENSION_ID_ENV}={extension_id} does not "
                    f"match the built agent manifest key ID {derived_id}"
                )

        return extension_id

    def _validate_crx_extension_id(self, crx_path: Path, ctx: Context) -> None:
        expected_id = self._get_extension_id(ctx)
        actual_id = _read_crx_extension_id(crx_path)
        if actual_id != expected_id:
            raise ValidationError(
                f"{PANNAMOS_AGENT_CRX_ENV} extension ID {actual_id} does not "
                f"match {PANNAMOS_AGENT_EXTENSION_ID_ENV}={expected_id}"
            )

    def _get_manifest_path(self, ctx: Context) -> Path:
        extension_dir = os.environ.get(PANNAMOS_AGENT_EXTENSION_DIR_ENV)
        if extension_dir:
            return Path(extension_dir).expanduser().resolve() / "manifest.json"
        return (
            ctx.root_dir.parent
            / "browseros-agent"
            / "apps"
            / "agent"
            / "dist"
            / "chrome-mv3"
            / "manifest.json"
        )

    def _read_agent_manifest(self, ctx: Context) -> dict:
        manifest_path = self._get_manifest_path(ctx)
        if not manifest_path.exists():
            raise ValidationError(
                f"Agent manifest not found: {manifest_path}. Build the agent first."
            )

        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValidationError(f"Invalid agent manifest JSON: {manifest_path}") from exc

        if not isinstance(manifest, dict):
            raise ValidationError(f"Agent manifest must be a JSON object: {manifest_path}")
        return manifest

    def _read_agent_version(self, manifest: dict) -> str:
        override = os.environ.get(PANNAMOS_AGENT_VERSION_ENV)
        if override and override.strip():
            return override.strip()

        version = str(manifest.get("version", "")).strip()
        if not version:
            raise ValidationError(
                f"Agent manifest missing version. Set {PANNAMOS_AGENT_VERSION_ENV} "
                "or rebuild the agent."
            )
        return version

    def _write_bundled_manifest(
        self, output_dir: Path, extension_id: str, version: str
    ) -> None:
        data = {
            extension_id: {
                "external_crx": f"{extension_id}.crx",
                "external_version": version,
            }
        }
        json_path = output_dir / "bundled_extensions.json"
        json_path.write_text(
            json.dumps(data, indent=2) + "\n",
            encoding="utf-8",
        )

    def _write_build_gn(self, output_dir: Path, extension_id: str) -> None:
        build_gn = output_dir / "BUILD.gn"
        build_gn.write_text(
            "\n".join(
                [
                    "# Copyright 2024 The Chromium Authors",
                    "# Use of this source code is governed by a BSD-style license that can be",
                    "# found in the LICENSE file.",
                    "",
                    "# Private PannamOS bundled extension payload.",
                    "_bundled_extensions_sources = [",
                    '  "bundled_extensions.json",',
                    f'  "{extension_id}.crx",  # PannamOS agent',
                    "]",
                    "",
                    "if (!is_mac) {",
                    '  copy("bundled_extensions") {',
                    "    sources = _bundled_extensions_sources",
                    '    outputs = [ "$root_out_dir/browseros_extensions/{{source_file_part}}" ]',
                    "  }",
                    "} else {",
                    '  bundle_data("bundled_extensions") {',
                    "    sources = _bundled_extensions_sources",
                    '    outputs = [ "{{bundle_contents_dir}}/Resources/browseros_extensions/{{source_file_part}}" ]',
                    "  }",
                    "}",
                    "",
                ]
            ),
            encoding="utf-8",
        )

    def _rewrite_chromium_extension_identity(
        self, ctx: Context, extension_id: str
    ) -> None:
        constants_path = (
            ctx.chromium_src
            / "chrome"
            / "browser"
            / "browseros"
            / "core"
            / "browseros_constants.h"
        )
        if not constants_path.exists():
            raise ValidationError(
                f"Chromium BrowserOS constants not found: {constants_path}. "
                "Run patches before pannamos_agent_extension."
            )

        text = constants_path.read_text(encoding="utf-8")
        rewritten = re.sub(
            r'inline constexpr char kAgentExtensionId\[\] =\s*"[^"]+";',
            (
                'inline constexpr char kAgentExtensionId[] =\n'
                f'    "{extension_id}";'
            ),
            text,
            count=1,
        )
        if rewritten == text:
            raise ValidationError(
                f"Could not rewrite kAgentExtensionId in {constants_path}"
            )
        text = rewritten

        for constant_name in (
            "kBrowserOSConfigUrl",
            "kBrowserOSAlphaConfigUrl",
            "kBrowserOSUpdateUrl",
            "kBrowserOSAlphaUpdateUrl",
        ):
            text = self._rewrite_string_constant(
                constants_path,
                text,
                constant_name,
                "",
            )

        for constant_name in (
            "kBugReporterExtensionId",
            "kControllerExtensionId",
        ):
            text = self._rewrite_string_constant(
                constants_path,
                text,
                constant_name,
                "",
            )

        rewritten = re.sub(
            r"inline constexpr BrowserOSExtensionInfo kBrowserOSExtensions\[\] = \{.*?\n\};",
            (
                "inline constexpr BrowserOSExtensionInfo kBrowserOSExtensions[] = {\n"
                "    {kAgentExtensionId, false, false},\n"
                "};"
            ),
            text,
            count=1,
            flags=re.DOTALL,
        )
        if rewritten == text:
            existing_agent_only_list = re.search(
                r"inline constexpr BrowserOSExtensionInfo kBrowserOSExtensions\[\] = \{\s*"
                r"\{kAgentExtensionId, false, false\},\s*"
                r"\};",
                text,
                flags=re.DOTALL,
            )
            if existing_agent_only_list:
                constants_path.write_text(text, encoding="utf-8")
                return
            raise ValidationError(
                f"Could not rewrite kBrowserOSExtensions in {constants_path}"
            )
        text = rewritten
        constants_path.write_text(text, encoding="utf-8")

    def _rewrite_string_constant(
        self,
        constants_path: Path,
        text: str,
        constant_name: str,
        value: str,
    ) -> str:
        rewritten = re.sub(
            rf'inline constexpr char {constant_name}\[\] =\s*"[^"]*";',
            (
                f"inline constexpr char {constant_name}[] =\n"
                f'    "{value}";'
            ),
            text,
            count=1,
            flags=re.DOTALL,
        )
        if rewritten == text:
            existing_desired_value = re.search(
                rf'inline constexpr char {constant_name}\[\] =\s*"{re.escape(value)}";',
                text,
                flags=re.DOTALL,
            )
            if existing_desired_value:
                return text
            raise ValidationError(
                f"Could not rewrite {constant_name} in {constants_path}"
            )
        return rewritten


def _derive_chrome_extension_id_from_public_key(manifest_key: str) -> str:
    try:
        public_key = base64.b64decode(manifest_key, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValidationError("Agent manifest key is not valid base64") from exc

    return _derive_chrome_extension_id_from_public_key_bytes(public_key)


def _derive_chrome_extension_id_from_public_key_bytes(public_key: bytes) -> str:
    digest = hashlib.sha256(public_key).digest()
    alphabet = "abcdefghijklmnop"
    return "".join(
        alphabet[byte >> 4] + alphabet[byte & 0x0F]
        for byte in digest[:16]
    )


def _read_crx_extension_id(crx_path: Path) -> str:
    data = crx_path.read_bytes()
    if len(data) < 12 or data[:4] != b"Cr24":
        raise ValidationError(f"{crx_path} is not a CRX file")

    version = struct.unpack_from("<I", data, 4)[0]
    if version == 2:
        if len(data) < 16:
            raise ValidationError(f"{crx_path} has an incomplete CRX2 header")
        public_key_len, signature_len = struct.unpack_from("<II", data, 8)
        public_key_start = 16
        public_key_end = public_key_start + public_key_len
        if public_key_end + signature_len > len(data):
            raise ValidationError(f"{crx_path} has an invalid CRX2 header")
        return _derive_chrome_extension_id_from_public_key_bytes(
            data[public_key_start:public_key_end]
        )

    if version == 3:
        header_size = struct.unpack_from("<I", data, 8)[0]
        header_start = 12
        header_end = header_start + header_size
        if header_end > len(data):
            raise ValidationError(f"{crx_path} has an invalid CRX3 header")
        header = data[header_start:header_end]
        crx_id = _read_crx3_id_from_header(header)
        if crx_id is None:
            public_key = _read_crx3_first_public_key(header)
            if public_key is None:
                raise ValidationError(f"{crx_path} CRX3 header has no public key")
            return _derive_chrome_extension_id_from_public_key_bytes(public_key)
        return _chrome_extension_id_from_crx_id_bytes(crx_id)

    raise ValidationError(f"{crx_path} uses unsupported CRX version {version}")


def _read_crx3_id_from_header(header: bytes) -> bytes | None:
    signed_header_data = _read_protobuf_bytes_field(header, 10000)
    if signed_header_data is None:
        return None
    return _read_protobuf_bytes_field(signed_header_data, 1)


def _read_crx3_first_public_key(header: bytes) -> bytes | None:
    for proof_field in (2, 3):
        proof = _read_protobuf_bytes_field(header, proof_field)
        if proof is None:
            continue
        public_key = _read_protobuf_bytes_field(proof, 1)
        if public_key is not None:
            return public_key
    return None


def _read_protobuf_bytes_field(data: bytes, wanted_field: int) -> bytes | None:
    offset = 0
    while offset < len(data):
        key, offset = _read_varint(data, offset)
        field_number = key >> 3
        wire_type = key & 0x07
        if wire_type == 0:
            _, offset = _read_varint(data, offset)
            continue
        if wire_type == 1:
            offset += 8
            continue
        if wire_type == 2:
            length, offset = _read_varint(data, offset)
            end = offset + length
            if end > len(data):
                raise ValidationError("Invalid CRX3 protobuf length")
            value = data[offset:end]
            offset = end
            if field_number == wanted_field:
                return value
            continue
        if wire_type == 5:
            offset += 4
            continue
        raise ValidationError(f"Unsupported CRX3 protobuf wire type {wire_type}")
    return None


def _read_varint(data: bytes, offset: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while offset < len(data):
        byte = data[offset]
        offset += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, offset
        shift += 7
        if shift > 63:
            raise ValidationError("Invalid CRX3 protobuf varint")
    raise ValidationError("Truncated CRX3 protobuf varint")


def _chrome_extension_id_from_crx_id_bytes(crx_id: bytes) -> str:
    alphabet = "abcdefghijklmnop"
    return "".join(
        alphabet[byte >> 4] + alphabet[byte & 0x0F]
        for byte in crx_id[:16]
    )
