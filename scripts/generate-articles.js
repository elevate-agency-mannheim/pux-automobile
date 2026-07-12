/**
 * Bulk-generates Ratgeber articles as .mdx files from src/data/keyword-map.json
 * using the Claude API. Run with: node scripts/generate-articles.js
 *
 * - Skips entries that already have a corresponding .mdx file on disk.
 * - Skips "Lokale Paket-Seite" entries (no route/template exists yet for
 *   /ratgeber/standorte/[stadt]/[paket] - see generation-log.json "skipped").
 * - Runs up to CONCURRENCY articles in parallel, retries transient failures,
 *   and logs per-article status to generation-log.json so re-running the
 *   script resumes cleanly instead of re-generating everything.
 */

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

process.loadEnvFile(".env");

const CONCURRENCY = 10;
const MODEL = "claude-sonnet-5";
const MAX_RETRIES = 2;

const ROOT = process.cwd();
const KEYWORD_MAP_PATH = path.join(ROOT, "src/data/keyword-map.json");
const CONTENT_ROOT = path.join(ROOT, "src/content/ratgeber");
const LOG_PATH = path.join(ROOT, "generation-log.json");

const CATEGORY_SLUG = {
  Autoaufbereitung: "autoaufbereitung",
  Fahrzeugankauf: "fahrzeugankauf",
  Fahrzeugverkauf: "fahrzeugverkauf",
  Ratgeber: "wissen",
  "Lokale Keywords": "standorte",
};

const CATEGORY_LABEL = {
  autoaufbereitung: "Autoaufbereitung",
  fahrzeugankauf: "Fahrzeugankauf",
  fahrzeugverkauf: "Fahrzeugverkauf",
  wissen: "Ratgeber",
  standorte: "Standorte",
};

const IMPORT_BLOCK = `import InfoBox from "../../../components/ratgeber/InfoBox.astro";
import StepByStep from "../../../components/ratgeber/StepByStep.astro";
import ComparisonTable from "../../../components/ratgeber/ComparisonTable.astro";
import ProConTable from "../../../components/ratgeber/ProConTable.astro";
import Checklist from "../../../components/ratgeber/Checklist.astro";
import Calculator from "../../../components/ratgeber/Calculator.tsx";
import ContactCTA from "../../../components/ratgeber/ContactCTA.astro";
import LocalCitiesWidget from "../../../components/ratgeber/LocalCitiesWidget.astro";`;

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function slugFromEntry(entry) {
  // geplante_url can be nested (e.g. /ratgeber/autoaufbereitung/kratzer-entfernen/kosten for
  // pillar sub-articles). The approved routing is single-level (/ratgeber/[kategorie]/[artikel]),
  // so flatten anything past the category segment into one hyphenated slug instead of colliding
  // every sub-article under the same pillar onto one file.
  const parts = entry.geplante_url.split("/").filter(Boolean); // ["ratgeber", "<kategorie>", ...rest]
  const rest = parts.slice(2);
  return rest.length ? slugify(rest.join("-")) : slugify(entry.primärkeyword);
}

function loadLog() {
  if (fs.existsSync(LOG_PATH)) {
    return JSON.parse(fs.readFileSync(LOG_PATH, "utf8"));
  }
  return { started: new Date().toISOString(), articles: {} };
}

