"""Slash commands over HTTP. Needs: pip install flask pynacl
    DISCORD_PUBLIC_KEY=... flask --app examples.http_server run --port 8080
Then point the Interactions Endpoint URL (Developer Portal) at your public https address + /interactions.
Register the commands once with examples/register_http_commands.py.
"""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from toolkit.http_interactions import create_app, message

app = create_app(os.environ.get("DISCORD_PUBLIC_KEY", ""), {
    "ping": lambda data: message("Pong from HTTP!"),
    "roll": lambda data: message(f"You rolled {random.randint(1, 6)}"),
})
