const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Parser = require('rss-parser');

const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCES_PATH = path.join(__dirname, 'sources.json');
const TOPICS_PATH = path.join(__dirname, 'topics.json');
const OUTPUT_DIR = path.join(ROOT_DIR, 'data');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'publications.json');

const MAX_ITEMS_PER_SOURCE = 60;

const parser = new Parser({
  timeout: 20000,
  headers: {
    'User-Agent':
      'RegPulse/1.0 (+https://github.com/KimiyaMirsalehi/RegPulse; regulatory monitoring tool)'
  },
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['dc:creator', 'creator'],
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail']
    ]
  }
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDirectory(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
}

function createHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function decodeHtmlEntities(value) {
  if (!value) {
    return '';
  }

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
    .replace(/&epsilon;/gi, 'ε')
    .replace(/&lambda;/gi, 'λ')
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
  if (!value) {
    return '';
  }

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
    .replace(/([.!?])([A-Z])/g, '$1 $2')
    .trim();
}

function htmlToLines(html) {
  return decodeHtmlEntities(String(html || ''))
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '\n')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|tr|td|th|section|article)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .split('\n')
    .map((line) => cleanText(line))
    .filter(Boolean);
}

function normaliseForMatching(value) {
  return ` ${String(value || '')
    .toLowerCase()
    .replace(/&nbsp;/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function truncateSummary(value, maxLength = 700) {
  const cleaned = cleanText(value);

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

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

function getRawSummary(item) {
  return (
    item.contentEncoded ||
    item['content:encoded'] ||
    item.content ||
    item.summary ||
    item.description ||
    item['description'] ||
    item.contentSnippet ||
    ''
  );
}

function parseDateString(value) {
  if (!value) {
    return null;
  }

  const cleaned = cleanText(value)
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
    .replace(/\bof\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const directDate = new Date(cleaned);

  if (!Number.isNaN(directDate.getTime())) {
    return directDate.toISOString();
  }

  const slashMatch = cleaned.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);

  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const parsed = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const monthNameMatch = cleaned.match(
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i
  );

  if (monthNameMatch) {
    const parsed = new Date(
      `${monthNameMatch[1]} ${monthNameMatch[2]} ${monthNameMatch[3]} 00:00:00 UTC`
    );

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
}

function getPublicationDate(item) {
  const dateValue =
    item.isoDate ||
    item.pubDate ||
    item.published ||
    item.updated ||
    item.date ||
    item['dc:date'] ||
    '';

  return parseDateString(dateValue);
}

function absoluteUrl(url, baseUrl) {
  if (!url) {
    return '';
  }

  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function extractLinksFromHtml(value) {
  if (!value) {
    return [];
  }

  const links = [];
  const html = String(value);
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    if (match[1]) {
      links.push(match[1]);
    }
  }

  return links;
}

function extractAnchors(html, baseUrl) {
  const anchors = [];
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(String(html || ''))) !== null) {
    const href = match[1];
    const text = cleanText(match[2]);

    if (!href || !text) {
      continue;
    }

    anchors.push({
      href,
      url: absoluteUrl(href, baseUrl),
      text
    });
  }

  return anchors;
}

function isPdfLink(value) {
  return /\.pdf($|\?|#)/i.test(String(value || ''));
}

function extractPdfLinks(item, source) {
  const candidates = [];

  if (item.link) {
    candidates.push(item.link);
  }

  if (item.guid) {
    candidates.push(item.guid);
  }

  if (item.enclosure && item.enclosure.url) {
    candidates.push(item.enclosure.url);
  }

  if (Array.isArray(item.links)) {
    item.links.forEach((link) => {
      if (typeof link === 'string') {
        candidates.push(link);
      } else if (link && link.href) {
        candidates.push(link.href);
      }
    });
  }

  const rawHtmlFields = [
    item.contentEncoded,
    item['content:encoded'],
    item.content,
    item.summary,
    item.description
  ];

  rawHtmlFields.forEach((field) => {
    extractLinksFromHtml(field).forEach((link) => candidates.push(link));
  });

  return [...new Set(candidates)]
    .filter(isPdfLink)
    .map((link) => absoluteUrl(link, source.url));
}

function findBestAnchorUrl(anchors, title, source) {
  const cleanedTitle = cleanText(title).toLowerCase();

  const ignoredHrefParts = [
    '#',
    '/cookies',
    '/privacy',
    '/legal',
    '/accessibility',
    '/contact',
    '/newsletter',
    '/search',
    'linkedin.com',
    'twitter.com',
    'x.com'
  ];

  const validAnchors = anchors.filter((anchor) => {
    const href = String(anchor.href || '').toLowerCase();

    if (ignoredHrefParts.some((part) => href.includes(part))) {
      return false;
    }

    return true;
  });

  const exact = validAnchors.find(
    (anchor) => cleanText(anchor.text).toLowerCase() === cleanedTitle
  );

  if (exact) {
    return exact.url;
  }

  const partial = validAnchors.find((anchor) => {
    const cleanedAnchor = cleanText(anchor.text).toLowerCase();

    return (
      cleanedAnchor.includes(cleanedTitle.slice(0, 60)) ||
      cleanedTitle.includes(cleanedAnchor.slice(0, 60))
    );
  });

  if (partial) {
    return partial.url;
  }

  return `${source.url}#${createHash(`${source.id}|${title}`)}`;
}