function saveLog(log) {
  log.updated = new Date().toISOString();
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

function buildQueue() {
  const raw = JSON.parse(fs.readFileSync(KEYWORD_MAP_PATH, "utf8"));
  const queue = [];
  const skipped = [];

  raw.forEach((entry) => {
    if (entry.typ === "Lokale Paket-Seite") {
      skipped.push({ entry, reason: "no route template for /standorte/[stadt]/[paket] yet" });
      return;
    }
    const category = CATEGORY_SLUG[entry.hauptkategorie];
    if (!category) {
      skipped.push({ entry, reason: `unknown hauptkategorie: ${entry.hauptkategorie}` });
      return;
    }
    const slug = slugFromEntry(entry);
    const filePath = path.join(CONTENT_ROOT, category, `${slug}.mdx`);
    queue.push({ entry, category, slug, filePath });
  });

  return { queue, skipped };
}

function findRelated(item, allItems) {
  return allItems
    .filter((o) => o.category === item.category && o.slug !== item.slug)
    .slice(0, 3)
    .map((o) => `${o.category}/${o.slug}`);
}

function buildPrompt(item, related) {
  const { entry, category, slug } = item;
  const label = CATEGORY_LABEL[category];
  const cities = entry.geo_relevanz?.length ? entry.geo_relevanz.join(", ") : "Mannheim (Einzugsgebiet)";
  const schemaTypes = category === "autoaufbereitung" ? '["Article", "HowTo", "FAQPage"]' : '["Article", "FAQPage"]';

  return `Du schreibst einen deutschsprachigen Ratgeber-Artikel für PUX Automobile, einen mobilen Autoaufbereitungs- und Fahrzeughandel-Service im Raum Mannheim (Inhaber: Luca Härle, Hirschhorner Straße 32, 68259 Mannheim, Einsatzgebiet ca. 35 km um Mannheim).

ZIELSEITE: ${entry.geplante_url}
KATEGORIE: ${label}
PRIMÄRKEYWORD: ${entry.primärkeyword}
NEBENKEYWORDS (natürlich einbauen, nicht erzwingen): ${(entry.nebenkeywords || []).slice(0, 12).join(", ") || "-"}
SUCHINTENTION: ${entry.suchintention}
GEO-BEZUG: ${cities}

Gib AUSSCHLIESSLICH eine vollständige .mdx-Datei zurück, exakt in diesem Format (kein Markdown-Codeblock drumherum, keine Erklärung davor/danach):

---
seoTitle: "<max 60 Zeichen, keine Jahreszahl>"
metaDescription: "<max 155 Zeichen>"
slug: "${slug}"
primaryKeyword: "${entry.primärkeyword}"
secondaryKeywords:
  - "<Nebenkeyword 1>"
  - "<Nebenkeyword 2>"
targetCities: [${(entry.geo_relevanz || []).map((c) => `"${c}"`).join(", ") || '"Mannheim"'}]
schemaType: ${schemaTypes}
relatedArticles:
${related.map((r) => `  - "${r}"`).join("\n") || '  - ""'}
title: "<H1, kann leicht von seoTitle abweichen>"
category: "${category}"
summary:
  - "<Bullet 1 von 5-7>"
  - "<...>"
publishDate: ${new Date().toISOString().slice(0, 10)}
faq:
  - frage: "<Frage 1 von 10-15 echten Suchmaschinenfragen>"
    antwort: "<prägnante Antwort, 2-4 Sätze>"
---

${IMPORT_BLOCK}

<Zusammenfassung als Fließtext-Einleitung, erste 100 Wörter beantworten die Kernfrage direkt>

## <H2 Überschrift>

<Fließtext...>

<Nutze wo inhaltlich sinnvoll, aber nicht wahllos: <InfoBox type="info|warning|tip|success" title="...">...</InfoBox>, <StepByStep steps={[{titel,beschreibung}]} />, <ComparisonTable headers={[...]} rows={[[...]]} />, <ProConTable pros={[...]} cons={[...]} />, <Checklist items={[...]} />, <ContactCTA title="..." description="..." /> (genau 1x, bei sehr langen Artikeln 2x mit id="kontakt-2" beim zweiten), <LocalCitiesWidget currentCity="Mannheim" />. Für Autoaufbereitung-Artikel mit Kostenbezug: <Calculator client:load />.>

## Fazit

<Abschließender Absatz>

WICHTIGE REGELN:
- Mindestens 1500 Wörter Fließtext (ideal 2000-3000), echte Substanz, keine Füllsätze.
- Mindestens 5 interne Links im Fließtext als [Ankertext](/ratgeber/kategorie/slug) zu thematisch passenden Seiten (nutze plausible Pfade zu verwandten Themen der Kategorie ${label}).
- Keine erfundenen Preise oder Statistiken. Wenn Preise genannt werden: nur "ca." oder "ab" plus die realen PUX-Pakete (Innenraum Komfort 130€, Außen Glanz 90€, Komplettpaket Premium 220€, Extra-Service Polieren+Keramikversiegelung 350€).
- Lokaler Bezug zu ${cities} natürlich einbauen, nicht nur Stadtname einstreuen.
- Sprache: Deutsch, professionell, zugänglich, Sie-Anrede.
- Schreibe NIEMALS eine Jahreszahl als festen Text im Artikeltext (nur im Frontmatter publishDate als Datum, das ist ok).
- Component-Props müssen valides JSX sein (doppelte Anführungszeichen für Strings, Arrays korrekt geklammert).`;
}

function validateMdx(content) {
  const errors = [];
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    errors.push("Kein gültiges Frontmatter gefunden.");
    return errors;
  }
  const fm = fmMatch[1];
  const seoTitleMatch = fm.match(/seoTitle:\s*"(.*)"/);
  if (!seoTitleMatch) errors.push("seoTitle fehlt.");
  else if (seoTitleMatch[1].length > 60) errors.push(`seoTitle zu lang (${seoTitleMatch[1].length}/60).`);

  const metaDescMatch = fm.match(/metaDescription:\s*"(.*)"/);
  if (!metaDescMatch) errors.push("metaDescription fehlt.");
  else if (metaDescMatch[1].length > 155) errors.push(`metaDescription zu lang (${metaDescMatch[1].length}/155).`);

  if (!/category:\s*"/.test(fm)) errors.push("category fehlt.");
  if (!/summary:/.test(fm)) errors.push("summary fehlt.");
  if (!/faq:/.test(fm)) errors.push("faq fehlt.");

  const faqCount = [...content.matchAll(/- frage:/g)].length;
  if (faqCount < 8) errors.push(`Nur ${faqCount} FAQ-Einträge (mindestens 8 erwartet).`);

  const body = content.slice(fmMatch[0].length);
  const prose = body.replace(/^import .+$/gm, " ").replace(/<[^>]+>/g, " ").replace(/[{}]/g, " ");
  const wordCount = prose.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 1300) errors.push(`Nur ~${wordCount} Wörter (mindestens 1500 erwartet).`);

  if (!body.includes(IMPORT_BLOCK.split("\n")[0])) errors.push("Component-Imports fehlen.");

  return errors;
}

