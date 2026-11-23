"""Serve the local port with shared memory enabled for the Amiga emulator."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
import argparse

class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        super().end_headers()

class PreviewServer(ThreadingHTTPServer):
    request_queue_size = 128


parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=8000)
parser.add_argument("--bind", default="0.0.0.0")
args = parser.parse_args()
PreviewServer((args.bind, args.port), partial(Handler, directory="build/preview")).serve_forever()
