const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT_DIR, 'data', 'publications.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function normaliseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function parseDateFromUrl(value) {
  const url = String(value || '');

  const yyyymmdd = url.match(/\b(20\d{2})(0[1-9]|1[0-2])([0-3]\d)\b/);
  if (yyyymmdd) {
    const [, year, month, day] = yyyymmdd;
    const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  const yymmdd = url.match(/\b([2-9]\d)(0[1-9]|1[0-2])([0-3]\d)\b/);
  if (yymmdd) {
    const [, yearShort, month, day] = yymmdd;
    const date = new Date(`20${yearShort}-${month}-${day}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  const yyyymm = url.match(/\b(20\d{2})(0[1-9]|1[0-2])\b/);
  if (yyyymm) {
    const [, year, month] = yyyymm;
    const date = new Date(`${year}-${month}-01T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  return null;
}

function isFutureDate(value, cutoffDate) {
  const date = normaliseDate(value);

  if (!date) return false;

  return date.getTime() > cutoffDate.getTime();
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

function run() {
  const data = readJson(DATA_PATH);

  const generatedAt = normaliseDate(data.generatedAt) || new Date();
  const cutoffDate = new Date(generatedAt.getTime() + 24 * 60 * 60 * 1000);

  let correctedCount = 0;

  const publications = (Array.isArray(data.publications) ? data.publications : []).map((publication) => {
    if (!publication.publishedAt || !isFutureDate(publication.publishedAt, cutoffDate)) {
      return publication;
    }

    const urlDate = parseDateFromUrl(publication.url || publication.link || '');

    correctedCount += 1;

    return {
      ...publication,
      originalPublishedAt: publication.originalPublishedAt || publication.publishedAt,
      publishedAt: urlDate && !isFutureDate(urlDate, cutoffDate) ? urlDate : null,
      dateCorrectionReason:
        'Future date removed because it was likely an effective/application date, not a publication date.'
    };
  });

  const output = {
    ...data,
    publications: sortPublications(publications)
  };

  writeJson(DATA_PATH, output);

  console.log('RegPulse future-date cleaner completed.');
  console.log(`Future dates corrected: ${correctedCount}`);
}

run();
