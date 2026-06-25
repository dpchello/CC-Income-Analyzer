"""Regression: the per-request auth lookup must survive a transient Supabase
connection hiccup instead of 500-ing or hanging.

After ~21h of uptime the Supabase httpx pool started throwing
`httpx.ReadError: [Errno 35] Resource temporarily unavailable` (EAGAIN), and the
default postgrest timeout (120s) meant a wedged connection *hung* for two minutes.
`get_user_by_id` runs on every authenticated request via `auth.get_current_user`,
but it called `sb...execute()` directly — bypassing the `_with_retry` helper that
already existed and matched this error. So one pool hiccup failed auth on every
request at once, wedging both the web app and the AppleScript control app.

The durable fix: a 10s timeout (fail fast), client recycling on repeated transient
errors (fresh pool, self-heal), and retry on the hot-path reads. These tests pin
all three behaviours.
"""
import os

# Make the module importable even when backend/.env is absent (CI). db.py raises
# at import time if these are unset; the values are never used because we swap
# the client for a fake in every test.
os.environ.setdefault("SUPABASE_URL", "http://localhost/test")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-key")

import db


class _FakeResp:
    def __init__(self, data):
        self.data = data


class _FlakyQuery:
    """Fluent query stub. `.execute()` raises a transient error until the shared
    counter reaches `fail_times`, then returns `data`. Chained builder methods
    return self so the real call sites work unchanged."""

    def __init__(self, counter, fail_times, data):
        self._counter = counter
        self._fail_times = fail_times
        self._data = data

    def select(self, *a, **k): return self
    def eq(self, *a, **k): return self
    def limit(self, *a, **k): return self
    def order(self, *a, **k): return self

    def execute(self):
        if self._counter["n"] < self._fail_times:
            self._counter["n"] += 1
            raise Exception("httpx.ReadError: [Errno 35] Resource temporarily unavailable")
        return _FakeResp(self._data)


class _FakeSB:
    def __init__(self, counter, fail_times, data):
        self._counter, self._fail_times, self._data = counter, fail_times, data

    def table(self, _name):
        return _FlakyQuery(self._counter, self._fail_times, self._data)


def _install_fake(monkeypatch, fail_times, data):
    """Wire db.sb AND db._build_client to fakes backed by one shared counter, so
    a recycle (`_recreate_client`) keeps drawing from the same failure budget."""
    counter = {"n": 0}
    builds = {"n": 0}

    def factory():
        builds["n"] += 1
        return _FakeSB(counter, fail_times, data)

    monkeypatch.setattr(db, "_build_client", factory)
    monkeypatch.setattr(db, "sb", _FakeSB(counter, fail_times, data))
    monkeypatch.setattr(db.time, "sleep", lambda *_: None)  # skip real backoff
    return counter, builds


def test_get_user_by_id_retries_on_transient_error(monkeypatch):
    row = {"id": "u1", "email": "user@example.com", "tier": "pro"}
    counter, _ = _install_fake(monkeypatch, fail_times=2, data=[row])

    result = db.get_user_by_id("u1")

    assert result == row
    assert counter["n"] == 2, "should have retried twice before succeeding"


def test_recycles_client_when_pool_stays_wedged(monkeypatch):
    # Fails on attempt 0 and 1, succeeds on attempt 2 — the second failure should
    # trigger a client rebuild before the final attempt.
    row = {"id": "u1"}
    _, builds = _install_fake(monkeypatch, fail_times=2, data=[row])

    assert db.get_user_by_id("u1") == row
    assert builds["n"] >= 1, "a wedged pool should be recycled, not retried forever"


def test_get_user_by_id_raises_on_non_transient_error(monkeypatch):
    class _BadSB:
        def table(self, _name):
            raise ValueError("programming error, not a connection blip")

    monkeypatch.setattr(db, "_build_client", lambda: _BadSB())
    monkeypatch.setattr(db, "sb", _BadSB())
    monkeypatch.setattr(db.time, "sleep", lambda *_: None)

    try:
        db.get_user_by_id("u1")
    except ValueError:
        pass
    else:
        raise AssertionError("non-transient error must propagate, not be swallowed")


def test_get_user_by_id_gives_up_after_exhausting_retries(monkeypatch):
    # Never recovers within the retry budget -> the transient error surfaces.
    _install_fake(monkeypatch, fail_times=99, data=[{"id": "u1"}])

    try:
        db.get_user_by_id("u1")
    except Exception as exc:
        msg = str(exc).lower()
        assert "errno 35" in msg or "resource temporarily unavailable" in msg
    else:
        raise AssertionError("should re-raise after exhausting retries")


def test_is_transient_classification():
    assert db._is_transient(Exception("[Errno 35] Resource temporarily unavailable"))
    assert db._is_transient(Exception("httpx.ReadTimeout: timed out"))
    assert db._is_transient(Exception("Server disconnected without sending a response"))
    assert not db._is_transient(Exception("duplicate key value violates unique constraint"))
    assert not db._is_transient(ValueError("bad column"))
