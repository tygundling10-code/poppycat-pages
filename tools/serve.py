#!/usr/bin/env python3
"""
Local preview of the site.

    python3 tools/serve.py          then open  http://localhost:4173

It serves the folder the same way GitHub Pages does. It also stands in for the
small part of the GitHub API that the Studio page (admin/) uses, so artwork can
be added and edited offline: changes are written straight into this folder.
Nothing here runs on the live site.
"""
import argparse
import base64
import hashlib
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))
API = "/__local/api"
WRITABLE_DIRS = ("data/", "art/")
WRITABLE_FILES = ("index.html",)
MAX_BODY = 60 * 1024 * 1024


def blob_sha(data):
    """Same id git (and so GitHub) gives a file with these contents."""
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


class Handler(SimpleHTTPRequestHandler):
    server_version = "StudioPreview/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if self.path.startswith(API) and self.command != "GET":
            super().log_message(fmt, *args)

    # ---- plumbing -------------------------------------------------------
    def _send(self, code, obj=None):
        body = b"" if obj is None else json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _is_local(self):
        """Only answer the API for pages opened from this computer."""
        host = urlparse("//" + (self.headers.get("Host") or "")).hostname or ""
        if host not in ("localhost", "127.0.0.1", "::1"):
            return False
        origin = self.headers.get("Origin")
        if origin and (urlparse(origin).hostname or "") not in ("localhost", "127.0.0.1", "::1"):
            return False
        return True

    def _resolve(self, rel):
        full = os.path.abspath(os.path.join(ROOT, rel))
        if full != ROOT and not full.startswith(ROOT + os.sep):
            return None
        return full

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except ValueError:
            return {}

    # ---- routes ---------------------------------------------------------
    def do_GET(self):
        if self.path.startswith(API):
            return self._api("GET")
        return super().do_GET()

    def do_PUT(self):
        if self.path.startswith(API):
            return self._api("PUT")
        self._send(405, {"message": "Not allowed"})

    def do_DELETE(self):
        if self.path.startswith(API):
            return self._api("DELETE")
        self._send(405, {"message": "Not allowed"})

    def _api(self, method):
        if not self._is_local():
            return self._send(403, {"message": "Local requests only"})
        path = unquote(urlparse(self.path).path)[len(API):].strip("/")
        if path == "ping":
            return self._send(200, {"ok": True})
        parts = path.split("/")
        if len(parts) >= 3 and parts[0] == "repos":
            if len(parts) == 3 and method == "GET":
                return self._send(200, {
                    "full_name": "%s/%s" % (parts[1], parts[2]),
                    "default_branch": "main",
                    "private": False,
                    "permissions": {"pull": True, "push": True},
                })
            if len(parts) > 4 and parts[3] == "contents":
                return self._contents(method, "/".join(parts[4:]))
        self._send(404, {"message": "Not Found"})

    def _contents(self, method, rel):
        full = self._resolve(rel)
        if full is None:
            return self._send(403, {"message": "Outside the site folder"})
        exists = os.path.isfile(full)

        if method == "GET":
            if not exists:
                return self._send(404, {"message": "Not Found"})
            with open(full, "rb") as f:
                data = f.read()
            return self._send(200, {
                "type": "file",
                "name": os.path.basename(rel),
                "path": rel,
                "sha": blob_sha(data),
                "size": len(data),
                "encoding": "base64",
                "content": base64.encodebytes(data).decode("ascii"),
            })

        if not (rel.startswith(WRITABLE_DIRS) or rel in WRITABLE_FILES):
            return self._send(403, {"message": "The Studio can't change this file"})
        body = self._body()
        current = None
        if exists:
            with open(full, "rb") as f:
                current = blob_sha(f.read())

        if method == "PUT":
            if exists and not body.get("sha"):
                return self._send(422, {"message": "Invalid request.\n\n\"sha\" wasn't supplied."})
            if exists and body.get("sha") != current:
                return self._send(409, {"message": "%s does not match %s" % (rel, body.get("sha"))})
            try:
                data = base64.b64decode(body.get("content") or "")
            except ValueError:
                return self._send(422, {"message": "content is not valid Base64"})
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "wb") as f:
                f.write(data)
            return self._send(200 if exists else 201, {
                "content": {"path": rel, "sha": blob_sha(data), "size": len(data)},
                "commit": {"sha": "local", "message": body.get("message", "")},
            })

        if method == "DELETE":
            if not exists:
                return self._send(404, {"message": "Not Found"})
            if body.get("sha") != current:
                return self._send(409, {"message": "%s does not match %s" % (rel, body.get("sha"))})
            os.remove(full)
            folder = os.path.dirname(full)
            while folder.startswith(os.path.join(ROOT, "art") + os.sep) and not os.listdir(folder):
                os.rmdir(folder)
                folder = os.path.dirname(folder)
            return self._send(200, {"content": None, "commit": {"sha": "local", "message": body.get("message", "")}})

        self._send(405, {"message": "Not allowed"})


def main():
    parser = argparse.ArgumentParser(description="Preview the site on this computer.")
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print("Site:   http://localhost:%d/" % args.port)
    print("Studio: http://localhost:%d/admin/" % args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
