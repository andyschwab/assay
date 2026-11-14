# A pytest module, by its runner's naming.
import requests


def test_posts():
    requests.post("https://thing.example.invalid/x")
