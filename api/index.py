import sys
import os
import traceback

parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, parent_dir)
os.chdir(parent_dir)

from app import app, init_db


class AppWithInit:
    def __init__(self, flask_app, init_fn):
        self.flask_app = flask_app
        self.init_fn = init_fn
        self._initialized = False

    def __call__(self, environ, start_response):
        if not self._initialized:
            try:
                with self.flask_app.app_context():
                    self.init_fn()
                self._initialized = True
            except Exception as e:
                traceback.print_exc()
        return self.flask_app(environ, start_response)


application = AppWithInit(app, init_db)
