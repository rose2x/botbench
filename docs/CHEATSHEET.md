# Discord bot cheat sheet

Generated from `data/reference-data.json`. Paths are relative to `https://discord.com/api/v10`.
Check https://discord.com/developers/docs for the latest details, since Discord changes its API.

## REST endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/users/@me` | The bot's own user. A good login test. |
| GET | `/users/{user.id}` | Any user by id. |
| GET | `/users/@me/guilds` | Servers the bot is in. |
| POST | `/users/@me/channels` | Open a DM channel with a user (body: recipient_id). |
| GET | `/applications/@me` | Info about your own application. |
| GET | `/gateway/bot` | Gateway URL, recommended shard count, session limits. |
| GET | `/channels/{channel.id}` | Channel details. |
| DELETE | `/channels/{channel.id}` | Delete a channel (or close a DM). |
| POST | `/channels/{channel.id}/messages` | Send a message: content, embeds, components, files. |
| GET | `/channels/{channel.id}/messages` | Read recent messages. Needs Read Message History. |
| GET | `/channels/{channel.id}/messages/{message.id}` | One message. |
| PATCH | `/channels/{channel.id}/messages/{message.id}` | Edit a message the bot sent. |
| DELETE | `/channels/{channel.id}/messages/{message.id}` | Delete a message. |
| POST | `/channels/{channel.id}/messages/bulk-delete` | Delete 2 to 100 recent messages at once. |
| PUT | `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}/@me` | Add a reaction. |
| POST | `/channels/{channel.id}/messages/{message.id}/threads` | Start a thread from a message. |
| POST | `/channels/{channel.id}/threads` | Start a thread with no message. |
| GET | `/channels/{channel.id}/invites` | List invites for a channel. |
| POST | `/channels/{channel.id}/invites` | Create an invite. |
| POST | `/channels/{channel.id}/webhooks` | Create a webhook in a channel. |
| GET | `/invites/{code}` | Look up an invite. |
| GET | `/guilds/{guild.id}` | Server info. |
| GET | `/guilds/{guild.id}/channels` | List channels. |
| POST | `/guilds/{guild.id}/channels` | Create a channel. |
| GET | `/guilds/{guild.id}/roles` | List roles. |
| POST | `/guilds/{guild.id}/roles` | Create a role. |
| GET | `/guilds/{guild.id}/members` | List members. Needs the Server Members intent. |
| GET | `/guilds/{guild.id}/members/{user.id}` | One member, with roles. |
| PATCH | `/guilds/{guild.id}/members/{user.id}` | Edit a member: nickname, roles, timeout (communication_disabled_until). |
| PUT | `/guilds/{guild.id}/members/{user.id}/roles/{role.id}` | Give a role. |
| DELETE | `/guilds/{guild.id}/members/{user.id}/roles/{role.id}` | Remove a role. |
| DELETE | `/guilds/{guild.id}/members/{user.id}` | Kick a member. |
| GET | `/guilds/{guild.id}/bans` | List bans. |
| PUT | `/guilds/{guild.id}/bans/{user.id}` | Ban a user. |
| DELETE | `/guilds/{guild.id}/bans/{user.id}` | Unban a user. |
| GET | `/guilds/{guild.id}/audit-logs` | Read the audit log. Needs View Audit Log. |
| GET | `/guilds/{guild.id}/emojis` | List custom emoji. |
| GET | `/guilds/{guild.id}/scheduled-events` | List scheduled events. |
| POST | `/guilds/{guild.id}/scheduled-events` | Create a scheduled event. |
| GET | `/guilds/{guild.id}/auto-moderation/rules` | List AutoMod rules. |
| POST | `/guilds/{guild.id}/auto-moderation/rules` | Create an AutoMod rule. |
| GET | `/guilds/{guild.id}/webhooks` | List webhooks in a server. |
| GET | `/applications/{application.id}/commands` | List global slash commands. |
| PUT | `/applications/{application.id}/commands` | Replace all global slash commands at once. |
| DELETE | `/applications/{application.id}/commands/{command.id}` | Delete one global command. |
| PUT | `/applications/{application.id}/guilds/{guild.id}/commands` | Replace all commands for one server. Instant. |
| POST | `/interactions/{interaction.id}/{interaction.token}/callback` | First reply to an interaction. Within 3 seconds. |
| PATCH | `/webhooks/{application.id}/{interaction.token}/messages/@original` | Edit the first reply (after a defer). |
| DELETE | `/webhooks/{application.id}/{interaction.token}/messages/@original` | Delete the first reply. |
| POST | `/webhooks/{application.id}/{interaction.token}` | Send a followup. Valid for 15 minutes. |
| POST | `/webhooks/{webhook.id}/{webhook.token}` | Post through a webhook. No bot token needed. |
| POST | `/oauth2/token` | Swap an OAuth2 code for an access token (form-encoded). |

