import json
import os
import re

import redis

SESSION_PREFIX = "playground:session:"
SESSION_TTL = int(os.getenv("SESSION_TTL_SECONDS", str(7 * 24 * 3600)))
DEFAULT_MODEL = "llama-3.3-70b-versatile"
SESSION_ID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)


class SessionStore:
    def __init__(self):
        addr = os.getenv("REDIS_ADDR", "localhost:6379")
        try:
            self.client = redis.Redis.from_url(f"redis://{addr}", decode_responses=True)
            self.client.ping()
            self.enabled = True
        except redis.RedisError:
            self.client = None
            self.enabled = False

    def _key(self, session_id: str) -> str:
        if not SESSION_ID_PATTERN.match(session_id):
            raise ValueError("Invalid session id")
        return f"{SESSION_PREFIX}{session_id}"

    def get(self, session_id: str) -> dict:
        if not self.enabled:
            return {"messages": [], "model": DEFAULT_MODEL}

        raw = self.client.get(self._key(session_id))
        if not raw:
            return {"messages": [], "model": DEFAULT_MODEL}

        try:
            data = json.loads(raw)
            return {
                "messages": data.get("messages", []),
                "model": data.get("model", DEFAULT_MODEL),
                "updatedAt": data.get("updatedAt"),
            }
        except json.JSONDecodeError:
            return {"messages": [], "model": DEFAULT_MODEL}

    def save(self, session_id: str, messages: list, model: str) -> None:
        if not self.enabled:
            return

        from datetime import datetime, timezone

        payload = {
            "messages": messages,
            "model": model,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        self.client.setex(self._key(session_id), SESSION_TTL, json.dumps(payload))

    def delete(self, session_id: str) -> None:
        if not self.enabled:
            return
        self.client.delete(self._key(session_id))


session_store = SessionStore()
