"""Shared rate limiter, keyed by client IP.

A light security measure (PRD NFR "Security") against brute-forcing login
and spamming session-join/response-submission endpoints. Deliberately
conservative and simple — no Redis/shared backend needed at this project's
scale; slowapi's default in-memory store is fine for a single backend
process (see ws_manager.py for the same reasoning about the WebSocket
connection manager).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
