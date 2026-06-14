"""Validate Chromium patch hunk headers.

The build applies files from ``chromium_patches`` with git. A bad hunk count in
an added-file patch can silently truncate the generated Chromium file, causing a
compile failure much later. Keep this cheap guard close to the build metadata.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path


HUNK_RE = re.compile(r"^@@ -(?P<old_start>\d+)(?:,(?P<old_count>\d+))? \+(?P<new_start>\d+)(?:,(?P<new_count>\d+))? @@")


class PatchHunkCountTest(unittest.TestCase):
    def test_chromium_patch_hunk_counts_match_body(self) -> None:
        patches_dir = Path(__file__).resolve().parents[2] / "chromium_patches"
        failures: list[str] = []

        for patch_path in sorted(path for path in patches_dir.rglob("*") if path.is_file()):
            lines = patch_path.read_text(encoding="utf-8").splitlines()
            for index, line in enumerate(lines):
                match = HUNK_RE.match(line)
                if not match:
                    continue

                declared_old = int(match.group("old_count") or "1")
                declared_new = int(match.group("new_count") or "1")
                actual_old = 0
                actual_new = 0

                for body_line in lines[index + 1 :]:
                    if body_line.startswith("diff --git ") or body_line.startswith("@@ "):
                        break
                    if body_line.startswith("\\ No newline at end of file"):
                        continue
                    if body_line.startswith("--- ") or body_line.startswith("+++ "):
                        continue
                    if body_line.startswith("-"):
                        actual_old += 1
                    elif body_line.startswith("+"):
                        actual_new += 1
                    elif body_line.startswith(" "):
                        actual_old += 1
                        actual_new += 1

                if (declared_old, declared_new) != (actual_old, actual_new):
                    rel = patch_path.relative_to(patches_dir)
                    failures.append(
                        f"{rel}:{index + 1}: declared -{declared_old} +{declared_new}, "
                        f"actual -{actual_old} +{actual_new}"
                    )

        self.assertEqual([], failures)


if __name__ == "__main__":
    unittest.main()
