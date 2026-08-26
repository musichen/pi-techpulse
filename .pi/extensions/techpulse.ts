import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

 type Source = { name: string; type: "rss" | "hacker_news" | "github_trending"; url: string; limit?: number; enabled?: boolean };
 type Story = { id: string; title: string; url: string; summary: string; source: string; firstSeen: string; lastSeen: string; appearances: number; score: number };

const bundledConfig = new URL("../../config/sources.json", import.meta.url);
const userAgent = "pi-techpulse/0.1 (+https://web-boxes.com)";

const compact = (value: string | undefined) => (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const isoNow = () => new Date().toISOString();

async function sources(cwd: string): Promise<Source[]> {
  try { return JSON.parse(await readFile(join(cwd, "config/sources.json"), "utf8")); }
  catch { return JSON.parse(await readFile(bundledConfig, "utf8")); }
}

async function cachePath(cwd: string) { return join(cwd, ".pi", "techpulse-cache.json"); }
async function loadCache(cwd: string): Promise<Story[]> {
  try { return JSON.parse(await readFile(await cachePath(cwd), "utf8")); } catch { return []; }
}
async function saveCache(cwd: string, rows: Story[]) {
  const path = await cachePath(cwd);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(rows, null, 2) + "\n");
}

async function get(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { headers: { "user-agent": userAgent, accept: "application/rss+xml, application/xml, text/html, application/json" }, signal });
  if (!response.ok) throw new Error(`source returned HTTP ${response.status}`);
  return response.text();
}

function rss(xml: string, source: Source): Omit<Story, "id" | "firstSeen" | "lastSeen" | "appearances" | "score">[] {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, source.limit ?? 30).flatMap((match) => {
    const item = match[0];
    const text = (tag: string) => compact(item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]);
    const title = text("title"); const url = text("link");
    return title && url ? [{ title, url, summary: text("description"), source: source.name }] : [];
  });
}

async function readSource(source: Source, signal?: AbortSignal) {
  if (source.type === "rss") return rss(await get(source.url, signal), source);
  if (source.type === "hacker_news") {
    const ids = JSON.parse(await get(source.url, signal)) as number[];
    const stories = [];
    for (const id of ids.slice(0, source.limit ?? 30)) {
      const item = JSON.parse(await get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, signal));
      if (item.title && item.url) stories.push({ title: compact(item.title), url: item.url, summary: "", source: source.name, score: item.score ?? 0 });
    }
    return stories;
  }
  const html = await get(source.url, signal);
  return [...html.matchAll(/<article class="Box-row"[\s\S]*?<\/article>/g)].slice(0, source.limit ?? 20).flatMap((match) => {
    const path = match[0].match(/href="\/([^"?#]+\/[^"?#]+)"/)?.[1];
    const description = compact(match[0].match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]);
    return path ? [{ title: `GitHub trending: ${path}`, url: `https://github.com/${path}`, summary: description, source: source.name }] : [];
  });
}

async function refresh(cwd: string, signal?: AbortSignal) {
  const old = await loadCache(cwd); const byId = new Map(old.map((story) => [story.id, story]));
  const results: { source: string; fetched?: number; error?: string }[] = [];
  for (const source of await sources(cwd)) {
    if (source.enabled === false) continue;
    try {
      const fetched = await readSource(source, signal); results.push({ source: source.name, fetched: fetched.length });
      for (const item of fetched) {
        const id = createHash("sha256").update(item.url).digest("hex");
        const existing = byId.get(id);
        byId.set(id, { id, ...item, firstSeen: existing?.firstSeen ?? isoNow(), lastSeen: isoNow(), appearances: (existing?.appearances ?? 0) + 1, score: item.score ?? existing?.score ?? 0 });
      }
    } catch (error) { results.push({ source: source.name, error: error instanceof Error ? error.message : String(error) }); }
  }
  const rows = [...byId.values()]; await saveCache(cwd, rows); return { rows, results };
}

function ranked(rows: Story[], days: number, limit: number, query?: string) {
  const cutoff = Date.now() - days * 86400000;
  return rows.filter((row) => Date.parse(row.lastSeen) >= cutoff && (!query || `${row.title} ${row.summary} ${row.source}`.toLowerCase().includes(query.toLowerCase())))
    .map((row) => ({ ...row, rank: Math.round((row.appearances * 2 + row.score / 100 + Math.max(0, 3 - (Date.now() - Date.parse(row.lastSeen)) / 86400000)) * 100) / 100 }))
    .sort((a, b) => b.rank - a.rank).slice(0, limit);
}
function toon(rows: any[]) {
  const fields = ["rank", "title", "source", "url", "appearances"];
  return [`stories[${rows.length}]{${fields.join(",")}:`, ...rows.map((row) => "  " + fields.map((field) => JSON.stringify(row[field] ?? "")).join(","))].join("\n");
}
function markdown(rows: any[], days: number) {
  return [`# TechPulse digest (${new Date().toISOString().slice(0, 10)})`, ``, `Top technology stories from the last ${days} days.`, ``, ...rows.flatMap((row, i) => [`## ${i + 1}. ${row.title}`, `**${row.source}** | rank ${row.rank} | seen ${row.appearances} time(s)`, ``, row.summary.slice(0, 280) || "No source summary available.", ``, `[Read story](${row.url})`, ``])].join("\n");
}

export default function (pi: ExtensionAPI) {
  async function digest(ctx: { cwd: string }, params: { format?: "toon" | "json" | "markdown"; days?: number; limit?: number; query?: string; refresh?: boolean }) {
    if (params.refresh) await refresh(ctx.cwd);
    const rows = ranked(await loadCache(ctx.cwd), params.days ?? 3, params.limit ?? 10, params.query);
    return params.format === "json" ? JSON.stringify(rows, null, 2) : params.format === "markdown" ? markdown(rows, params.days ?? 3) : toon(rows);
  }
  pi.registerTool({
    name: "techpulse_digest", label: "TechPulse Digest",
    description: "Fetch cached technology trends for agent interpretation. TechPulse collects, ranks, and summarizes; the agent interprets.",
    promptSnippet: "Fetch cached technology trends for research and editorial planning",
    parameters: Type.Object({ format: Type.Optional(StringEnum(["toon", "json", "markdown"] as const)), days: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })), query: Type.Optional(Type.String()), refresh: Type.Optional(Type.Boolean()) }),
    async execute(_id, params, signal, _update, ctx) { return { content: [{ type: "text", text: await digest(ctx, params) }], details: {} }; },
  });
  pi.registerCommand("techpulse", { description: "Show TechPulse digest (optional: --refresh)", handler: async (args, ctx) => {
    const output = await digest(ctx, { format: "markdown", limit: 8, refresh: args.trim() === "--refresh" });
    pi.sendMessage({ customType: "techpulse", content: output, display: true }, { triggerTurn: false });
  }});
  pi.on("session_start", async (_event, ctx) => {
    const result = await refresh(ctx.cwd);
    const top = ranked(result.rows, 3, 5);
    if (top.length) pi.sendMessage({ customType: "techpulse-session-context", content: `Fresh TechPulse context for this session:\n${toon(top)}`, display: false }, { triggerTurn: false });
  });
}
