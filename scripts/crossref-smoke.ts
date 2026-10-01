import { mapCrossrefWork } from "../server/modules/connectors/crossref.mapper.ts";
import { MVP_SOURCES } from "../server/modules/sources/mvp.sources.ts";

const issn = "0749-596X"; // Journal of Memory and Language (whitelist)
const url = `https://api.crossref.org/journals/${issn}/works?rows=3&sort=published&order=desc&select=DOI,title,author,abstract,issued,URL,type&mailto=litradar@example.com`;
const started = new Date();
const res = await fetch(url, { headers: { "User-Agent": "LitRadar/1.0 (litradar@example.com)" } });
const body: any = await res.json();
const finished = new Date();
const items = (body.message.items as any[]).map(mapCrossrefWork).filter(Boolean);
console.log("MVP whitelist size:", MVP_SOURCES.length);
console.log("source ISSN:", issn, "| HTTP", res.status, "| total available:", body.message["total-results"]);
console.log("fetched:", items.length, "| started:", started.toISOString(), "| finished:", finished.toISOString());
for (const it of items) console.log("-", it.doi, "|", it.publishedDate, "|", it.title.slice(0,70));