## Gateway opcodes

Connect to `wss://gateway.discord.gg/?v=10&encoding=json`.

| Op | Name | Direction | Meaning |
|---|---|---|---|
| 0 | Dispatch | Receive | An event happened. Its name is in field t. |
| 1 | Heartbeat | Both | Keep the connection alive. Send your last sequence number. |
| 2 | Identify | Send | Log in with token, intents and properties. |
| 3 | Presence Update | Send | Change the bot's status. |
| 4 | Voice State Update | Send | Join, move or leave a voice channel. |
| 6 | Resume | Send | Continue a dropped session without missing events. |
| 7 | Reconnect | Receive | Discord wants you to reconnect and resume. |
| 8 | Request Guild Members | Send | Ask for the members of a server. |
| 9 | Invalid Session | Receive | Session is invalid. Resume or identify again. |
| 10 | Hello | Receive | Sent first. Has the heartbeat interval. |
| 11 | Heartbeat ACK | Receive | Discord got your heartbeat. |

## Common gateway events

| Event | Fires when | Needs |
|---|---|---|
| `READY` | Login worked. Has the bot user and session id. | nothing |
| `GUILD_CREATE` | The bot joined a server, or a server became available at startup. | Guilds |
| `INTERACTION_CREATE` | Slash command, button, menu, autocomplete or form submit. | nothing |
| `MESSAGE_CREATE` | A message was sent. Content is empty for most messages without the privileged intent. | Guild Messages or Direct Messages |
| `MESSAGE_UPDATE` | A message was edited. | Guild Messages or Direct Messages |
| `MESSAGE_DELETE` | A message was deleted. | Guild Messages or Direct Messages |
| `MESSAGE_REACTION_ADD` | Someone added a reaction. | Guild Message Reactions |
| `GUILD_MEMBER_ADD` | Someone joined. | Guild Members (privileged) |
| `GUILD_MEMBER_REMOVE` | Someone left or was removed. | Guild Members (privileged) |
| `VOICE_STATE_UPDATE` | Someone joined, left or muted in voice. | Guild Voice States |

## Intents

Privileged intents must be enabled in the Developer Portal.

