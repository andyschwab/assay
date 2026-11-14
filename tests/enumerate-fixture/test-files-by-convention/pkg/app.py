# The runtime package: it imports its hooks module, whose name starts with test_.
import requests
from .test_hooks import notify


def ready():
    notify()
    return requests.post("https://app.example.invalid/ready")
