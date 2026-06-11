"""App versioning for the team Streamlit deck.

The semantic version is the single source of truth in the ``VERSION`` file at the app
root (bump it by hand on a release). Build provenance — the git commit and build time —
is injected at deploy by the CI workflow as environment variables, so a running Cloud Run
revision can always be traced back to an exact commit:

  APP_VERSION   overrides the VERSION file (optional; CI sets it to the same value)
  GIT_SHA       short commit SHA the image was built from   (CI: ${{ github.sha }})
  BUILD_TIME    UTC ISO-8601 timestamp the image was built  (CI: date -u)

Locally none of these are set, so you get the VERSION string plus a "dev" marker.
"""
from __future__ import annotations

import os
from pathlib import Path

_VERSION_FILE = Path(__file__).resolve().parent.parent / "VERSION"


def _base_version() -> str:
    env = os.environ.get("APP_VERSION")
    if env:
        return env.strip()
    try:
        return _VERSION_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return "0.0.0"


VERSION = _base_version()
GIT_SHA = os.environ.get("GIT_SHA", "").strip()
BUILD_TIME = os.environ.get("BUILD_TIME", "").strip()


def short() -> str:
    """Compact version label, e.g. ``v0.1.0 · a1b2c3d`` (or ``v0.1.0 · dev`` locally)."""
    return f"v{VERSION} · {GIT_SHA or 'dev'}"


def full() -> str:
    """Multi-line version + build provenance for an expandable 'About' panel."""
    lines = [f"**Version:** v{VERSION}"]
    lines.append(f"**Commit:** {GIT_SHA}" if GIT_SHA else "**Commit:** dev (local)")
    if BUILD_TIME:
        lines.append(f"**Built:** {BUILD_TIME}")
    return "  \n".join(lines)
