import { useEffect, useMemo, useState } from 'react';
import publicationsData from '../data/publications.json';

const PAGE_SIZE = 10;

const WORD_CLOUD_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'he',
  'her',
  'his',
  'i',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'our',
  'she',
  'that',
  'the',
  'their',
  'them',
  'they',
  'this',
  'to',
  'we',
  'with',
  'you',
  'your'
]);

const BAD_HTML_TITLE_PATTERN =
  /toggle navigation|benchmark administrators|climate benchmarks|cras and sustainability|credit rating agencies|digital finance|esg rating providers|external reviewers|banknotes|calendar of cbc officials|administrative sanctions|discover the section|cta portal|data directory|capacity building|adaptation$/i;

const HTML_LIST_SOURCE_IDS = new Set([
  'esma-news',
  'central-bank-cyprus-announcements',
  'ngfs-publications',
  'ifrs-foundation-news'
]);

function normaliseValue(value) {
  return String(value || '').trim().toLowerCase();
}

function valuesAreEqual(a, b) {
  return normaliseValue(a) === normaliseValue(b);
}

function formatDate(value) {
  if (!value) return 'No date';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  }).format(date);
}

function getPublicationTopics(publication) {
  if (!Array.isArray(publication.topics)) return [];

  return publication.topics
    .filter(Boolean)
    .map((topic) => String(topic).trim())
    .filter(Boolean);
}

function getPublicationKeywords(publication) {
  if (!Array.isArray(publication.matchedKeywords)) return [];

  return publication.matchedKeywords
    .filter(Boolean)
    .map((keyword) => String(keyword).trim())
    .filter(Boolean);
}

function getPublicationUrl(publication) {
  return (
    publication.url ||
    publication.link ||
    publication.sourcePageUrl ||
    publication.officialSourcePage ||
    ''
  );
}

function getSourcePageUrl(publication) {
  return publication.sourcePageUrl || publication.officialSourcePage || '';
}

function getPdfLinks(publication) {
  if (!Array.isArray(publication.pdfLinks)) return [];

  return publication.pdfLinks
    .filter(Boolean)
    .map((link) => String(link).trim())
    .filter(Boolean);
}

function isBadHtmlPublication(publication) {
  if (!HTML_LIST_SOURCE_IDS.has(publication.sourceId)) {
    return false;
  }

  if (!publication.publishedAt) {
    return true;
  }

  return BAD_HTML_TITLE_PATTERN.test(publication.title || '');
}

function publicationMatchesSearch(publication, searchTerm) {
  const normalisedSearch = searchTerm.trim().toLowerCase();

  if (!normalisedSearch) return true;

  const searchableText = [
    publication.title,
    publication.summary,
    publication.institution,
    publication.sourceName,
    publication.region,
    publication.jurisdiction,
    getPublicationUrl(publication),
    ...getPublicationTopics(publication),
    ...getPublicationKeywords(publication)
  ]
    .join(' ')
    .toLowerCase();

  return searchableText.includes(normalisedSearch);
}

function publicationMatchesSelectedRegion(publication, selectedRegion) {
  if (selectedRegion === 'All') return true;
  return valuesAreEqual(publication.region, selectedRegion);
}

function publicationMatchesSelectedInstitution(publication, selectedInstitution) {
  if (selectedInstitution === 'All') return true;
  return valuesAreEqual(publication.institution, selectedInstitution);
}

function publicationMatchesSelectedTopic(publication, selectedTopic) {
  if (selectedTopic === 'All') return true;

  return getPublicationTopics(publication).some((topic) =>
    valuesAreEqual(topic, selectedTopic)
  );
}

function publicationMatchesSelectedKeyword(publication, selectedKeyword) {
  if (selectedKeyword === 'All') return true;

  return getPublicationKeywords(publication).some((keyword) =>
    valuesAreEqual(keyword, selectedKeyword)
  );
}

function publicationMatchesSelectedDateRange(publication, selectedDateRange) {
  if (selectedDateRange === 'All') return true;
  if (!publication.publishedAt) return false;

  const date = new Date(publication.publishedAt);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();
  const diffInMilliseconds = now.getTime() - date.getTime();
  const diffInDays = diffInMilliseconds / (1000 * 60 * 60 * 24);

  if (selectedDateRange === '7') return diffInDays <= 7;
  if (selectedDateRange === '30') return diffInDays <= 30;
  if (selectedDateRange === '90') return diffInDays <= 90;
  if (selectedDateRange === '365') return diffInDays <= 365;

  return true;
}