| Intent | Value | Gives you | Privileged |
|---|---|---|---|
| `GUILDS` | `1 << 0` | Servers, channels, roles |  |
| `GUILD_MEMBERS` | `1 << 1` | Member join, leave, update | yes |
| `GUILD_MODERATION` | `1 << 2` | Bans and audit-log entries |  |
| `GUILD_EXPRESSIONS` | `1 << 3` | Emoji and sticker changes |  |
| `GUILD_INTEGRATIONS` | `1 << 4` | Integration changes |  |
| `GUILD_WEBHOOKS` | `1 << 5` | Webhook changes |  |
| `GUILD_INVITES` | `1 << 6` | Invite create and delete |  |
| `GUILD_VOICE_STATES` | `1 << 7` | Voice channel activity |  |
| `GUILD_PRESENCES` | `1 << 8` | Online status and activities | yes |
| `GUILD_MESSAGES` | `1 << 9` | Messages in servers |  |
| `GUILD_MESSAGE_REACTIONS` | `1 << 10` | Reactions in servers |  |
| `GUILD_MESSAGE_TYPING` | `1 << 11` | Typing in servers |  |
| `DIRECT_MESSAGES` | `1 << 12` | Messages in DMs |  |
| `DIRECT_MESSAGE_REACTIONS` | `1 << 13` | Reactions in DMs |  |
| `DIRECT_MESSAGE_TYPING` | `1 << 14` | Typing in DMs |  |
| `MESSAGE_CONTENT` | `1 << 15` | Text of messages that don't mention or DM the bot | yes |
| `GUILD_SCHEDULED_EVENTS` | `1 << 16` | Scheduled events |  |
| `AUTO_MODERATION_CONFIGURATION` | `1 << 20` | AutoMod rule changes |  |
| `AUTO_MODERATION_EXECUTION` | `1 << 21` | AutoMod actions taken |  |

## Permissions

Values above 2^31 need 64-bit integers (BigInt in JavaScript).

| Permission | Value |
|---|---|
| `CREATE_INSTANT_INVITE` | `1 << 0` |
| `KICK_MEMBERS` | `1 << 1` |
| `BAN_MEMBERS` | `1 << 2` |
| `ADMINISTRATOR` | `1 << 3` |
| `MANAGE_CHANNELS` | `1 << 4` |
| `MANAGE_GUILD` | `1 << 5` |
| `ADD_REACTIONS` | `1 << 6` |
| `VIEW_AUDIT_LOG` | `1 << 7` |
| `PRIORITY_SPEAKER` | `1 << 8` |
| `STREAM` | `1 << 9` |
| `VIEW_CHANNEL` | `1 << 10` |
| `SEND_MESSAGES` | `1 << 11` |
| `SEND_TTS_MESSAGES` | `1 << 12` |
| `MANAGE_MESSAGES` | `1 << 13` |
| `EMBED_LINKS` | `1 << 14` |
| `ATTACH_FILES` | `1 << 15` |
| `READ_MESSAGE_HISTORY` | `1 << 16` |
| `MENTION_EVERYONE` | `1 << 17` |
| `USE_EXTERNAL_EMOJIS` | `1 << 18` |
| `CONNECT` | `1 << 20` |
| `SPEAK` | `1 << 21` |
| `MUTE_MEMBERS` | `1 << 22` |
| `DEAFEN_MEMBERS` | `1 << 23` |
| `MOVE_MEMBERS` | `1 << 24` |
| `USE_VAD` | `1 << 25` |
| `CHANGE_NICKNAME` | `1 << 26` |
| `MANAGE_NICKNAMES` | `1 << 27` |
| `MANAGE_ROLES` | `1 << 28` |
| `MANAGE_WEBHOOKS` | `1 << 29` |
| `MANAGE_GUILD_EXPRESSIONS` | `1 << 30` |
| `USE_APPLICATION_COMMANDS` | `1 << 31` |
| `MANAGE_EVENTS` | `1 << 33` |
| `MANAGE_THREADS` | `1 << 34` |
| `CREATE_PUBLIC_THREADS` | `1 << 35` |
| `CREATE_PRIVATE_THREADS` | `1 << 36` |
| `SEND_MESSAGES_IN_THREADS` | `1 << 38` |
| `MODERATE_MEMBERS (timeouts)` | `1 << 40` |
| `SEND_POLLS` | `1 << 49` |

## Interaction and reply types

| Kind | Value | Name |
|---|---|---|
| Interaction type | `1` | PING |
| Interaction type | `2` | APPLICATION_COMMAND |
| Interaction type | `3` | MESSAGE_COMPONENT |
| Interaction type | `4` | APPLICATION_COMMAND_AUTOCOMPLETE |
| Interaction type | `5` | MODAL_SUBMIT |
| Reply type | `1` | PONG |
| Reply type | `4` | CHANNEL_MESSAGE_WITH_SOURCE (send a message) |
| Reply type | `5` | DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE ("thinking…") |
| Reply type | `6` | DEFERRED_UPDATE_MESSAGE |
| Reply type | `7` | UPDATE_MESSAGE (edit the message a button is on) |
| Reply type | `8` | APPLICATION_COMMAND_AUTOCOMPLETE_RESULT |
| Reply type | `9` | MODAL (show a form) |

