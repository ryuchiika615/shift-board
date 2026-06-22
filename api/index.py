import sys
import os
import traceback

parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, parent_dir)
os.chdir(parent_dir)

try:
    from app import app, init_db
except Exception as e:
    traceback.print_exc()
    raise

_app_initialized = False

def handler(environ, start_response):
    global _app_initialized
    if not _app_initialized:
        try:
            with app.app_context():
                init_db()
            _app_initialized = True
        except Exception as e:
            traceback.print_exc()
    return app(environ, start_response)
