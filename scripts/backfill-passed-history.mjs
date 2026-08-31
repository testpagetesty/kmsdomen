/**
 * Restore per-day pass history from git (one snapshot per commit-day).
 * node scripts/backfill-passed-history.mjs
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const dir = "passed-domains";
const TZ = 3 * 3600 * 1000;

function dayKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const s = new Date(d.getTime() + TZ);
  return (
    s.getUTCFullYear() +
    "-" +
    String(s.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(s.getUTCDate()).padStart(2, "0")
  );
}

function parseMap(text) {
  if (!text || !text.trim()) return {};
  let o;
  try {
    o = JSON.parse(text);
  } catch {
    return {};
  }
  if (!o || typeof o !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    const domain = String(k).trim().toLowerCase();
    if (!domain) continue;
    if (typeof v === "string" && v.trim()) {
      out[domain] = { passedAt: v, source: "new" };
      continue;
    }
    if (v && typeof v === "object" && typeof v.passedAt === "string") {
      out[domain] = {
        passedAt: v.passedAt,
        source: v.source === "teaser" ? "teaser" : "new",
        passes: Array.isArray(v.passes) ? v.passes : undefined,
      };
    }
  }
  return out;
}

function addEvent(hist, domain, passedAt, source) {
  const day = dayKey(passedAt);
  if (!day) return;
  if (!hist.has(domain)) hist.set(domain, new Map());
  const byDay = hist.get(domain);
  const prev = byDay.get(day);
  const src = source === "teaser" ? "teaser" : "new";
  if (!prev || passedAt < prev.passedAt) byDay.set(day, { passedAt, source: src });
}

function ingestMap(hist, map) {
  for (const [domain, e] of Object.entries(map)) {
    addEvent(hist, domain, e.passedAt, e.source);
    if (Array.isArray(e.passes)) {
      for (const p of e.passes) {
        if (p && typeof p.passedAt === "string") {
          addEvent(hist, domain, p.passedAt, p.source || e.source);
        }
      }
    }
  }
}

const files = fs.readdirSync(dir).filter((f) => /^[a-z]{2}\.json$/i.test(f));
let rewritten = 0;

for (const file of files) {
  const rel = path.join(dir, file).replace(/\\/g, "/");
  let lines = [];
  try {
    const log = execSync(`git log --pretty=format:%H%x09%cI -- ${rel}`, {
      encoding: "utf8",
    });
    lines = log.split(/\r?\n/).filter(Boolean);
  } catch {
    continue;
  }

  // one commit per calendar day (UTC+3), prefer latest commit that day
  const byCommitDay = new Map();
  for (const line of lines) {
    const [sha, iso] = line.split("\t");
    if (!sha || !iso) continue;
    const day = dayKey(iso);
    if (!day) continue;
    if (!byCommitDay.has(day)) byCommitDay.set(day, sha);
  }
  const shas = [...byCommitDay.values()];

  const hist = new Map();
  for (const sha of shas) {
    let text = "";
    try {
      text = execSync(`git show ${sha}:${rel}`, {
        encoding: "utf8",
        maxBuffer: 12 * 1024 * 1024,
      });
    } catch {
      continue;
    }
    ingestMap(hist, parseMap(text));
  }

  const curPath = path.join(dir, file);
  const curText = fs.readFileSync(curPath, "utf8");
  ingestMap(hist, parseMap(curText));

  const out = {};
  for (const [domain, byDay] of hist.entries()) {
    const passes = [...byDay.values()].sort((a, b) =>
      a.passedAt < b.passedAt ? -1 : a.passedAt > b.passedAt ? 1 : 0,
    );
    if (!passes.length) continue;
    const latest = passes[passes.length - 1];
    out[domain] = {
      passedAt: latest.passedAt,
      source: latest.source,
      passes,
    };
  }

  const next = JSON.stringify(out, null, 2) + "\n";
  if (next !== curText) {
    fs.writeFileSync(curPath, next);
    rewritten += 1;
  }
  process.stdout.write(".");
}

console.log(`\nfiles=${files.length} rewritten=${rewritten}`);