## OAuth2 scopes

| Scope | Lets you |
|---|---|
| `identify` | Read the user's basic info (name, avatar, id). |
| `email` | Read the user's email address. |
| `guilds` | List the servers the user is in. |
| `guilds.join` | Add the user to a server. Needs a bot. |
| `guilds.members.read` | Read the user's member info in a server. |
| `connections` | See the user's linked accounts. |
| `bot` | Add a bot to a server. |
| `applications.commands` | Allow your slash commands in the server. |
| `webhook.incoming` | Create a webhook in a channel the user picks. |
| `role_connections.write` | Update the user's linked-role data for your app. |

## Limits

| Thing | Limit |
|---|---|
| Message content | 2,000 characters |
| Embeds per message | 10, and 6,000 characters across all of them |
| Embed title / description | 256 / 4,096 characters |
| Embed fields | 25 per embed |
| First reply to an interaction | 3 seconds. Then defer. Followups work for 15 minutes. |
| Slash command name / description | 32 / 100 characters |
| Options per command | 25 |
| Buttons per row / rows per message | 5 / 5 |
| Global request rate | 50 per second per bot |
| Bulk delete | 2 to 100 messages, none older than 14 days |

## Gateway close codes

| Code | Name | What to do |
|---|---|---|
| `4000` | Unknown error | Reconnect and try to resume. |
| `4001` | Unknown opcode | You sent an opcode Discord doesn't know. |
| `4002` | Decode error | You sent a payload Discord can't parse. |
| `4003` | Not authenticated | You sent something before Identify. |
| `4004` | Authentication failed | Wrong token. Reset it and copy it again. |
| `4005` | Already authenticated | You sent Identify twice. |
| `4007` | Invalid sequence | Bad sequence on Resume. Start a new session. |
| `4008` | Rate limited | You sent too fast. Slow down. |
| `4009` | Session timed out | Reconnect and identify again. |
| `4010` | Invalid shard | Your shard setup is wrong. |
| `4011` | Sharding required | Too many servers for one connection. Use shards. |
| `4012` | Invalid API version | Use a supported gateway version. |
| `4013` | Invalid intents | The intents number isn't valid. |
| `4014` | Disallowed intents | You asked for a privileged intent that isn't enabled in the Developer Portal. |

## Error codes

| Code | Meaning | Usual fix |
|---|---|---|
| `HTTP 400` | Bad request | Your JSON is malformed or a field is wrong. Read the message. |
| `HTTP 401` | Unauthorized | Bad or missing token. |
| `HTTP 403` | Forbidden | The bot lacks permission for that action. |
| `HTTP 404` | Not found | Wrong id or path. |
| `HTTP 429` | Too many requests | Wait retry_after seconds, then continue. |
| `HTTP 5xx` | Discord problem | Retry after a short delay. |
| `10003` | Unknown Channel | Wrong id, or the bot can't see the channel. |
| `10004` | Unknown Guild | Wrong id, or the bot isn't in that server. |
| `10008` | Unknown Message | The message was deleted, or the id is wrong. |
| `10062` | Unknown interaction | You took more than 3 seconds. Defer first. |
| `40060` | Interaction already acknowledged | You replied twice. Use a followup for the second message. |
| `50001` | Missing Access | The bot can't see that channel or server. |
| `50007` | Cannot send messages to this user | The user has DMs closed or blocked the bot. |
| `50013` | Missing Permissions | The bot lacks a permission, or its role is below the target's role. |
| `50035` | Invalid Form Body | A field in your payload is wrong, such as content over 2,000 characters. |

