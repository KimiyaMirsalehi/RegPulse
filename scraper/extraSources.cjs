const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCES_PATH = path.join(__dirname, 'sources.json');
const TOPICS_PATH = path.join(__dirname, 'topics.json');
const DATA_PATH = path.join(ROOT_DIR, 'data', 'publications.json');

const MAX_ITEMS_PER_EXTRA_SOURCE = 90;
const FETCH_TIMEOUT_MS = 25000;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function createHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function decodeHtmlEntities(value) {
  if (!value) return '';

  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;/gi, '’')
    .replace(/&lsquo;/gi, '‘')
    .replace(/&rdquo;/gi, '”')
    .replace(/&ldquo;/gi, '“')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&hellip;/gi, '...')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCodePoint(Number(code));
      } catch {
        return ' ';
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      try {
        return String.fromCodePoint(parseInt(code, 16));
      } catch {
        return ' ';
      }
    });
}

function cleanText(value) {
  if (!value) return '';

  return decodeHtmlEntities(String(value))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<\/div>/gi, ' ')
    .replace(/<\/li>/gi, ' ')
    .replace(/<\/h[1-6]>/gi, ' ')
    .replace(/<\/tr>/gi, ' ')
    .replace(/<\/td>/gi, ' ')
    .replace(/<\/th>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

function truncateSummary(value, maxLength = 700) {
  const cleaned = cleanText(value);

  if (cleaned.length <= maxLength) return cleaned;

  const truncated = cleaned.slice(0, maxLength);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );

  if (lastSentenceEnd > 250) {
    return truncated.slice(0, lastSentenceEnd + 1).trim();
  }

  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > 250) {
    return `${truncated.slice(0, lastSpace).trim()}...`;
  }

  return `${truncated.trim()}...`;
}

function absoluteUrl(url, baseUrl) {
  if (!url) return '';

  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function normaliseUrl(value) {
  if (!value) return '';

  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return String(value).split('?')[0].split('#')[0].replace(/\/$/, '').toLowerCase();
  }
}

function isPdfLink(value) {
  return /\.pdf($|\?|#)/i.test(String(value || ''));
}

function parseDateString(value) {
  if (!value) return null;

  const cleaned = cleanText(value)
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
    .replace(/\bof\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const slashMatch = cleaned.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);

  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const parsed = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);

    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const isoMatch = cleaned.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const parsed = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);

    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const monthNameMatch = cleaned.match(
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i
  );

  if (monthNameMatch) {
    const parsed = new Date(
      `${monthNameMatch[1]} ${monthNameMatch[2]} ${monthNameMatch[3]} 00:00:00 UTC`
    );

    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const monthYearMatch = cleaned.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i
  );

  if (monthYearMatch) {
    const parsed = new Date(`1 ${monthYearMatch[1]} ${monthYearMatch[2]} 00:00:00 UTC`);

    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const directDate = new Date(cleaned);

  if (!Number.isNaN(directDate.getTime())) return directDate.toISOString();

  return null;
}

function findDateInText(value) {
  const text = cleanText(value);

  const patterns = [
    /\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/i,
    /\b\d{1,2}(st|nd|rd|th)?\s+of\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/i,
    /\b\d{1,2}\/\d{1,2}\/20\d{2}\b/,
    /\b20\d{2}-\d{1,2}-\d{1,2}\b/,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return {
        raw: match[0],
        iso: parseDateString(match[0]),
        index: match.index,
        sourceText: text
      };
    }
  }

  return null;
}

