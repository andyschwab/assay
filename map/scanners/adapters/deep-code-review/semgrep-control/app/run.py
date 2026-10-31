# Planted: the positive control's Python case. A request argument reaches a shell.
import os
from flask import request

def listing():
    os.system('ls ' + request.args.get('dir'))
