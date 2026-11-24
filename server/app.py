"""
Lightweight HTTP API Server for 《学Cube》 V1.0 Teaching Solver.
Uses Python standard library only (zero external pip dependencies).
Endpoints:
  GET  /api/health
  POST /api/solve   {"facelets": "<54 chars>", "method": "lbl"}
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from lbl_solver import solve_lbl


class SolverHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self._send_json(204, {})

    def do_GET(self) -> None:
        if self.path == "/api/health":
            self._send_json(200, {"status": "ok", "methods": ["lbl"]})
            return
        self._send_json(404, {"error": "Not Found"})

    def do_POST(self) -> None:
        if self.path != "/api/solve":
            self._send_json(404, {"error": "Not Found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length).decode("utf-8")
            data = json.loads(raw) if raw else {}
        except Exception as exc:
            self._send_json(400, {"solvable": False, "error": f"无效的 JSON 请求: {exc}"})
            return

        facelets = str(data.get("facelets", "")).strip()
        method = str(data.get("method", "lbl")).strip().lower()
        if method != "lbl":
            self._send_json(
                400,
                {
                    "solvable": False,
                    "error": f"V1.0 暂仅支持层先法 (lbl)，不支持 {method}",
                },
            )
            return

        result = solve_lbl(facelets)
        self._send_json(200 if result.get("solvable") else 422, result)

    def log_message(self, format: str, *args) -> None:
        # Keep server output concise
        print(f"[学Cube Solver] {self.address_string()} - {format % args}")


def main() -> None:
    host = os.environ.get("SOLVER_HOST", "127.0.0.1")
    port = int(os.environ.get("SOLVER_PORT", "8000"))
    server = ThreadingHTTPServer((host, port), SolverHandler)
    print(f"《学Cube》Python 教学求解服务已启动: http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