function findDateInUrl(value) {
  const url = String(value || '');

  const yyyymmdd = url.match(/\b(20\d{2})(0[1-9]|1[0-2])([0-3]\d)\b/);

  if (yyyymmdd) {
    const [, year, month, day] = yyyymmdd;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);

    if (!Number.isNaN(parsed.getTime())) {
      return {
        raw: `${year}${month}${day}`,
        iso: parsed.toISOString(),
        index: url.indexOf(yyyymmdd[0]),
        sourceText: url
      };
    }
  }

  const yymmdd = url.match(/\b([2-9]\d)(0[1-9]|1[0-2])([0-3]\d)\b/);

  if (yymmdd) {
    const [, yearShort, month, day] = yymmdd;
    const year = `20${yearShort}`;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);

    if (!Number.isNaN(parsed.getTime())) {
      return {
        raw: `${yearShort}${month}${day}`,
        iso: parsed.toISOString(),
        index: url.indexOf(yymmdd[0]),
        sourceText: url
      };
    }
  }

  const yyyymm = url.match(/\b(20\d{2})(0[1-9]|1[0-2])\b/);

  if (yyyymm) {
    const [, year, month] = yyyymm;
    const parsed = new Date(`${year}-${month}-01T00:00:00Z`);

    if (!Number.isNaN(parsed.getTime())) {
      return {
        raw: `${year}${month}`,
        iso: parsed.toISOString(),
        index: url.indexOf(yyyymm[0]),
        sourceText: url
      };
    }
  }

  return null;
}

function extractAnchors(html, baseUrl) {
  const anchors = [];
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(String(html || ''))) !== null) {
    const href = match[1];
    const innerHtml = match[2];
    const text = cleanText(innerHtml);
    const url = absoluteUrl(href, baseUrl);

    if (!href || !url) continue;

    anchors.push({
      href,
      url,
      text,
      index: match.index
    });
  }

  return anchors;
}

function isBadTitle(value) {
  const title = cleanText(value);
  const lower = title.toLowerCase();

  if (!title || title.length < 8) return true;

  const blockedExact = new Set([
    'read more',
    'english',
    'download',
    'pdf',
    'html',
    'source page',
    'home',
    'search',
    'menu',
    'next page',
    'previous page',
    'view more',
    'back to top',
    'skip to content',
    'skip to main content',
    'page survey',
    'privacy',
    'cookies',
    'legal'
  ]);

  if (blockedExact.has(lower)) return true;

  const blockedContains = [
    'toggle navigation',
    'site navigation',
    'cookie preferences',
    'accept optional cookies',
    'reject optional cookies',
    'subscribe to emails',
    'sign up for our newsletter',
    'social media',
    'useful links',
    'page last updated',
    'select your language',
    'other languages'
  ];

  return blockedContains.some((blocked) => lower.includes(blocked));
}

function cleanCandidateTitle(value) {
  let title = cleanText(value);

  title = title
    .replace(/\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/gi, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}\/20\d{2}\b/g, ' ')
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, ' ')
    .replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/gi, ' ')
    .replace(/^(news|publication|publications|press release|speech|blog|report|working paper|consultation|statement)\s*(\/\/|:|-)?\s*/i, ' ')
    .replace(/^financial policy committee \(fpc\)\s*/i, ' ')
    .replace(/^prudential regulation authority\s*/i, ' ')
    .replace(/^english\s*/i, ' ')
    .replace(/\bread more\b/gi, ' ')
    .replace(/\bdownload\b/gi, ' ')
    .replace(/\bpdf\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (title.includes('...')) {
    const pieces = title
      .split('...')
      .map((piece) => cleanText(piece))
      .filter((piece) => piece.length >= 12);

    if (pieces.length > 0) {
      title = pieces[pieces.length - 1];
    }
  }

  const duplicateHalf = title.match(/^(.{20,180})\s+\1$/i);

  if (duplicateHalf) {
    title = duplicateHalf[1].trim();
  }

  return title;
}

function titleFromUrl(value) {
  try {
    const parsed = new URL(value);
    let lastPart = parsed.pathname.split('/').filter(Boolean).pop() || '';

    lastPart = lastPart
      .replace(/\.(html|htm|pdf|xml)$/i, '')
      .replace(/~[a-z0-9]+$/i, '')
      .replace(/^ssm\.(blog|pr)\d+/i, '')
      .replace(/^ecb\.govcstatement\d+/i, 'ecb governing council statement')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!lastPart) return '';

    return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
  } catch {
    return '';
  }
}

