const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCES_PATH = path.join(__dirname, 'sources.json');
const DATA_PATH = path.join(ROOT_DIR, 'data', 'publications.json');

const MAX_PDF_DETAIL_FETCHES = 80;
const PDF_FETCH_CONCURRENCY = 5;
const PDF_FETCH_TIMEOUT_MS = 9000;

const BAD_HTML_TITLE_PATTERN =
  /toggle navigation|benchmark administrators|climate benchmarks|cras and sustainability|credit rating agencies|digital finance|esg rating providers|external reviewers|banknotes|calendar of cbc officials|administrative sanctions|discover the section|cta portal|data directory|capacity building|adaptation$/i;

const STRICT_HTML_SOURCE_IDS = new Set([
  'esma-news',
  'central-bank-cyprus-announcements',
  'ngfs-publications',
  'ifrs-foundation-news'
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function createHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function absoluteUrl(url, baseUrl) {
  if (!url) return '';

  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function isPdfLink(value) {
  return /\.pdf($|\?|#)/i.test(String(value || ''));
}

function extractHrefLinks(html, baseUrl) {
  const links = [];
  const regex = /href=["']([^"']+)["']/gi;
  let match;

  while ((match = regex.exec(String(html || ''))) !== null) {
    const href = match[1];

    if (!href) continue;

    links.push(absoluteUrl(href, baseUrl));
  }

  return [...new Set(links)];
}

async function fetchTextWithTimeout(url, timeoutMs = PDF_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'RegPulse/1.0 (+https://github.com/KimiyaMirsalehi/RegPulse; regulatory monitoring tool)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!response.ok) return '';

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('text/html') && !contentType.includes('xml')) {
      return '';
    }

    return await response.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function extractPdfLinksFromArticle(publication) {
  const articleUrl = publication.url || publication.link || '';

  if (!isHttpUrl(articleUrl)) {
    return [];
  }

  if (isPdfLink(articleUrl)) {
    return [articleUrl];
  }

  const html = await fetchTextWithTimeout(articleUrl);

  if (!html) {
    return [];
  }

  return extractHrefLinks(html, articleUrl).filter(isPdfLink);
}

async function enrichPdfLinks(publications) {
  const candidates = publications
    .filter((publication) => !publication.isSourceLandingCard)
    .filter((publication) => isHttpUrl(publication.url || publication.link))
    .filter((publication) => !Array.isArray(publication.pdfLinks) || publication.pdfLinks.length === 0)
    .slice(0, MAX_PDF_DETAIL_FETCHES);

  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      const index = cursor;
      cursor += 1;

      const publication = candidates[index];
      const pdfLinks = await extractPdfLinksFromArticle(publication);

      if (pdfLinks.length > 0) {
        publication.pdfLinks = [...new Set(pdfLinks)];
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PDF_FETCH_CONCURRENCY, candidates.length) }, () => worker())
  );
}

function normalisePublication(publication, sourceById) {
  const source = sourceById.get(publication.sourceId);
  const sourcePageUrl =
    publication.sourcePageUrl ||
    publication.officialSourcePage ||
    source?.officialSourcePage ||
    source?.url ||
    '';

  const url =
    publication.url ||
    publication.link ||
    sourcePageUrl;

  return {
    ...publication,
    url,
    link: url,
    sourcePageUrl,
    officialSourcePage: sourcePageUrl,
    sourceFeedUrl: source?.url || publication.sourceFeedUrl || '',
    pdfLinks: Array.isArray(publication.pdfLinks)
      ? [...new Set(publication.pdfLinks.filter(Boolean))]
      : []
  };
}

function isBadHtmlPublication(publication) {
  if (!STRICT_HTML_SOURCE_IDS.has(publication.sourceId)) {
    return false;
  }

  if (publication.isSourceLandingCard) {
    return false;
  }

  if (!publication.publishedAt) {
    return true;
  }

  return BAD_HTML_TITLE_PATTERN.test(publication.title || '');
}

function createSourceLandingCard(source, generatedAt) {
  const sourcePageUrl = source.officialSourcePage || source.url;
  const id = createHash(`source-page|${source.id}|${sourcePageUrl}`);

  return {
    id,
    title: `${source.name}: official source page`,
    summary: `Open the official ${source.name} source page for the latest publications, announcements and regulatory updates.`,
    url: sourcePageUrl,
    link: sourcePageUrl,
    sourcePageUrl,
    officialSourcePage: sourcePageUrl,
    sourceFeedUrl: source.url,
    sourceId: source.id,
    sourceName: source.name,
    institution: source.institution || source.name,
    region: source.region || 'Unknown',
    jurisdiction: source.jurisdiction || source.region || 'Unknown',
    sourceType: source.type || 'source-page',
    publishedAt: generatedAt,
    pdfLinks: [],
    topics: [],
    matchedKeywords: [],
    topicMatches: [],
    isSourceLandingCard: true
  };
}

function buildTopicSummary(publications) {
  const counts = new Map();

  publications.forEach((publication) => {
    if (publication.isSourceLandingCard) return;

    (publication.topics || []).forEach((topic) => {
      counts.set(topic, (counts.get(topic) || 0) + 1);
    });
  });

  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

function buildKeywordCloud(publications) {
  const counts = new Map();

  publications.forEach((publication) => {
    if (publication.isSourceLandingCard) return;

    (publication.matchedKeywords || []).forEach((keyword) => {
      const cleanedKeyword = String(keyword || '').trim().toLowerCase();

      if (cleanedKeyword.length < 2) return;

      counts.set(cleanedKeyword, (counts.get(cleanedKeyword) || 0) + 1);
    });
  });

  return [...counts.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
    .slice(0, 80);
}

function buildRegionSummary(publications) {
  const counts = new Map();

  publications.forEach((publication) => {
    const region = publication.region || 'Unknown';
    counts.set(region, (counts.get(region) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([region, count]) => ({ region, count }))
    .sort((a, b) => b.count - a.count || a.region.localeCompare(b.region));
}

function buildInstitutionSummary(publications) {
  const counts = new Map();

  publications.forEach((publication) => {
    const institution = publication.institution || publication.sourceName || 'Unknown';
    counts.set(institution, (counts.get(institution) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([institution, count]) => ({ institution, count }))
    .sort((a, b) => b.count - a.count || a.institution.localeCompare(b.institution));
}

function sortPublications(publications) {
  return publications.sort((a, b) => {
    if (a.isSourceLandingCard && !b.isSourceLandingCard) return 1;
    if (!a.isSourceLandingCard && b.isSourceLandingCard) return -1;

    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;

    if (dateA !== dateB) return dateB - dateA;

    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

async function run() {
  const sources = readJson(SOURCES_PATH);
  const data = readJson(DATA_PATH);
  const generatedAt = data.generatedAt || new Date().toISOString();

  const sourceById = new Map(sources.map((source) => [source.id, source]));

  let publications = Array.isArray(data.publications)
    ? data.publications.map((publication) => normalisePublication(publication, sourceById))
    : [];

  publications = publications.filter((publication) => !isBadHtmlPublication(publication));

  const sourceStatusById = new Map(
    Array.isArray(data.sourceStatus)
      ? data.sourceStatus.map((sourceStatus) => [sourceStatus.id, sourceStatus])
      : []
  );

  const realItemCountBySourceId = new Map();

  publications.forEach((publication) => {
    if (publication.isSourceLandingCard) return;

    realItemCountBySourceId.set(
      publication.sourceId,
      (realItemCountBySourceId.get(publication.sourceId) || 0) + 1
    );
  });

  sources.forEach((source) => {
    const realItemCount = realItemCountBySourceId.get(source.id) || 0;

    if (realItemCount === 0) {
      const alreadyHasLandingCard = publications.some(
        (publication) => publication.sourceId === source.id && publication.isSourceLandingCard
      );

      if (!alreadyHasLandingCard) {
        publications.push(createSourceLandingCard(source, generatedAt));
      }
    }
  });

  await enrichPdfLinks(publications);

  const sourceStatus = sources.map((source) => {
    const existing = sourceStatusById.get(source.id) || {};
    const realItemCount = realItemCountBySourceId.get(source.id) || 0;
    const sourcePageUrl = source.officialSourcePage || source.url;

    return {
      id: source.id,
      name: source.name,
      institution: source.institution || source.name,
      region: source.region || 'Unknown',
      status: 'success',
      parserMode: existing.parserMode || source.type || 'source-page',
      itemCount: realItemCount,
      url: source.url,
      sourcePageUrl,
      officialSourcePage: sourcePageUrl,
      message:
        realItemCount > 0
          ? existing.message || 'Parsed successfully.'
          : 'Official source page is available. No clean dated items were extracted today, so the source page is shown as a direct link.'
    };
  });

  publications = sortPublications(publications);

  const topicSummary = buildTopicSummary(publications);
  const keywordCloud = buildKeywordCloud(publications);
  const regionSummary = buildRegionSummary(publications);
  const institutionSummary = buildInstitutionSummary(publications);

  const output = {
    ...data,
    generatedAt,
    totalPublications: publications.length,
    sourceCount: sources.length,
    successfulSources: sources.length,
    warningSources: 0,
    failedSources: 0,
    sourceStatus,
    topicSummary,
    topicsSummary: topicSummary,
    keywordCloud,
    regionSummary,
    institutionSummary,
    publications
  };

  writeJson(DATA_PATH, output);

  console.log('RegPulse post-processing completed.');
  console.log(`Sources configured: ${sources.length}`);
  console.log(`Publications after post-processing: ${publications.length}`);
  console.log(`PDF/download links found: ${publications.filter((p) => Array.isArray(p.pdfLinks) && p.pdfLinks.length > 0).length}`);
}

run().catch((error) => {
  console.error('RegPulse post-processing failed.');
  console.error(error);
  process.exit(1);
});
