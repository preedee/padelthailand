import os, http.server, socketserver
os.chdir(os.path.dirname(os.path.abspath(__file__)))
handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(("", 8081), handler) as httpd:
    print("Serving on port 8081")
    httpd.serve_forever()
