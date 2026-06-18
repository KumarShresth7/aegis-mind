import json
import os
from datetime import datetime, timezone

import redis

COUNTERS_KEY = "telemetry:counters"
EVENTS_KEY = "telemetry:events"
MAX_EVENTS = 100


class TelemetryStore:
    def __init__(self):
        addr = os.getenv("REDIS_ADDR", "localhost:6379")
        try:
            self.client = redis.Redis.from_url(f"redis://{addr}", decode_responses=True)
            self.client.ping()
            self.enabled = True
        except redis.RedisError:
            self.client = None
            self.enabled = False

    def record_pii_block(self, entity_type: str, redacted_preview: str) -> None:
        if not self.enabled:
            return

        pipe = self.client.pipeline()
        pipe.hincrby(COUNTERS_KEY, "pii_blocked", 1)

        event = {
            "type": "pii_blocked",
            "message": redacted_preview,
            "detail": f"Entity: {entity_type}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "metadata": {"entity": entity_type},
        }
        pipe.lpush(EVENTS_KEY, json.dumps(event))
        pipe.ltrim(EVENTS_KEY, 0, MAX_EVENTS - 1)
        pipe.execute()


telemetry = TelemetryStore()
