"""Language-model provider adapter. OFF by default.

  AI_TEXT_PROVIDER = disabled (default) | fake | anthropic
  AI_TEXT_API_KEY  = the provider key (backend environment only)
  AI_TEXT_MODEL    = the model name

`fake` is scriptable and is the ONLY provider the tests use; it never makes a network call.
`anthropic` uses the Messages API over HTTPS with the standard library (no new dependency). To add
another provider (for example Gemini) write one more class with the same `complete()` and add it to
`PROVIDERS`: nothing else changes.

The key is read from the environment at call time. It is never stored in the database, logged,
returned by an API, put in an error message, or sent to the browser. Errors carry only a short
code, never the provider's response body.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field

from core.env import env

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
MAX_OUTPUT_TOKENS = 600


class ProviderError(Exception):
    """A provider call failed. `code` is a short fixed word; never the response body."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class ProviderDisabled(ProviderError):
    def __init__(self):
        super().__init__("disabled")


@dataclass
class Reply:
    text: str = ""
    tool_calls: list[dict] = field(default_factory=list)  # [{"name": str, "arguments": dict}]
    latency_ms: int = 0


class DisabledProvider:
    name = "disabled"
    model = ""

    def complete(self, *, system, messages, tools, timeout) -> Reply:
        raise ProviderDisabled


class FakeProvider:
    """Scriptable test double. `script` is a list of replies (dicts, Reply objects, callables
    taking the call and returning one, or an Exception to raise). Every call is recorded in
    `calls` so tests can assert exactly what would have been sent. Never touches the network."""

    name = "fake"
    model = "fake-model"

    def __init__(self):
        self.script: list = []
        self.calls: list[dict] = []

    def reset(self):
        self.script, self.calls = [], []

    def complete(self, *, system, messages, tools, timeout) -> Reply:
        call = {"system": system, "messages": messages, "tools": tools, "timeout": timeout}
        self.calls.append(json.loads(json.dumps(call, default=str)))  # a frozen copy
        if not self.script:
            return Reply()
        item = self.script.pop(0)
        if callable(item):
            item = item(call)
        if isinstance(item, Exception):
            raise item
        if isinstance(item, Reply):
            return item
        if not isinstance(item, dict):
            raise ProviderError("bad_reply")
        return Reply(text=item.get("text", ""), tool_calls=item.get("tool_calls", []))


FAKE = FakeProvider()


class AnthropicProvider:
    """Anthropic Messages API (tool use)."""

    name = "anthropic"

    def __init__(self, api_key: str, model: str):
        self._key = api_key
        self.model = model

    def complete(self, *, system, messages, tools, timeout) -> Reply:
        body = {
            "model": self.model,
            "max_tokens": MAX_OUTPUT_TOKENS,
            "system": system,
            "messages": messages,
            "tools": [
                {"name": t["name"], "description": t["description"], "input_schema": t["schema"]}
                for t in tools
            ],
        }
        req = urllib.request.Request(  # noqa: S310 - fixed https URL
            ANTHROPIC_URL,
            data=json.dumps(body).encode("utf-8"),
            method="POST",
            headers={
                "content-type": "application/json",
                "x-api-key": self._key,
                "anthropic-version": ANTHROPIC_VERSION,
            },
        )
        started = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:  # noqa: S310
                payload = json.loads(response.read(1_000_000).decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise ProviderError(f"http_{exc.code}") from None
        except TimeoutError:
            raise ProviderError("timeout") from None
        except (urllib.error.URLError, OSError):
            raise ProviderError("network") from None
        except ValueError:
            raise ProviderError("bad_json") from None
        if not isinstance(payload, dict) or not isinstance(payload.get("content"), list):
            raise ProviderError("bad_reply")
        text_parts, calls = [], []
        for block in payload["content"]:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text":
                text_parts.append(str(block.get("text", "")))
            elif block.get("type") == "tool_use":
                calls.append({"name": block.get("name"), "arguments": block.get("input")})
        return Reply(
            text=" ".join(text_parts).strip(),
            tool_calls=calls,
            latency_ms=int((time.monotonic() - started) * 1000),
        )


PROVIDERS = ("disabled", "fake", "anthropic")


def get_provider():
    """The provider chosen by the environment. Anything unknown, or a missing key, is `disabled`."""
    name = (env("AI_TEXT_PROVIDER", "disabled") or "disabled").strip().lower()
    if name == "fake":
        return FAKE
    if name == "anthropic":
        key = env("AI_TEXT_API_KEY", "").strip()
        model = env("AI_TEXT_MODEL", "").strip()
        if key and model:
            return AnthropicProvider(key, model)
    return DisabledProvider()
