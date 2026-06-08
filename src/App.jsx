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

function normaliseValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
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

function makePublicationRenderKey(publication, index, filters) {
  return [
    filters.selectedRegion,
    filters.selectedInstitution,
    filters.selectedTopic,
    filters.selectedKeyword,
    filters.selectedDateRange,
    publication.sourceId,
    publication.institution,
    publication.region,
    publication.publishedAt,
    publication.link,
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
    topicMatches = publication.topicMatches.filter((match) =>
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
        <button
          className="secondary-button"
          type="button"
          onClick={onPrevious}
          disabled={currentPage === 1}
        >
          Previous
        </button>

        <span>
          Page {currentPage} of {totalPages}
        </span>

        <button
          className="secondary-button"
          type="button"
          onClick={onNext}
          disabled={currentPage === totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function PublicationCard({ publication, selectedTopic }) {
  const visibleTopics = getPublicationTopics(publication);
  const topicMatches = getTopicMatchesForDisplay(publication, selectedTopic);

  return (
    <article className="publication-card">
      <div className="publication-meta">
        <span>{publication.region}</span>
        <span>{publication.institution}</span>
        <span>{formatDate(publication.publishedAt)}</span>
      </div>

      <h3>{publication.title}</h3>

      {publication.summary && (
        <p className="summary">{publication.summary}</p>
      )}

      {visibleTopics.length > 0 && (
        <div className="topic-list">
          {visibleTopics.map((topic) => (
            <span
              className={`topic-pill ${
                selectedTopic !== 'All' && valuesAreEqual(topic, selectedTopic)
                  ? 'selected-topic-pill'
                  : ''
              }`}
              key={topic}
            >
              {topic}
            </span>
          ))}
        </div>
      )}

      <p className="topic-debug">
        Card region: {publication.region || 'No region'} · Card institution:{' '}
        {publication.institution || 'No institution'} · Card topics:{' '}
        {visibleTopics.length > 0 ? visibleTopics.join(', ') : 'No topics'}
      </p>

      {topicMatches.length > 0 && (
        <div className="topic-match-list">
          {topicMatches.map((match) => (
            <div className="topic-match-item" key={`${publication.link || publication.title}-${match.topic}`}>
              <strong>{match.topic}</strong>
              <span>
                matched because:{' '}
                {match.keywords
                  ?.filter(shouldShowKeyword)
                  .slice(0, 6)
                  .join(', ') || 'topic keyword'}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="publication-links">
        {publication.link && (
          <a href={publication.link} target="_blank" rel="noreferrer">
            Open source
          </a>
        )}

        {publication.pdfLinks?.map((pdfLink, index) => (
          <a href={pdfLink} target="_blank" rel="noreferrer" key={`${pdfLink}-${index}`}>
            PDF {index + 1}
          </a>
        ))}
      </div>
    </article>
  );
}

function SystemOverview({ publications, topicSummary, warningSources, failedSources }) {
  return (
    <section className="system-overview">
      <div>
        <span className="overview-label">Publications</span>
        <strong>{publicationsData.totalPublications || publications.length}</strong>
        <p>unique items</p>
      </div>

      <div>
        <span className="overview-label">Sources</span>
        <strong>{publicationsData.successfulSources || 0}</strong>
        <p>{failedSources.length} failed</p>
      </div>

      <div>
        <span className="overview-label">Top topic</span>
        <strong className="overview-topic">
          {topicSummary[0]?.topic || 'No topics yet'}
        </strong>
        <p>{topicSummary[0] ? `${topicSummary[0].count} publications` : 'No topic data'}</p>
      </div>

      <div>
        <span className="overview-label">Warnings</span>
        <strong>{warningSources.length}</strong>
        <p>fallback parser</p>
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
            <span className="active-filter-pill" key={filter}>
              {filter}
            </span>
          ))}
        </div>
      </div>

      <button className="secondary-button" type="button" onClick={onClear}>
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
            className={`topic-insight-item ${
              valuesAreEqual(selectedTopic, item.topic) ? 'selected-topic-insight' : ''
            }`}
            key={item.topic}
            type="button"
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

      {items.length === 0 && (
        <p className="small-muted">No topics found for current filters.</p>
      )}
    </div>
  );
}

function SourceStatus({ warningSources, failedSources }) {
  return (
    <div className="source-status-list">
      <div className="source-status-item success">
        <span>Successful sources</span>
        <strong>{publicationsData.successfulSources || 0}</strong>
      </div>

      <div className="source-status-item warning">
        <span>Fallback parser</span>
        <strong>{warningSources.length}</strong>
      </div>

      <div className="source-status-item danger">
        <span>Failed sources</span>
        <strong>{failedSources.length}</strong>
      </div>
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

  const publications = publicationsData.publications || [];
  const topicSummary = publicationsData.topicSummary || [];
  const warningSources = publicationsData.warningSources || [];
  const failedSources = publicationsData.failedSources || [];

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

  const paginatedPublications = visiblePublications
    .slice(startIndex, endIndex)
    .filter((publication) => publicationMatchesAllFilters(publication, filters));

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
      <section className="hero executive-hero">
        <div>
          <p className="eyebrow">Regulatory intelligence monitor</p>
          <h1>RegPulse</h1>
          <p className="hero-copy">
            Daily monitoring of regulatory publications across EU, UK and US institutions,
            with topic tagging for risk, compliance and financial services teams.
          </p>

          <div className="hero-strip">
            <span>{publicationsData.successfulSources || 0} sources active</span>
            <span>{warningSources.length} fallback parser</span>
            <span>{failedSources.length} failed sources</span>
            <span>Updated {formatDate(publicationsData.generatedAt)}</span>
          </div>
        </div>
      </section>

      <SystemOverview
        publications={publications}
        topicSummary={topicSummary}
        warningSources={warningSources}
        failedSources={failedSources}
      />

      <section className="executive-layout">
        <div className="main-column">
          <section className="panel filter-panel">
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
                    <option value={region} key={region}>
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
                    <option value={institution} key={institution}>
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
                    <option value={topic} key={topic}>
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

          <section className="publication-list">
            <Pagination
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              totalResults={visiblePublications.length}
              startResult={startResult}
              endResult={endResult}
              onPrevious={goToPreviousPage}
              onNext={goToNextPage}
            />

            {paginatedPublications.map((publication, index) => (
              <PublicationCard
                publication={publication}
                selectedTopic={selectedTopic}
                key={makePublicationRenderKey(publication, index, filters)}
              />
            ))}

            {visiblePublications.length === 0 && (
              <div className="empty-state">
                No publications matched your filters.
              </div>
            )}

            <Pagination
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              totalResults={visiblePublications.length}
              startResult={startResult}
              endResult={endResult}
              onPrevious={goToPreviousPage}
              onNext={goToNextPage}
            />
          </section>
        </div>

        <aside className="insights-column">
          <section className="panel insights-panel sticky-panel">
            <div className="section-title-row">
              <div>
                <h2>Insights</h2>
                <p>Dynamic summary based on current filters.</p>
              </div>
            </div>

            <div className="insight-block">
              <div className="section-title-row compact">
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
              <div className="section-title-row compact">
                <h3>Keyword cloud</h3>
                <span>Click to filter</span>
              </div>

              <div className="keyword-cloud">
                {filteredKeywordSummary.slice(0, 35).map((item) => (
                  <button
                    className={`keyword-button ${
                      valuesAreEqual(selectedKeyword, item.keyword) ? 'selected-keyword' : ''
                    }`}
                    key={item.keyword}
                    type="button"
                    onClick={() => handleKeywordClick(item.keyword)}
                    style={{
                      fontSize: `${Math.min(24, 11 + item.count / 2)}px`
                    }}
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
              <div className="section-title-row compact">
                <h3>Source status</h3>
              </div>

              <SourceStatus
                warningSources={warningSources}
                failedSources={failedSources}
              />
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