const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const sources = require('./sources.json');

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'RegPulse/1.0 (+https://github.com/) Mozilla/5.0',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
  }
});

const OUTPUT_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'publications.json');

function ensureOutputFolderExists() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function cleanText(value) {
  if (!value) return '';

  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanXmlText(xmlText) {
  return String(xmlText)
    // Remove invisible control characters that XML parsers dislike
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

    // Fix unescaped ampersands.
    // Example problem: "Capital & liquidity"
    // XML requires: "Capital &amp; liquidity"
    .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[a-fA-F0-9]+;)/g, '&amp;');
}

async function fetchRawText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'RegPulse/1.0 (+https://github.com/) Mozilla/5.0',
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function parseFeedWithFallback(source) {
  try {
    const feed = await parser.parseURL(source.url);

    return {
      feed,
      usedFallback: false,
      warning: null
    };
  } catch (initialError) {
    const rawXml = await fetchRawText(source.url);
    const cleanedXml = cleanXmlText(rawXml);
    const feed = await parser.parseString(cleanedXml);

    return {
      feed,
      usedFallback: true,
      warning: `Normal XML parsing failed, but fallback parsing worked. Original error: ${initialError.message}`
    };
  }
}

function normaliseDate(item) {
  const rawDate = item.isoDate || item.pubDate || item.date || item.updated || null;

  if (!rawDate) {
    return null;
  }

  const date = new Date(rawDate);

  if (Number.isNaN(date.getTime())) {
    return rawDate;
  }

  return date.toISOString();
}

function extractPdfLinks(item) {
  const pdfLinks = new Set();

  if (item.link && item.link.toLowerCase().includes('.pdf')) {
    pdfLinks.add(item.link);
  }

  if (Array.isArray(item.enclosure) && item.enclosure.length > 0) {
    item.enclosure.forEach((enclosure) => {
      if (enclosure.url && enclosure.url.toLowerCase().includes('.pdf')) {
        pdfLinks.add(enclosure.url);
      }
    });
  }

  if (item.enclosure && item.enclosure.url && item.enclosure.url.toLowerCase().includes('.pdf')) {
    pdfLinks.add(item.enclosure.url);
  }

  const contentFields = [
    item.content,
    item.contentSnippet,
    item.summary,
    item.description
  ];

  contentFields.forEach((field) => {
    if (!field) return;

    const matches = String(field).match(/https?:\/\/[^\s"'<>]+\.pdf/gi);

    if (matches) {
      matches.forEach((match) => pdfLinks.add(match));
    }
  });

  return Array.from(pdfLinks);
}

function createPublicationId(source, item) {
  const base = item.guid || item.id || item.link || item.title || `${source.id}-${Date.now()}`;

  return Buffer.from(`${source.id}-${base}`)
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 32);
}

function normaliseItem(source, item, feedMeta) {
  const title = cleanText(item.title);
  const summary = cleanText(
    item.contentSnippet ||
    item.summary ||
    item.description ||
    item.content ||
    ''
  );

  return {
    id: createPublicationId(source, item),
    sourceId: source.id,
    sourceName: source.name,
    institution: source.institution,
    region: source.region,
    jurisdiction: source.jurisdiction,
    title,
    summary,
    link: item.link || null,
    publishedAt: normaliseDate(item),
    pdfLinks: extractPdfLinks(item),
    officialSourcePage: source.officialSourcePage,
    feedUsedFallback: feedMeta.usedFallback,
    collectedAt: new Date().toISOString()
  };
}

async function fetchSource(source) {
  console.log(`\nFetching ${source.name}...`);

  try {
    const parsed = await parseFeedWithFallback(source);
    const feed = parsed.feed;
    const items = Array.isArray(feed.items) ? feed.items : [];

    const publications = items.map((item) => normaliseItem(source, item, parsed));

    if (parsed.usedFallback) {
      console.log(`  ⚠️  Success with fallback: ${publications.length} items found`);
      console.log(`  Warning: ${parsed.warning}`);
    } else {
      console.log(`  ✅ Success: ${publications.length} items found`);
    }

    if (publications.length > 0) {
      console.log(`  Latest: ${publications[0].title}`);
    }

    return {
      source,
      status: 'OK',
      usedFallback: parsed.usedFallback,
      warning: parsed.warning,
      publications
    };
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);

    return {
      source,
      status: 'FAILED',
      error: error.message,
      publications: []
    };
  }
}

function deduplicatePublications(publications) {
  const seen = new Set();
  const unique = [];

  for (const publication of publications) {
    const key = publication.link || `${publication.institution}-${publication.title}-${publication.publishedAt}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(publication);
    }
  }

  return unique;
}

function sortPublications(publications) {
  return publications.sort((a, b) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;

    return dateB - dateA;
  });
}

function savePublications(publications, sourceResults) {
  ensureOutputFolderExists();

  const output = {
    generatedAt: new Date().toISOString(),
    totalPublications: publications.length,
    totalSources: sources.length,
    successfulSources: sourceResults.filter((result) => result.status === 'OK').length,
    warningSources: sourceResults
      .filter((result) => result.status === 'OK' && result.usedFallback)
      .map((result) => ({
        sourceId: result.source.id,
        name: result.source.name,
        warning: result.warning
      })),
    failedSources: sourceResults
      .filter((result) => result.status === 'FAILED')
      .map((result) => ({
        sourceId: result.source.id,
        name: result.source.name,
        error: result.error
      })),
    publications
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  console.log(`\nSaved ${publications.length} publications to ${OUTPUT_FILE}`);
}

async function main() {
  console.log('RegPulse — daily regulatory publication scraper');
  console.log('------------------------------------------------');

  const sourceResults = [];

  for (const source of sources) {
    const result = await fetchSource(source);
    sourceResults.push(result);
  }

  const allPublications = sourceResults.flatMap((result) => result.publications);
  const uniquePublications = deduplicatePublications(allPublications);
  const sortedPublications = sortPublications(uniquePublications);

  savePublications(sortedPublications, sourceResults);

  console.log('\nRun summary');
  console.log('-----------');
  console.log(`Sources checked       : ${sources.length}`);
  console.log(`Successful sources    : ${sourceResults.filter((result) => result.status === 'OK').length}`);
  console.log(`Warning sources       : ${sourceResults.filter((result) => result.status === 'OK' && result.usedFallback).length}`);
  console.log(`Failed sources        : ${sourceResults.filter((result) => result.status === 'FAILED').length}`);
  console.log(`Unique publications   : ${sortedPublications.length}`);
  console.log('\nAll done!');
}

main();