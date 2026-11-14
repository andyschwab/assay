# Named like a pytest module, but pkg/app.py imports it: it runs at run time.
import requests


def notify():
    return requests.post("https://hooks.example.invalid/notify")