async function generateOne(client, item, related, log) {
  const key = `${item.category}/${item.slug}`;
  let lastErrors = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      let prompt = buildPrompt(item, related);
      if (attempt > 0) {
        prompt += `\n\nDein letzter Versuch hatte diese Probleme, bitte beheben:\n${lastErrors.join("\n")}`;
      }

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      const cleaned = text.replace(/^```(mdx|markdown)?\n?/, "").replace(/```$/, "").trim();

      const errors = validateMdx(cleaned);
      if (errors.length > 0) {
        lastErrors = errors;
        if (attempt < MAX_RETRIES) continue;
        log.articles[key] = { status: "failed", reason: errors.join(" | "), attempts: attempt + 1, timestamp: new Date().toISOString() };
        return false;
      }

      fs.mkdirSync(path.dirname(item.filePath), { recursive: true });
      fs.writeFileSync(item.filePath, cleaned);
      log.articles[key] = { status: "success", attempts: attempt + 1, timestamp: new Date().toISOString() };
      return true;
    } catch (err) {
      lastErrors = [String(err?.message ?? err)];
      const status = err?.status;
      if (status === 429 || status === 529) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (attempt < MAX_RETRIES) continue;
      log.articles[key] = { status: "failed", reason: lastErrors.join(" | "), attempts: attempt + 1, timestamp: new Date().toISOString() };
      return false;
    }
  }
  return false;
}

async function runPool(items, worker, concurrency) {
  let index = 0;
  let done = 0;
  const results = [];

  async function next() {
    while (index < items.length) {
      const i = index++;
      const ok = await worker(items[i], i);
      results[i] = ok;
      done++;
      console.log(`[${done}/${items.length}] ${ok ? "OK" : "FAIL"} - ${items[i].category}/${items[i].slug}`);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, next));
  return results;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY fehlt in .env");
    process.exit(1);
  }

  const { queue, skipped } = buildQueue();
  const log = loadLog();

  const alreadyDone = queue.filter((item) => fs.existsSync(item.filePath));
  let todo = queue.filter((item) => !fs.existsSync(item.filePath));

  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  if (limitArg) {
    const limit = parseInt(limitArg.split("=")[1], 10);
    todo = todo.slice(0, limit);
    console.log(`--limit=${limit} aktiv, es werden nur ${todo.length} Artikel generiert.`);
  }

  console.log(`Gesamt geplante Seiten: ${queue.length + skipped.length}`);
  console.log(`Übersprungen (kein Routing-Template): ${skipped.length}`);
  console.log(`Bereits vorhanden, wird übersprungen: ${alreadyDone.length}`);
  console.log(`Zu generieren: ${todo.length}`);

  skipped.forEach((s) => {
    const key = `${s.entry.hauptkategorie}::${s.entry.primärkeyword}`;
    log.articles[key] = { status: "skipped", reason: s.reason, timestamp: new Date().toISOString() };
  });
  saveLog(log);

  if (todo.length === 0) {
    console.log("Nichts zu tun.");
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  await runPool(
    todo,
    async (item) => {
      const related = findRelated(item, queue);
      const ok = await generateOne(client, item, related, log);
      saveLog(log);
      return ok;
    },
    CONCURRENCY
  );

  const succeeded = Object.values(log.articles).filter((a) => a.status === "success").length;
  const failed = Object.values(log.articles).filter((a) => a.status === "failed").length;
  console.log(`\nFertig. Erfolgreich: ${succeeded}, Fehlgeschlagen: ${failed}, Übersprungen: ${skipped.length}`);
  console.log(`Details in generation-log.json`);
}

main();
