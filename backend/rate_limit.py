"""Shared slowapi limiter. Imported by main.py and auth.py so the same
instance is used everywhere — slowapi requires a single Limiter per app."""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