## Libraries

| Language | Library | Install | Notes |
|---|---|---|---|
| Python | [discord.py](https://discordpy.readthedocs.io) | `pip install discord.py` | The most used Python library. Slash commands through app_commands, cogs, views for buttons. |
| Python | [py-cord](https://docs.pycord.dev) | `pip install py-cord` | A fork with its own slash command and UI style. |
| Python | [disnake](https://docs.disnake.dev) | `pip install disnake` | A fork close to discord.py. |
| Python | [nextcord](https://docs.nextcord.dev) | `pip install nextcord` | Another discord.py fork. |
| Python | [interactions.py](https://interactions-py.github.io/interactions.py/) | `pip install discord-py-interactions` | Built around slash commands and components from the start. |
| Python | [hikari](https://docs.hikari-py.dev) | `pip install hikari` | Modern, typed and REST-first. Use lightbulb or crescent for commands. |
| JavaScript / TypeScript | [discord.js](https://discordjs.guide) | `npm i discord.js` | The most used library overall. Builders for commands, embeds and components. The best guide and community. |
| JavaScript / TypeScript | [Sapphire](https://www.sapphirejs.dev) | `npm i @sapphire/framework` | A framework on top of discord.js with command, listener and precondition structure. |
| JavaScript / TypeScript | [Eris](https://abal.moe/Eris) | `npm i eris` | Light and fast. Lower level than discord.js. |
| JavaScript / TypeScript | [Oceanic.js](https://oceanic.ws) | `npm i oceanic.js` | An Eris-style API with modern gateway support. |
| JavaScript / TypeScript | [Discordeno](https://discordeno.js.org) | `npm i @discordeno/bot` | Highly customizable. Works with Deno, Bun and Node. |
| Java / Kotlin | [JDA](https://jda.wiki) | `Maven or Gradle: net.dv8tion:JDA` | Widely used Java library with a big ecosystem. |
| Java / Kotlin | [Javacord](https://javacord.org) | `Maven or Gradle: org.javacord:javacord` | A simple Java API. |
| Java / Kotlin | [Kord](https://kord.dev) | `Gradle: dev.kord:kord-core` | Kotlin with coroutines. |
| C# | [Discord.Net](https://docs.discordnet.dev) | `dotnet add package Discord.Net` | The main .NET library. |
| C# | [DSharpPlus](https://dsharpplus.github.io/DSharpPlus) | `dotnet add package DSharpPlus` | Another .NET library, with a command extension. |
| Go | [discordgo](https://github.com/bwmarrin/discordgo) | `go get github.com/bwmarrin/discordgo` | The standard Go choice. |
| Go | [disgo](https://github.com/disgoorg/disgo) | `go get github.com/disgoorg/disgo` | Modern Go library. Supports HTTP interactions. |
| Rust | [serenity](https://github.com/serenity-rs/serenity) | `cargo add serenity` | Rust library. The poise framework adds slash commands. |
| Rust | [twilight](https://twilight.rs) | `cargo add twilight-http twilight-gateway` | Modular crates. Use only the parts you need. |
| C++ | [D++ (DPP)](https://dpp.dev) | `See the docs for your platform` | C++ library with low memory use. |
| Ruby | [discordrb](https://github.com/shardlab/discordrb) | `gem install discordrb` | Ruby library with a command framework. |
| PHP | [DiscordPHP](https://github.com/discord-php/DiscordPHP) | `composer require team-reflex/discord-php` | PHP library on ReactPHP. |
| Elixir | [Nostrum](https://github.com/Kraigie/nostrum) | `Add {:nostrum, ...} to mix.exs` | Elixir library on the BEAM. |
| Dart | [nyxx](https://github.com/nyxx-discord/nyxx) | `dart pub add nyxx` | Dart library. |
| Lua | [Discordia](https://github.com/SinisterRectus/Discordia) | `lit install SinisterRectus/discordia` | Lua library on Luvit. |
