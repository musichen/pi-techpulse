# Contributing to pi-techpulse

## Setup

Install pi, then load the extension from your checkout:

```bash
pi -e https://github.com/musichen/pi-techpulse
# or install your fork with pi install git:github.com/<you>/pi-techpulse (see README)
```

The package is dependency-light: runtime uses Node built-ins and Pi extension APIs, with no Python, external service, API key, or database server.

## Test manually

Start pi in a project, run `/reload`, then:

```text
/techpulse
/techpulse --refresh
```

Also try the `techpulse_digest` tool with `format` set to `toon`, `json`, and `markdown`. The cache lands in `.pi/techpulse-cache.json` in the project, so you can inspect ranking and deduplication there.

## Sources

To change defaults, edit `config/sources.json` (name, `rss` / `hacker_news` / `github_trending` type, URL, optional limit, `enabled`). Keep the bundled defaults working without a project config.

## Pull requests

Create a branch from `main` and describe which sources and output formats you tested in the PR.
