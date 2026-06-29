#!/usr/bin/env python3
"""Deploy Lanxu Finance site to Cloudflare Pages via Direct Upload API."""

from __future__ import annotations

import hashlib
import io
import json
import os
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT_NAME = os.getenv("CF_PAGES_PROJECT", "lanxu-finance")
CUSTOM_DOMAINS = [
    domain.strip()
    for domain in os.getenv("CF_CUSTOM_DOMAINS", "lanxucaijing.com,www.lanxucaijing.com").split(",")
    if domain.strip()
]

INCLUDE_DIRS = {"data", "daily", ".github"}
INCLUDE_FILES = {
    "index.html",
    "archive.html",
    "app.js",
    "shared.js",
    "archive.js",
    "styles.css",
    "_routes.json",
    "favicon.svg",
    "feed.xml",
    "robots.txt",
    "sitemap.xml",
    "wrangler.toml",
}

EXCLUDE_PREFIXES = ("scripts/", "docs/", "newsletters/", ".git/")


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def api_request(method: str, url: str, token: str, data=None, headers=None):
    req_headers = {"Authorization": f"Bearer {token}"}
    if headers:
        req_headers.update(headers)
    request = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Cloudflare API {method} {url} failed ({exc.code}): {body}") from exc


def should_include(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if rel in INCLUDE_FILES:
        return True
    if any(rel.startswith(prefix) for prefix in EXCLUDE_PREFIXES):
        return False
    top = rel.split("/", 1)[0]
    return top in INCLUDE_DIRS


def collect_files() -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or not should_include(path):
            continue
        rel = path.relative_to(ROOT).as_posix()
        files[rel] = path.read_bytes()
    return files


def file_digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def build_zip_from_files(files: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for rel, content in sorted(files.items()):
            archive.writestr(rel, content)
    return buffer.getvalue()


def ensure_project(account_id: str, token: str) -> None:
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/pages/projects"
    payload = json.dumps({"name": PROJECT_NAME, "production_branch": "main"}).encode("utf-8")
    try:
        api_request("POST", url, token, data=payload, headers={"Content-Type": "application/json"})
        print(f"Created Cloudflare Pages project: {PROJECT_NAME}")
    except RuntimeError as exc:
        if "already exists" in str(exc).lower() or "8000007" in str(exc):
            print(f"Project already exists: {PROJECT_NAME}")
        else:
            raise


def normalize_path(path: str) -> str:
    return path if path.startswith("/") else f"/{path}"


def deploy(account_id: str, token: str, files: dict[str, bytes]) -> str:
    boundary = "----LanxuFinanceBoundary"
    manifest = {normalize_path(path): file_digest(content) for path, content in files.items()}
    body = io.BytesIO()

    def write_field(name: str, value: str | bytes, filename: str | None = None, content_type: str | None = None) -> None:
        body.write(f"--{boundary}\r\n".encode())
        if filename:
            body.write(f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode())
            body.write(f"Content-Type: {content_type or 'application/octet-stream'}\r\n\r\n".encode())
            body.write(value if isinstance(value, bytes) else value.encode())
        else:
            body.write(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
            body.write(value if isinstance(value, bytes) else value.encode())
        body.write(b"\r\n")

    write_field("manifest", json.dumps(manifest))
    for path, content in sorted(files.items()):
        field_name = normalize_path(path)
        write_field(field_name, content, filename=Path(path).name)
    if "_routes.json" in files:
        write_field("_routesJson", files["_routes.json"], filename="_routes.json", content_type="application/json")

    body.write(f"--{boundary}--\r\n".encode())

    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/pages/projects/"
        f"{PROJECT_NAME}/deployments"
    )
    result = api_request(
        "POST",
        url,
        token,
        data=body.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    deployment = result.get("result") or {}
    deployment_url = deployment.get("url")
    if not deployment_url:
        aliases = deployment.get("aliases") or []
        deployment_url = aliases[0] if aliases else ""
    print(f"Deployment URL: {deployment_url or 'pending'}")
    return deployment_url or ""


def bind_domains(account_id: str, token: str) -> None:
    for domain in CUSTOM_DOMAINS:
        url = (
            f"https://api.cloudflare.com/client/v4/accounts/{account_id}/pages/projects/"
            f"{PROJECT_NAME}/domains"
        )
        payload = json.dumps({"name": domain}).encode("utf-8")
        try:
            api_request("POST", url, token, data=payload, headers={"Content-Type": "application/json"})
            print(f"Bound custom domain: {domain}")
        except RuntimeError as exc:
            message = str(exc)
            if "already exists" in message.lower() or "8000018" in message:
                print(f"Domain already configured: {domain}")
            else:
                print(f"Warning: could not bind {domain}: {message}")


def main() -> int:
    load_env_file(ROOT / ".env.deploy")
    token = os.getenv("CLOUDFLARE_API_TOKEN") or os.getenv("CF_API_TOKEN")
    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID") or os.getenv("CF_ACCOUNT_ID")

    files = collect_files()
    zip_path = ROOT / "dist-upload.zip"
    zip_path.write_bytes(build_zip_from_files(files))
    print(f"Created {zip_path.name} ({zip_path.stat().st_size // 1024} KB, {len(files)} files)")

    if not token or not account_id:
        print("Missing CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.", file=sys.stderr)
        print("Upload dist-upload.zip manually in Cloudflare Pages, or fill .env.deploy and rerun.", file=sys.stderr)
        return 1

    ensure_project(account_id, token)
    deploy(account_id, token, files)
    bind_domains(account_id, token)
    print("Cloudflare deploy complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
