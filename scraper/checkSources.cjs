const Parser = require('rss-parser');
const sources = require('./sources.json');

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'RegPulse/1.0 (+https://github.com/) Mozilla/5.0',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
  }
});

function formatDate(value) {
  if (!value) return 'No date found';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString();
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

async function checkSource(source) {
  try {
    const result = await parseFeedWithFallback(source);
    const feed = result.feed;

    const itemCount = Array.isArray(feed.items) ? feed.items.length : 0;
    const firstItem = itemCount > 0 ? feed.items[0] : null;

    return {
      id: source.id,
      name: source.name,
      institution: source.institution,
      region: source.region,
      status: 'OK',
      itemCount,
      feedTitle: feed.title || 'No feed title found',
      latestTitle: firstItem?.title || 'No items found',
      latestDate: formatDate(firstItem?.isoDate || firstItem?.pubDate),
      url: source.url,
      usedFallback: result.usedFallback,
      warning: result.warning
    };
  } catch (error) {
    return {
      id: source.id,
      name: source.name,
      institution: source.institution,
      region: source.region,
      status: 'FAILED',
      error: error.message,
      url: source.url
    };
  }
}

async function main() {
  console.log('\nRegPulse — source health check\n');

  let okCount = 0;
  let warningCount = 0;
  let failedCount = 0;

  for (const source of sources) {
    const result = await checkSource(source);

    if (result.status === 'OK') {
      okCount += 1;

      if (result.usedFallback) {
        warningCount += 1;
        console.log(`⚠️  ${result.name}`);
      } else {
        console.log(`✅ ${result.name}`);
      }

      console.log(`   Institution : ${result.institution}`);
      console.log(`   Region      : ${result.region}`);
      console.log(`   Items found : ${result.itemCount}`);
      console.log(`   Latest item : ${result.latestTitle}`);
      console.log(`   Latest date : ${result.latestDate}`);
      console.log(`   URL         : ${result.url}`);

      if (result.warning) {
        console.log(`   Warning     : ${result.warning}`);
      }

      console.log('');
    } else {
      failedCount += 1;

      console.log(`❌ ${result.name}`);
      console.log(`   Institution : ${result.institution}`);
      console.log(`   Region      : ${result.region}`);
      console.log(`   Error       : ${result.error}`);
      console.log(`   URL         : ${result.url}`);
      console.log('');
    }
  }

  console.log('Summary');
  console.log('-------');
  console.log(`Working sources       : ${okCount}`);
  console.log(`Working with warnings : ${warningCount}`);
  console.log(`Failed sources        : ${failedCount}`);
  console.log(`Total sources         : ${sources.length}`);

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

main();