function publicationMatchesAllFilters(publication, filters) {
  if (isBadHtmlPublication(publication)) {
    return false;
  }

  return (
    publicationMatchesSearch(publication, filters.searchTerm) &&
    publicationMatchesSelectedRegion(publication, filters.selectedRegion) &&
    publicationMatchesSelectedInstitution(publication, filters.selectedInstitution) &&
    publicationMatchesSelectedTopic(publication, filters.selectedTopic) &&
    publicationMatchesSelectedKeyword(publication, filters.selectedKeyword) &&
    publicationMatchesSelectedDateRange(publication, filters.selectedDateRange)
  );
}

function shouldShowKeyword(keyword) {
  const normalisedKeyword = normaliseValue(keyword);

  if (!normalisedKeyword) return false;
  if (WORD_CLOUD_STOP_WORDS.has(normalisedKeyword)) return false;
  if (normalisedKeyword.length < 3) return false;

  return true;
}

function getUniqueValues(publications, fieldName) {
  return Array.from(
    new Set(
      publications
        .map((publication) => publication[fieldName])
        .filter(Boolean)
    )
  ).sort();
}

function getUniqueTopics(publications) {
  const topics = new Set();

  publications.forEach((publication) => {
    getPublicationTopics(publication).forEach((topic) => topics.add(topic));
  });

  return Array.from(topics).sort();
}

function normaliseSourceStatusList(value) {
  return Array.isArray(value) ? value : [];
}

function countSourceStatus(sourceStatus, status) {
  return sourceStatus.filter((source) => source.status === status).length;
}

function makePublicationRenderKey(publication, index, filters) {
  return [
    filters.selectedRegion,
    filters.selectedInstitution,
    filters.selectedTopic,
    filters.selectedKeyword,
    filters.selectedDateRange,
    publication.id,
    publication.sourceId,
    publication.institution,
    publication.region,
    publication.publishedAt,
    getPublicationUrl(publication),
    publication.title,
    index
  ]
    .map((part) => String(part || '').replace(/\s+/g, '-'))
    .join('|');
}

function getTopicMatchesForDisplay(publication, selectedTopic) {
  const visibleTopics = getPublicationTopics(publication);
  let topicMatches = [];

  if (Array.isArray(publication.topicMatches) && publication.topicMatches.length > 0) {
    topicMatches = publication.topicMatches
      .map((match) => ({
        topic: match.topic || match.label,
        topicId: match.topicId || match.id,
        keywords: match.keywords || []
      }))
      .filter((match) =>
        visibleTopics.some((topic) => valuesAreEqual(topic, match.topic))
      );
  } else {
    topicMatches = visibleTopics.map((topic) => ({
      topic,
      topicId: normaliseValue(topic).replace(/\s+/g, '-'),
      keywords: getPublicationKeywords(publication)
    }));
  }

  if (selectedTopic === 'All') {
    return topicMatches;
  }

  return topicMatches.filter((match) => valuesAreEqual(match.topic, selectedTopic));
}

function Pagination({
  currentPage,
  totalPages,
  totalResults,
  startResult,
  endResult,
  onPrevious,
  onNext
}) {
  if (totalResults === 0) return null;

  return (
    <div className="pagination">
      <p>
        Showing <strong>{startResult}</strong> to <strong>{endResult}</strong> of{' '}
        <strong>{totalResults}</strong> publications
      </p>

      <div className="pagination-actions">
        <button className="secondary-button" onClick={onPrevious} disabled={currentPage === 1}>
          Previous
        </button>
        <span>
          Page {currentPage} of {totalPages}
        </span>
        <button className="secondary-button" onClick={onNext} disabled={currentPage === totalPages}>
          Next
        </button>
      </div>
    </div>
  );
}