function deriveTitle(anchor, context, dateInfo, source) {
  const rawAnchorText = cleanText(anchor.text);
  let title = cleanCandidateTitle(rawAnchorText);

  if (isBadTitle(title) && dateInfo && dateInfo.sourceText) {
    const sourceText = cleanText(dateInfo.sourceText);
    const dateIndex = sourceText.indexOf(dateInfo.raw);

    if (dateIndex >= 0) {
      const afterDate = sourceText.slice(dateIndex + dateInfo.raw.length, dateIndex + dateInfo.raw.length + 260);
      title = cleanCandidateTitle(afterDate);
    }
  }

  if (isBadTitle(title)) {
    const contextDate = findDateInText(context);

    if (contextDate && contextDate.sourceText) {
      const sourceText = cleanText(contextDate.sourceText);
      const dateIndex = sourceText.indexOf(contextDate.raw);

      if (dateIndex >= 0) {
        const afterDate = sourceText.slice(dateIndex + contextDate.raw.length, dateIndex + contextDate.raw.length + 260);
        title = cleanCandidateTitle(afterDate);
      }
    }
  }

  if (isBadTitle(title)) {
    title = titleFromUrl(anchor.url);
  }

  if (isBadTitle(title)) {
    title = `${source.name} update`;
  }

  return title;
}

function extractSummary(anchor, context, title, dateInfo) {
  const text = cleanText(context);
  const titleIndex = text.toLowerCase().indexOf(cleanText(title).toLowerCase());

  if (titleIndex >= 0) {
    const afterTitle = text.slice(titleIndex + title.length, titleIndex + title.length + 900);
    return truncateSummary(afterTitle);
  }

  if (dateInfo && dateInfo.raw) {
    const dateIndex = text.indexOf(dateInfo.raw);

    if (dateIndex >= 0) {
      const afterDate = text.slice(dateIndex + dateInfo.raw.length, dateIndex + dateInfo.raw.length + 900);
      return truncateSummary(afterDate);
    }
  }

  return '';
}

function anchorMatchesSource(anchor, source) {
  const url = String(anchor.url || '').toLowerCase();
  const href = String(anchor.href || '').toLowerCase();

  if (Array.isArray(source.itemUrlContains) && source.itemUrlContains.length > 0) {
    return source.itemUrlContains.some((part) => {
      const lowerPart = String(part || '').toLowerCase();
      return url.includes(lowerPart) || href.includes(lowerPart);
    });
  }

  return false;
}

function isSameAsSourcePage(anchor, source) {
  return normaliseUrl(anchor.url) === normaliseUrl(source.url) ||
    normaliseUrl(anchor.url) === normaliseUrl(source.officialSourcePage);
}