function tagPublication(publication, topics) {
  const searchableText = normaliseForMatching(
    [
      publication.title,
      publication.summary,
      publication.sourceName,
      publication.institution,
      publication.region,
      publication.jurisdiction
    ].join(' ')
  );

  const matchedTopics = [];
  const matchedKeywords = [];
  const topicMatches = [];

  topics.forEach((topic) => {
    const topicMatchedKeywords = [];

    topic.keywords.forEach((keyword) => {
      const normalisedKeyword = normaliseForMatching(keyword).trim();

      if (!normalisedKeyword) {
        return;
      }

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

function passesSourceFilters(publication, source) {
  const url = String(publication.url || '').toLowerCase();
  const searchableText = [
    publication.title,
    publication.summary,
    publication.url,
    publication.sourceName,
    publication.institution
  ]
    .join(' ')
    .toLowerCase();

  if (Array.isArray(source.includeUrlContains) && source.includeUrlContains.length > 0) {
    const hasUrlMatch = source.includeUrlContains.some((part) =>
      url.includes(String(part).toLowerCase())
    );

    if (hasUrlMatch) {
      return true;
    }
  }

  if (Array.isArray(source.includeTextContains) && source.includeTextContains.length > 0) {
    return source.includeTextContains.some((part) =>
      searchableText.includes(String(part).toLowerCase())
    );
  }

  return true;
}

function normaliseItem(item, source, topics) {
  const title = cleanText(item.title || 'Untitled publication');
  const rawSummary = getRawSummary(item);
  const summary = truncateSummary(rawSummary);
  const publishedAt = getPublicationDate(item);

  const url =
    item.link ||
    item.guid ||
    item.id ||
    source.officialSourcePage ||
    source.url;

  const basePublication = {
    title,
    summary,
    url: absoluteUrl(url, source.url),
    sourceId: source.id,
    sourceName: source.name,
    institution: source.institution || source.name,
    region: source.region || 'Unknown',
    jurisdiction: source.jurisdiction || source.region || 'Unknown',
    sourceType: source.type || 'rss',
    publishedAt,
    pdfLinks: extractPdfLinks(item, source)
  };

  const tagging = tagPublication(basePublication, topics);

  const idSeed = [
    basePublication.url,
    basePublication.title,
    basePublication.sourceId,
    basePublication.publishedAt
  ].join('|');

  return {
    id: createHash(idSeed),
    ...basePublication,
    topics: tagging.topics,
    matchedKeywords: tagging.matchedKeywords,
    topicMatches: tagging.topicMatches
  };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'RegPulse/1.0 (+https://github.com/KimiyaMirsalehi/RegPulse; regulatory monitoring tool)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*'
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

function getTagValue(xml, tagNames) {
  for (const tagName of tagNames) {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = xml.match(regex);

    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return '';
}

function getLinkFromEntry(entryXml) {
  const hrefMatch = entryXml.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);

  if (hrefMatch && hrefMatch[1]) {
    return hrefMatch[1];
  }

  return getTagValue(entryXml, ['link']);
}

function fallbackParseXml(xml) {
  const items = [];

  const rssItemRegex = /<item\b[\s\S]*?<\/item>/gi;
  const atomEntryRegex = /<entry\b[\s\S]*?<\/entry>/gi;

  const itemBlocks = xml.match(rssItemRegex) || [];
  const entryBlocks = xml.match(atomEntryRegex) || [];

  itemBlocks.forEach((block) => {
    items.push({
      title: getTagValue(block, ['title']),
      link: getTagValue(block, ['link']),
      guid: getTagValue(block, ['guid']),
      pubDate: getTagValue(block, ['pubDate', 'dc:date']),
      description: getTagValue(block, ['description']),
      contentEncoded: getTagValue(block, ['content:encoded'])
    });
  });

  entryBlocks.forEach((block) => {
    items.push({
      title: getTagValue(block, ['title']),
      link: getLinkFromEntry(block),
      guid: getTagValue(block, ['id']),
      published: getTagValue(block, ['published']),
      updated: getTagValue(block, ['updated']),
      summary: getTagValue(block, ['summary']),
      content: getTagValue(block, ['content'])
    });
  });

  return {
    title: '',
    items
  };
}

async function parseRssFeed(source) {
  const xml = await fetchText(source.url);

  try {
    const parsedFeed = await parser.parseString(xml);
    return {
      feed: parsedFeed,
      parserMode: 'rss-parser'
    };
  } catch (error) {
    const fallbackFeed = fallbackParseXml(xml);

    if (!fallbackFeed.items || fallbackFeed.items.length === 0) {
      throw error;
    }

    return {
      feed: fallbackFeed,
      parserMode: 'fallback-parser'
    };
  }
}

function isValidPublicationTitle(title) {
  const cleaned = cleanText(title);
  const lower = cleaned.toLowerCase();

  if (!cleaned || cleaned.length < 12) {
    return false;
  }

  const blockedExact = [
    'toggle navigation',
    'central bank of cyprus',
    'administrative sanctions & measures',
    'banknotes & coins',
    'calendar of cbc officials',
    'payment systems & services',
    'financial stability',
    'monetary policy',
    'licensing & supervision',
    'contact details',
    'search',
    'home',
    'privacy policy',
    'cookies',
    'legal notice',
    'load more',
    'current page',
    'next page',
    'previous page',
    'first page',
    'date type title',
    'ifrs foundation news',
    'welcome to the news hub'
  ];

  if (blockedExact.includes(lower)) {
    return false;
  }

  const blockedContains = [
    'toggle navigation',
    'quick links',
    'navbar',
    'document.ready',
    'search_drop',
    'select collections',
    'filter publications',
    'filter by date',
    'selected filters',
    'pagination',
    'sign up for our newsletter',
    'site navigation',
    'footer',
    'social media',
    'cookie preferences',
    'accept optional cookies',
    'reject optional cookies',
    'you need to sign in'
  ];

  return !blockedContains.some((blocked) => lower.includes(blocked));
}

function extractCentralBankCyprusItems(html, source) {
  const lines = htmlToLines(html);
  const anchors = extractAnchors(html, source.url);
  const items = [];

  let started = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.toLowerCase() === 'announcements') {
      started = true;
      continue;
    }

    if (!started) {
      continue;
    }

    const dateIso = parseDateString(line);

    if (!dateIso) {
      continue;
    }

    let title = '';

    for (let nextIndex = index + 1; nextIndex < Math.min(lines.length, index + 6); nextIndex += 1) {
      const candidate = lines[nextIndex];

      if (parseDateString(candidate)) {
        break;
      }

      if (isValidPublicationTitle(candidate)) {
        title = candidate;
        break;
      }
    }

    if (!title) {
      continue;
    }

    const link = findBestAnchorUrl(anchors, title, source);

    items.push({
      title,
      link,
      guid: link,
      published: dateIso,
      description: '',
      content: ''
    });

    if (items.length >= MAX_ITEMS_PER_SOURCE) {
      break;
    }
  }

  return items;
}

function extractEsmaItems(html, source) {
  const anchors = extractAnchors(html, source.url);
  const items = [];
  const seen = new Set();

  anchors.forEach((anchor) => {
    const text = cleanText(anchor.text);
    const dateMatch = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);

    if (!dateMatch) {
      return;
    }

    const title = cleanText(text.slice(0, dateMatch.index));

    if (!isValidPublicationTitle(title)) {
      return;
    }

    const published = parseDateString(dateMatch[1]);
    const summary = cleanText(text.slice(dateMatch.index + dateMatch[1].length));

    const key = `${title}|${anchor.url}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    items.push({
      title,
      link: anchor.url,
      guid: anchor.url,
      published,
      description: summary,
      content: summary
    });
  });

  return items.slice(0, MAX_ITEMS_PER_SOURCE);
}

function extractIfrsItems(html, source) {
  const anchors = extractAnchors(html, source.url);
  const items = [];
  const seen = new Set();

  anchors.forEach((anchor) => {
    const href = String(anchor.href || '').toLowerCase();
    const text = cleanText(anchor.text);

    if (!href.includes('/news-and-events/news/')) {
      return;
    }

    if (!/\/20\d{2}\//.test(href)) {
      return;
    }

    if (!isValidPublicationTitle(text)) {
      return;
    }

    const urlDateMatch = href.match(/\/(20\d{2})\/(\d{2})\//);
    const published = urlDateMatch
      ? parseDateString(`${urlDateMatch[2]}/01/${urlDateMatch[1]}`)
      : null;

    const key = `${text}|${anchor.url}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    items.push({
      title: text,
      link: anchor.url,
      guid: anchor.url,
      published,
      description: '',
      content: ''
    });
  });

  return items.slice(0, MAX_ITEMS_PER_SOURCE);
}

function cleanNgfsTitle(rawTitle) {
  let title = cleanText(rawTitle);

  const categorySplitPatterns = [
    /\s+General\s+-\s+/i,
    /\s+Nature-related risks\s+-\s+/i,
    /\s+Supervision\s+-\s+/i,
    /\s+Data\s+-\s+/i,
    /\s+Scenario design and analysis\s+-\s+/i,
    /\s+Monetary policy\s+-\s+/i,
    /\s+Adaptation\s+-\s+/i,
    /\s+Annual report\s+-\s+/i,
    /\s+Blended finance\s+-\s+/i,
    /\s+Legal issues\s+-\s+/i,
    /\s+Net zero for central banks\s+-\s+/i,
    /\s+Research\s+-\s+/i,
    /\s+Scaling up green finance\s+-\s+/i
  ];

  for (const pattern of categorySplitPatterns) {
    const match = title.match(pattern);

    if (match && match.index > 10) {
      title = title.slice(0, match.index).trim();
      break;
    }
  }

  return title;
}

function extractNgfsItems(html, source) {
  const anchors = extractAnchors(html, source.url);
  const items = [];
  const seen = new Set();

  anchors.forEach((anchor) => {
    const text = cleanText(anchor.text);
    const dateMatch = text.match(
      /\b(\d{1,2}(st|nd|rd|th)?\s+of\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/i
    );

    if (!dateMatch) {
      return;
    }

    const rawTitle = text.slice(0, dateMatch.index);
    const title = cleanNgfsTitle(rawTitle);

    if (!isValidPublicationTitle(title)) {
      return;
    }

    const published = parseDateString(dateMatch[1]);
    const summary = cleanText(text.replace(title, '').replace(dateMatch[1], ''));

    const key = `${title}|${anchor.url}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    items.push({
      title,
      link: anchor.url,
      guid: anchor.url,
      published,
      description: summary,
      content: summary
    });
  });

  return items.slice(0, MAX_ITEMS_PER_SOURCE);
}

function extractGenericDatedHtmlItems(html, source) {
  const anchors = extractAnchors(html, source.url);
  const items = [];
  const seen = new Set();

  anchors.forEach((anchor) => {
    const text = cleanText(anchor.text);

    const dateMatch =
      text.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/) ||
      text.match(/\b\d{1,2}(st|nd|rd|th)?\s+of\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i) ||
      text.match(/\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i);

    if (!dateMatch) {
      return;
    }

    const title = cleanText(text.slice(0, dateMatch.index));

    if (!isValidPublicationTitle(title)) {
      return;
    }

    const key = `${title}|${anchor.url}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    items.push({
      title,
      link: anchor.url,
      guid: anchor.url,
      published: parseDateString(dateMatch[0]),
      description: '',
      content: ''
    });
  });

  return items.slice(0, MAX_ITEMS_PER_SOURCE);
}

async function parseHtmlList(source) {
  const html = await fetchText(source.url);

  let items = [];

  if (source.id === 'central-bank-cyprus-announcements') {
    items = extractCentralBankCyprusItems(html, source);
  } else if (source.id === 'esma-news') {
    items = extractEsmaItems(html, source);
  } else if (source.id === 'ngfs-publications') {
    items = extractNgfsItems(html, source);
  } else if (source.id === 'ifrs-foundation-news') {
    items = extractIfrsItems(html, source);
  } else {
    items = extractGenericDatedHtmlItems(html, source);
  }

  if (!items.length && source.allowEmpty) {
    return {
      feed: {
        title: source.name,
        items: []
      },
      parserMode: 'html-list-empty'
    };
  }

  if (!items.length) {
    throw new Error('No valid dated publication items found on official HTML page.');
  }

  return {
    feed: {
      title: source.name,
      items
    },
    parserMode: 'html-list-parser'
  };
}

async function parseSource(source) {
  if (source.type === 'html-list') {
    return parseHtmlList(source);
  }

  return parseRssFeed(source);
}

function deduplicatePublications(publications) {
  const seen = new Map();

  publications.forEach((publication) => {
    const key = publication.url
      ? publication.url.toLowerCase()
      : `${publication.title}|${publication.sourceId}`.toLowerCase();

    if (!seen.has(key)) {
      seen.set(key, publication);
      return;
    }

    const existing = seen.get(key);

    const existingTopicCount = existing.topics ? existing.topics.length : 0;
    const newTopicCount = publication.topics ? publication.topics.length : 0;

    if (newTopicCount > existingTopicCount) {
      seen.set(key, publication);
    }
  });

  return [...seen.values()];
}

function sortPublications(publications) {
  return publications.sort((a, b) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;

    if (dateA !== dateB) {
      return dateB - dateA;
    }

    return String(a.title).localeCompare(String(b.title));
  });
}

function buildTopicSummary(publications) {
  const counts = new Map();

  publications.forEach((publication) => {
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
    (publication.matchedKeywords || []).forEach((keyword) => {
      const cleanedKeyword = cleanText(keyword).toLowerCase();

      if (cleanedKeyword.length < 2) {
        return;
      }

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

async function run() {
  console.log('RegPulse scraper started.');

  const sources = readJson(SOURCES_PATH);
  const topics = readJson(TOPICS_PATH);

  const allPublications = [];
  const sourceStatus = [];

  for (const source of sources) {
    console.log(`Fetching ${source.name}...`);

    try {
      const { feed, parserMode } = await parseSource(source);
      const rawItems = Array.isArray(feed.items) ? feed.items : [];
      const selectedItems = rawItems.slice(0, MAX_ITEMS_PER_SOURCE);

      const publications = selectedItems
        .map((item) => normaliseItem(item, source, topics))
        .filter((publication) => publication.title && publication.url)
        .filter((publication) => passesSourceFilters(publication, source));

      allPublications.push(...publications);

      sourceStatus.push({
        id: source.id,
        name: source.name,
        institution: source.institution || source.name,
        region: source.region || 'Unknown',
        status:
          parserMode === 'fallback-parser' ||
          parserMode === 'html-list-parser' ||
          parserMode === 'html-list-empty'
            ? 'warning'
            : 'success',
        parserMode,
        itemCount: publications.length,
        message:
          parserMode === 'html-list-empty'
            ? 'Official source reached, but no dated publication items could be extracted from the static HTML page.'
            : parserMode === 'html-list-parser'
              ? 'Parsed successfully from official HTML list page.'
              : parserMode === 'fallback-parser'
                ? 'Parsed successfully using fallback parser.'
                : 'Parsed successfully.'
      });

      console.log(
        `  Success: ${publications.length} publications (${parserMode}).`
      );
    } catch (error) {
      if (source.allowEmpty) {
        sourceStatus.push({
          id: source.id,
          name: source.name,
          institution: source.institution || source.name,
          region: source.region || 'Unknown',
          status: 'warning',
          parserMode: 'source-empty-or-unavailable',
          itemCount: 0,
          message: `Official source could not be parsed today without breaking the scraper: ${error.message}`
        });

        console.warn(`  Warning: ${source.name} - ${error.message}`);
        continue;
      }

      sourceStatus.push({
        id: source.id,
        name: source.name,
        institution: source.institution || source.name,
        region: source.region || 'Unknown',
        status: 'failed',
        parserMode: null,
        itemCount: 0,
        message: error.message
      });

      console.error(`  Failed: ${source.name} - ${error.message}`);
    }
  }

  const publications = sortPublications(deduplicatePublications(allPublications));

  const successfulSources = sourceStatus.filter(
    (source) => source.status === 'success'
  ).length;

  const warningSources = sourceStatus.filter(
    (source) => source.status === 'warning'
  ).length;

  const failedSources = sourceStatus.filter(
    (source) => source.status === 'failed'
  ).length;

  const topicSummary = buildTopicSummary(publications);
  const keywordCloud = buildKeywordCloud(publications);
  const regionSummary = buildRegionSummary(publications);
  const institutionSummary = buildInstitutionSummary(publications);

  const output = {
    generatedAt: new Date().toISOString(),
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

  ensureDirectory(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log('');
  console.log('RegPulse scraper completed.');
  console.log(`Total publications: ${publications.length}`);
  console.log(`Sources successful: ${successfulSources}`);
  console.log(`Sources with warnings: ${warningSources}`);
  console.log(`Sources failed: ${failedSources}`);
  console.log('');
  console.log('Top topics:');

  topicSummary.slice(0, 10).forEach((topic, index) => {
    console.log(`${index + 1}. ${topic.topic}: ${topic.count}`);
  });

  console.log('');
  console.log(`Saved output to ${OUTPUT_PATH}`);
}

run().catch((error) => {
  console.error('RegPulse scraper failed.');
  console.error(error);
  process.exit(1);
});