function PublicationCard({ publication, selectedTopic }) {
  const visibleTopics = getPublicationTopics(publication);
  const topicMatches = getTopicMatchesForDisplay(publication, selectedTopic);
  const publicationUrl = getPublicationUrl(publication);
  const sourcePageUrl = getSourcePageUrl(publication);
  const pdfLinks = getPdfLinks(publication);

  return (
    <article className="publication-card">
      <div className="publication-meta">
        <span>{publication.region || 'Unknown region'}</span>
        <span>{publication.institution || publication.sourceName || 'Unknown institution'}</span>
        <span>{formatDate(publication.publishedAt)}</span>
      </div>

      <h3>{publication.title}</h3>

      {publication.summary && <p className="summary">{publication.summary}</p>}

      {visibleTopics.length > 0 && (
        <div className="topic-list">
          {visibleTopics.map((topic) => (
            <span
              key={topic}
              className={`topic-pill ${
                selectedTopic !== 'All' && valuesAreEqual(topic, selectedTopic)
                  ? 'selected-topic-pill'
                  : ''
              }`}
            >
              {topic}
            </span>
          ))}
        </div>
      )}

      {topicMatches.length > 0 && (
        <div className="topic-match-list">
          {topicMatches.map((match) => (
            <div key={match.topicId || match.topic} className="topic-match-item">
              <strong>{match.topic}</strong>
              <span>
                matched because:{' '}
                {match.keywords?.filter(shouldShowKeyword).slice(0, 6).join(', ') ||
                  'topic keyword'}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="publication-links">
        {publicationUrl && (
          <a href={publicationUrl} target="_blank" rel="noreferrer">
            Open article
          </a>
        )}

        {sourcePageUrl && sourcePageUrl !== publicationUrl && (
          <a href={sourcePageUrl} target="_blank" rel="noreferrer">
            Source page
          </a>
        )}

        {pdfLinks.map((pdfLink, index) => (
          <a key={pdfLink} href={pdfLink} target="_blank" rel="noreferrer">
            Download file {pdfLinks.length > 1 ? index + 1 : ''}
          </a>
        ))}
      </div>
    </article>
  );
}

function SystemOverview({ publications, topicSummary, sourceStatus }) {
  const successfulCount =
    typeof publicationsData.successfulSources === 'number'
      ? publicationsData.successfulSources
      : countSourceStatus(sourceStatus, 'success');

  const warningCount =
    typeof publicationsData.warningSources === 'number'
      ? publicationsData.warningSources
      : countSourceStatus(sourceStatus, 'warning');

  const failedCount =
    typeof publicationsData.failedSources === 'number'
      ? publicationsData.failedSources
      : countSourceStatus(sourceStatus, 'failed');

  const sourceCount = publicationsData.sourceCount || sourceStatus.length || successfulCount + warningCount + failedCount;

  return (
    <section className="system-overview">
      <div>
        <span className="overview-label">Publications</span>
        <strong>{publications.length}</strong>
        <p>unique items</p>
      </div>

      <div>
        <span className="overview-label">Sources</span>
        <strong>{sourceCount}</strong>
        <p>{failedCount} failed</p>
      </div>

      <div>
        <span className="overview-label">Top topic</span>
        <strong className="overview-topic">{topicSummary[0]?.topic || 'No topics yet'}</strong>
        <p>{topicSummary[0] ? `${topicSummary[0].count} publications` : 'No topic data'}</p>
      </div>

      <div>
        <span className="overview-label">Warnings</span>
        <strong>{warningCount}</strong>
        <p>fallback or empty source</p>
      </div>
    </section>
  );
}

function ActiveFilters({
  searchTerm,
  selectedRegion,
  selectedInstitution,
  selectedTopic,
  selectedKeyword,
  selectedDateRange,
  onClear
}) {
  const activeFilters = [];

  if (searchTerm.trim()) activeFilters.push(`Search: ${searchTerm}`);
  if (selectedRegion !== 'All') activeFilters.push(`Region: ${selectedRegion}`);
  if (selectedInstitution !== 'All') activeFilters.push(`Institution: ${selectedInstitution}`);
  if (selectedTopic !== 'All') activeFilters.push(`Topic: ${selectedTopic}`);
  if (selectedKeyword !== 'All') activeFilters.push(`Keyword: ${selectedKeyword}`);
  if (selectedDateRange !== 'All') activeFilters.push(`Date: last ${selectedDateRange} days`);

  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <div className="active-filters">
      <div>
        <span className="active-filters-label">Active filters</span>
        <div className="active-filter-list">
          {activeFilters.map((filter) => (
            <span key={filter} className="active-filter-pill">
              {filter}
            </span>
          ))}
        </div>
      </div>

      <button className="secondary-button" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}

function TopicInsightList({ items, selectedTopic, onTopicClick }) {
  const maxCount = Math.max(...items.map((item) => item.count), 1);

  return (
    <div className="topic-insight-list">
      {items.slice(0, 10).map((item) => {
        const width = `${Math.max(8, (item.count / maxCount) * 100)}%`;

        return (
          <button
            key={item.topic}
            className={`topic-insight-item ${
              valuesAreEqual(item.topic, selectedTopic) ? 'selected-topic-insight' : ''
            }`}
            onClick={() => onTopicClick(item.topic)}
          >
            <div className="topic-insight-row">
              <span>{item.topic}</span>
              <strong>{item.count}</strong>
            </div>
            <div className="topic-bar">
              <div style={{ width }} />
            </div>
          </button>
        );
      })}

      {items.length === 0 && <p className="small-muted">No topics found for current filters.</p>}
    </div>
  );
}

function SourceStatus({ sourceStatus }) {
  if (!sourceStatus.length) {
    return <p className="small-muted">No source status data available.</p>;
  }

  return (
    <div className="source-status-list">
      {sourceStatus.map((source) => {
        const statusClass =
          source.status === 'failed' ? 'danger' : source.status === 'warning' ? 'warning' : 'success';

        const sourceUrl = source.officialSourcePage || source.url || '';

        return (
          <div key={source.id || source.name} className={`source-status-item ${statusClass}`}>
            <div>
              <strong>{source.name}</strong>
              <span>
                {source.itemCount ?? 0} items · {source.status || 'unknown'}
              </span>
              {source.message && <span>{source.message}</span>}
              {sourceUrl && (
                <span>
                  <a href={sourceUrl} target="_blank" rel="noreferrer">
                    Source page
                  </a>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [selectedInstitution, setSelectedInstitution] = useState('All');
  const [selectedTopic, setSelectedTopic] = useState('All');
  const [selectedKeyword, setSelectedKeyword] = useState('All');
  const [selectedDateRange, setSelectedDateRange] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);

  const rawPublications = publicationsData.publications || [];
  const publications = rawPublications.filter((publication) => !isBadHtmlPublication(publication));
  const sourceStatus = normaliseSourceStatusList(publicationsData.sourceStatus);

  const filters = useMemo(
    () => ({
      searchTerm,
      selectedRegion,
      selectedInstitution,
      selectedTopic,
      selectedKeyword,
      selectedDateRange
    }),
    [
      searchTerm,
      selectedRegion,
      selectedInstitution,
      selectedTopic,
      selectedKeyword,
      selectedDateRange
    ]
  );

  const regions = useMemo(() => getUniqueValues(publications, 'region'), [publications]);
  const institutions = useMemo(() => getUniqueValues(publications, 'institution'), [publications]);
  const topics = useMemo(() => getUniqueTopics(publications), [publications]);

  const visiblePublications = useMemo(() => {
    return publications.filter((publication) => publicationMatchesAllFilters(publication, filters));
  }, [publications, filters]);

  const filteredTopicSummary = useMemo(() => {
    const counts = {};

    visiblePublications.forEach((publication) => {
      getPublicationTopics(publication).forEach((topic) => {
        counts[topic] = (counts[topic] || 0) + 1;
      });
    });

    return Object.entries(counts)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);
  }, [visiblePublications]);

  const filteredKeywordSummary = useMemo(() => {
    const counts = {};

    visiblePublications.forEach((publication) => {
      getPublicationKeywords(publication)
        .filter(shouldShowKeyword)
        .forEach((keyword) => {
          counts[keyword] = (counts[keyword] || 0) + 1;
        });
    });

    return Object.entries(counts)
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 100);
  }, [visiblePublications]);

  const totalPages = Math.max(1, Math.ceil(visiblePublications.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedPublications = visiblePublications.slice(startIndex, endIndex);
  const startResult = visiblePublications.length === 0 ? 0 : startIndex + 1;
  const endResult = Math.min(endIndex, visiblePublications.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  function clearFilters() {
    setSearchTerm('');
    setSelectedRegion('All');
    setSelectedInstitution('All');
    setSelectedTopic('All');
    setSelectedKeyword('All');
    setSelectedDateRange('All');
    setCurrentPage(1);
  }

  function handleTopicClick(topic) {
    setSelectedTopic(topic);
    setSelectedKeyword('All');
  }

  function handleKeywordClick(keyword) {
    setSelectedKeyword(keyword);
  }

  function goToPreviousPage() {
    setCurrentPage((page) => Math.max(1, page - 1));
  }

  function goToNextPage() {
    setCurrentPage((page) => Math.min(totalPages, page + 1));
  }

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">Regulatory intelligence monitor</p>
          <h1>RegPulse</h1>
          <p className="hero-copy">
            Daily monitoring of regulatory publications across EU, UK, US and global institutions,
            with topic tagging for risk, compliance and financial services teams.
          </p>
          <div className="hero-strip">
            <span>{sourceStatus.length || publicationsData.sourceCount || 0} sources configured</span>
            <span>{countSourceStatus(sourceStatus, 'warning')} warnings</span>
            <span>{countSourceStatus(sourceStatus, 'failed')} failed sources</span>
            <span>Updated {formatDate(publicationsData.generatedAt)}</span>
          </div>
        </div>
      </section>

      <SystemOverview
        publications={publications}
        topicSummary={filteredTopicSummary}
        sourceStatus={sourceStatus}
      />

      <section className="executive-layout">
        <div className="main-column">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Explore publications</h2>
                <p>Search and filter the latest collected regulatory updates.</p>
              </div>
              <strong>{visiblePublications.length} results</strong>
            </div>

            <div className="filters filters-expanded">
              <label>
                Search
                <input
                  type="search"
                  placeholder="Try AI, DORA, capital, climate..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>

              <label>
                Region
                <select
                  value={selectedRegion}
                  onChange={(event) => setSelectedRegion(event.target.value)}
                >
                  <option value="All">All regions</option>
                  {regions.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Institution
                <select
                  value={selectedInstitution}
                  onChange={(event) => setSelectedInstitution(event.target.value)}
                >
                  <option value="All">All institutions</option>
                  {institutions.map((institution) => (
                    <option key={institution} value={institution}>
                      {institution}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Topic
                <select
                  value={selectedTopic}
                  onChange={(event) => {
                    setSelectedTopic(event.target.value);
                    setSelectedKeyword('All');
                  }}
                >
                  <option value="All">All topics</option>
                  {topics.map((topic) => (
                    <option key={topic} value={topic}>
                      {topic}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Date range
                <select
                  value={selectedDateRange}
                  onChange={(event) => setSelectedDateRange(event.target.value)}
                >
                  <option value="All">All dates</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="365">Last 12 months</option>
                </select>
              </label>
            </div>

            <ActiveFilters
              searchTerm={searchTerm}
              selectedRegion={selectedRegion}
              selectedInstitution={selectedInstitution}
              selectedTopic={selectedTopic}
              selectedKeyword={selectedKeyword}
              selectedDateRange={selectedDateRange}
              onClear={clearFilters}
            />
          </section>

          <Pagination
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            totalResults={visiblePublications.length}
            startResult={startResult}
            endResult={endResult}
            onPrevious={goToPreviousPage}
            onNext={goToNextPage}
          />

          <section className="publication-list">
            {paginatedPublications.map((publication, index) => (
              <PublicationCard
                key={makePublicationRenderKey(publication, index, filters)}
                publication={publication}
                selectedTopic={selectedTopic}
              />
            ))}

            {visiblePublications.length === 0 && (
              <div className="empty-state">
                No publications matched your filters.
              </div>
            )}
          </section>
        </div>

        <aside className="insights-column sticky-panel">
          <section className="panel insights-panel">
            <h2>Insights</h2>
            <p>Dynamic summary based on current filters.</p>

            <div className="insight-block">
              <div className="section-title-row">
                <h3>Top topics</h3>
                <span>Click to filter</span>
              </div>
              <TopicInsightList
                items={filteredTopicSummary}
                selectedTopic={selectedTopic}
                onTopicClick={handleTopicClick}
              />
            </div>

            <div className="insight-block">
              <div className="section-title-row">
                <h3>Keyword cloud</h3>
                <span>Click to filter</span>
              </div>
              <div className="keyword-cloud">
                {filteredKeywordSummary.slice(0, 35).map((item) => (
                  <button
                    key={item.keyword}
                    className={`keyword-button ${
                      valuesAreEqual(item.keyword, selectedKeyword) ? 'selected-keyword' : ''
                    }`}
                    onClick={() => handleKeywordClick(item.keyword)}
                    style={{ fontSize: `${Math.min(24, 11 + item.count / 2)}px` }}
                    title={`${item.count} matching publications`}
                  >
                    {item.keyword}
                  </button>
                ))}

                {filteredKeywordSummary.length === 0 && (
                  <p className="small-muted">No keywords found for current filters.</p>
                )}
              </div>
            </div>

            <div className="insight-block">
              <div className="section-title-row">
                <h3>Source status</h3>
                <span>{sourceStatus.length} configured</span>
              </div>
              <SourceStatus sourceStatus={sourceStatus} />
            </div>
          </section>
        </aside>
      </section>

      <footer className="app-footer">
        <span>RegPulse by KM</span>
      </footer>
    </main>
  );
}

export default App;
