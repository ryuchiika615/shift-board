import sys
import os

# Add parent directory to path
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, parent_dir)
os.chdir(parent_dir)

from app import app, init_db

init_db()

# Vercel WSGI handler
def handler(environ, start_response):
    return app(environ, start_response)
