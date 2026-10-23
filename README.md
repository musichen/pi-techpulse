# pi-techpulse

A native Pi extension that gives coding agents a configurable technology trend digest. It fetches Hacker News, GitHub Trending, RSS feeds, and Reddit RSS, caches stories locally, ranks repeat appearances and source scores, and returns TOON, JSON, or Markdown.

## Install

From this repository:

```bash
pi install git:github.com/musichen/pi-techpulse
```

Or load it for a quick test:

```bash
pi -e https://github.com/musichen/pi-techpulse
```

## Use

After installation, start Pi in a project and use `/reload`. The session hook refreshes the cache and adds a compact trend snapshot to agent context.

```text
/techpulse
/techpulse --refresh
```

Agents can call the `techpulse_digest` tool with `format` (`toon`, `json`, or `markdown`), `days`, `limit`, `query`, and `refresh`.

TechPulse only collects, deduplicates, caches, ranks, and summarizes. Hermes or another agent interprets the stories into blog, YouTube, Instagram, TikTok, and other editorial ideas.

## Configure sources

Copy or create `config/sources.json` in the project where Pi runs. Each source has a name, type (`rss`, `hacker_news`, or `github_trending`), URL, and optional limit. Set `enabled` to `false` to pause a source. If no project config exists, the bundled defaults are used.

The cache is stored in the project at `.pi/techpulse-cache.json` so it is local, inspectable, and easy to back up. Add it to `.gitignore` if it should remain private.

## Example config

The bundled defaults in `config/sources.json` are:

```json
[
  {"name":"Hacker News","type":"hacker_news","url":"https://hacker-news.firebaseio.com/v0/topstories.json","limit":30},
  {"name":"GitHub Trending","type":"github_trending","url":"https://github.com/trending","limit":20},
  {"name":"TechCrunch","type":"rss","url":"https://techcrunch.com/feed/","limit":20}
]
```

Copy that shape into `config/sources.json` in your project and set `enabled` to `false` on any source you want to pause.

## Distribution

This is a dependency-light Pi package: its runtime uses Node built-ins and Pi's extension APIs. No Python, external service, API key, or database server is required.

## License

Apache License 2.0. See [LICENSE](LICENSE).