function normaliseForMatching(value) {
  return ` ${String(value || '')
    .toLowerCase()
    .replace(/&nbsp;/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function tagPublication(publication, topics) {
  const searchableText = normaliseForMatching(
    [
      publication.title,
      publication.summary,
      publication.sourceName,
      publication.institution,
      publication.region,
      publication.jurisdiction,
      publication.url
    ].join(' ')
  );

  const matchedTopics = [];
  const matchedKeywords = [];
  const topicMatches = [];

  topics.forEach((topic) => {
    const topicMatchedKeywords = [];

    topic.keywords.forEach((keyword) => {
      const normalisedKeyword = normaliseForMatching(keyword).trim();

      if (!normalisedKeyword) return;

      const keywordRegex = new RegExp(
        `(^|\\s)${normalisedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`,
        'i'
      );

      if (keywordRegex.test(searchableText)) {
        topicMatchedKeywords.push(keyword);
        matchedKeywords.push(keyword);
      }
    });

    if (topicMatchedKeywords.length > 0) {
      matchedTopics.push(topic.label);
      topicMatches.push({
        id: topic.id,
        label: topic.label,
        keywords: [...new Set(topicMatchedKeywords)]
      });
    }
  });

  return {
    topics: [...new Set(matchedTopics)],
    matchedKeywords: [...new Set(matchedKeywords)],
    topicMatches
  };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'RegPulse/1.0 (+https://github.com/KimiyaMirsalehi/RegPulse; regulatory monitoring tool)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function getSourceUrls(source) {
  return [...new Set([source.url, ...(Array.isArray(source.pageUrls) ? source.pageUrls : [])].filter(Boolean))];
}

function buildPublication(anchor, context, source, topics) {
  const dateInfo =
    findDateInText(anchor.text) ||
    findDateInText(context) ||
    findDateInUrl(anchor.url);

  if (!dateInfo || !dateInfo.iso) {
    return null;
  }

  const title = deriveTitle(anchor, context, dateInfo, source);

  if (isBadTitle(title)) {
    return null;
  }

  const summary = extractSummary(anchor, context, title, dateInfo);
  const sourcePageUrl = source.officialSourcePage || source.url;
  const pdfLinks = isPdfLink(anchor.url) ? [anchor.url] : [];

  const basePublication = {
    title,
    summary,
    url: anchor.url,
    link: anchor.url,
    sourcePageUrl,
    officialSourcePage: sourcePageUrl,
    sourceFeedUrl: source.url,
    sourceId: source.id,
    sourceName: source.name,
    institution: source.institution || source.name,
    region: source.region || 'Unknown',
    jurisdiction: source.jurisdiction || source.region || 'Unknown',
    sourceType: source.type || 'html-list',
    publishedAt: dateInfo.iso,
    pdfLinks
  };

  const tagging = tagPublication(basePublication, topics);

  return {
    id: createHash([
      normaliseUrl(basePublication.url),
      basePublication.title,
      basePublication.sourceId,
      basePublication.publishedAt
    ].join('|')),
    ...basePublication,
    topics: tagging.topics,
    matchedKeywords: tagging.matchedKeywords,
    topicMatches: tagging.topicMatches
  };
}

async function scrapeExtraSource(source, topics) {
  const sourceUrls = getSourceUrls(source);
  const items = [];
  const seen = new Set();

  for (const sourceUrl of sourceUrls) {
    try {
      const html = await fetchText(sourceUrl);
      const anchors = extractAnchors(html, sourceUrl);

      anchors.forEach((anchor) => {
        if (!anchorMatchesSource(anchor, source)) return;
        if (isSameAsSourcePage(anchor, source)) return;

        const key = normaliseUrl(anchor.url);

        if (!key || seen.has(key)) return;

        const context = String(html || '').slice(
          Math.max(0, anchor.index - 1200),
          Math.min(String(html || '').length, anchor.index + 2600)
        );

        const publication = buildPublication(anchor, context, source, topics);

        if (!publication) return;

        seen.add(key);
        items.push(publication);
      });
    } catch (error) {
      console.warn(`  Extra warning: ${source.name} page skipped - ${sourceUrl} - ${error.message}`);
    }
  }

  return items
    .sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;

      if (dateA !== dateB) return dateB - dateA;

      return String(a.title || '').localeCompare(String(b.title || ''));
    })
    .slice(0, MAX_ITEMS_PER_EXTRA_SOURCE);
}

function deduplicatePublications(publications) {
  const seen = new Map();

  publications.forEach((publication) => {
    const urlKey = normaliseUrl(publication.url || publication.link || '');
    const titleKey = `${cleanText(publication.title).toLowerCase()}|${publication.sourceId}|${publication.publishedAt || ''}`;
    const key = urlKey || titleKey;

    if (!seen.has(key)) {
      seen.set(key, publication);
      return;
    }

    const existing = seen.get(key);
    const existingScore =
      (existing.topics || []).length +
      (existing.summary ? 1 : 0) +
      (Array.isArray(existing.pdfLinks) && existing.pdfLinks.length > 0 ? 1 : 0);

    const newScore =
      (publication.topics || []).length +
      (publication.summary ? 1 : 0) +
      (Array.isArray(publication.pdfLinks) && publication.pdfLinks.length > 0 ? 1 : 0);

    if (newScore > existingScore) {
      seen.set(key, publication);
    }
  });

  return [...seen.values()];
}

function sortPublications(publications) {
  return publications.sort((a, b) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;

    if (dateA !== dateB) return dateB - dateA;

    return String(a.title || '').localeCompare(String(b.title || ''));
  });
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
      const cleanedKeyword = cleanText(keyword).toLowerCase();

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

function updateSourceStatus(data, sources, extraCountsBySourceId) {
  const sourceStatusById = new Map(
    Array.isArray(data.sourceStatus)
      ? data.sourceStatus.map((sourceStatus) => [sourceStatus.id, sourceStatus])
      : []
  );

  sources.forEach((source) => {
    if (!source.extraParser) return;

    const addedCount = extraCountsBySourceId.get(source.id) || 0;
    const existing = sourceStatusById.get(source.id);

    if (existing) {
      existing.itemCount = Math.max(Number(existing.itemCount || 0), addedCount);
      existing.status = addedCount > 0 ? 'success' : existing.status || 'warning';
      existing.parserMode = addedCount > 0 ? 'extra-html-list-parser' : existing.parserMode || 'extra-html-list-empty';
      existing.message =
        addedCount > 0
          ? `Parsed successfully from supplemental official HTML source.`
          : existing.message || 'Official supplemental source reached, but no dated items were extracted today.';
      existing.sourcePageUrl = source.officialSourcePage || source.url;
      existing.officialSourcePage = source.officialSourcePage || source.url;
      existing.url = source.url;
      return;
    }

    sourceStatusById.set(source.id, {
      id: source.id,
      name: source.name,
      institution: source.institution || source.name,
      region: source.region || 'Unknown',
      status: addedCount > 0 ? 'success' : 'warning',
      parserMode: addedCount > 0 ? 'extra-html-list-parser' : 'extra-html-list-empty',
      itemCount: addedCount,
      url: source.url,
      sourcePageUrl: source.officialSourcePage || source.url,
      officialSourcePage: source.officialSourcePage || source.url,
      message:
        addedCount > 0
          ? 'Parsed successfully from supplemental official HTML source.'
          : 'Official supplemental source reached, but no dated items were extracted today.'
    });
  });

  return sources.map((source) => {
    const existing = sourceStatusById.get(source.id);

    return {
      id: source.id,
      name: source.name,
      institution: source.institution || source.name,
      region: source.region || 'Unknown',
      status: existing?.status || 'warning',
      parserMode: existing?.parserMode || source.type || 'unknown',
      itemCount: Number(existing?.itemCount || 0),
      url: source.url,
      sourcePageUrl: source.officialSourcePage || source.url,
      officialSourcePage: source.officialSourcePage || source.url,
      message: existing?.message || 'Source configured.'
    };
  });
}

async function run() {
  console.log('RegPulse supplemental source scraper started.');

  const sources = readJson(SOURCES_PATH);
  const topics = readJson(TOPICS_PATH);
  const data = readJson(DATA_PATH);

  const extraSources = sources.filter((source) => source.extraParser);
  const extraPublications = [];
  const extraCountsBySourceId = new Map();

  for (const source of extraSources) {
    console.log(`Extra fetching ${source.name}...`);

    const publications = await scrapeExtraSource(source, topics);
    extraCountsBySourceId.set(source.id, publications.length);
    extraPublications.push(...publications);

    console.log(`  Extra success: ${publications.length} publications.`);
  }

  const originalPublications = Array.isArray(data.publications) ? data.publications : [];
  const publications = sortPublications(deduplicatePublications([...originalPublications, ...extraPublications]));

  const sourceStatus = updateSourceStatus(data, sources, extraCountsBySourceId);
  const successfulSources = sourceStatus.filter((source) => source.status === 'success').length;
  const warningSources = sourceStatus.filter((source) => source.status === 'warning').length;
  const failedSources = sourceStatus.filter((source) => source.status === 'failed').length;

  const topicSummary = buildTopicSummary(publications);
  const keywordCloud = buildKeywordCloud(publications);
  const regionSummary = buildRegionSummary(publications);
  const institutionSummary = buildInstitutionSummary(publications);

  const output = {
    ...data,
    generatedAt: data.generatedAt || new Date().toISOString(),
    totalPublications: publications.length,
    sourceCount: sources.length,
    successfulSources,
    warningSources,
    failedSources,
    sourceStatus,
    topicSummary,
    topicsSummary: topicSummary,
    keywordCloud,
    regionSummary,
    institutionSummary,
    publications
  };

  writeJson(DATA_PATH, output);

  console.log('RegPulse supplemental source scraper completed.');
  console.log(`Supplemental sources configured: ${extraSources.length}`);
  console.log(`Supplemental publications added before de-duplication: ${extraPublications.length}`);
  console.log(`Publications after supplemental merge: ${publications.length}`);
}

run().catch((error) => {
  console.error('RegPulse supplemental source scraper failed.');
  console.error(error);
  console.error(error.stack);
  process.exit(1);
});
