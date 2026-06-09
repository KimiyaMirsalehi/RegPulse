import React, { useEffect, useMemo, useState } from 'react';
import publicationsData from '../data/publications.json';
import './App.css';

const ITEMS_PER_PAGE = 10;

const EMPTY_FILTERS = {
  search: '',
  region: 'All',
  institution: 'All',
  source: 'All',
  topic: 'All',
  keyword: 'All',
  dateRange: 'All'
};

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatDate(value) {
  if (!value) {
    return 'No date';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'No date';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function formatDateTime(value) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

function getDateThreshold(dateRange) {
  if (dateRange === '7 days') {
    return 7;
  }

  if (dateRange === '30 days') {
    return 30;
  }

  if (dateRange === '90 days') {
    return 90;
  }

  return null;
}

function publicationMatchesDateRange(publication, dateRange) {
  const days = getDateThreshold(dateRange);

  if (!days) {
    return true;
  }

  if (!publication.publishedAt) {
    return false;
  }

  const publishedDate = new Date(publication.publishedAt);

  if (Number.isNaN(publishedDate.getTime())) {
    return false;
  }

  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);

  return publishedDate >= threshold;
}

function makePublicationRenderKey(publication, index, filters) {
  return [
    publication.id,
    publication.url,
    publication.title,
    publication.sourceId,
    publication.publishedAt,
    filters.region,
    filters.institution,
    filters.source,
    filters.topic,
    filters.keyword,
    filters.dateRange,
    filters.search,
    index
  ].join('|');
}

function getStatusLabel(status) {
  if (status === 'success') {
    return 'OK';
  }

  if (status === 'warning') {
    return 'Warning';
  }

  if (status === 'failed') {
    return 'Failed';
  }

  return 'Unknown';
}

function PublicationCard({ publication, onTopicClick, onKeywordClick }) {
  const visibleTopics = safeArray(publication.topics);
  const visibleKeywords = safeArray(publication.matchedKeywords).slice(0, 6);

  const webpageUrl =
    publication.url ||
    publication.sourcePageUrl ||
    publication.officialSourcePage ||
    '';

  const sourcePageUrl =
    publication.sourcePageUrl ||
    publication.officialSourcePage ||
    '';

  const pdfLinks = safeArray(publication.pdfLinks).filter(Boolean);

  return (
    <article className="publication-card">
      <div className="publication-meta">
        <span>{publication.region || 'Unknown region'}</span>
        <span>{publication.institution || publication.sourceName || 'Unknown institution'}</span>
        <span>{formatDate(publication.publishedAt)}</span>
      </div>

      <h3>{publication.title}</h3>

      {publication.summary ? (
        <p className="publication-summary">{publication.summary}</p>
      ) : (
        <p className="publication-summary muted">No summary provided by source.</p>
      )}

      {visibleTopics.length > 0 && (
        <div className="topic-row">
          {visibleTopics.map((topic) => (
            <button
              type="button"
              className="topic-pill"
              key={topic}
              onClick={() => onTopicClick(topic)}
            >
              {topic}
            </button>
          ))}
        </div>
      )}

      {visibleKeywords.length > 0 && (
        <div className="keyword-row">
          {visibleKeywords.map((keyword) => (
            <button
              type="button"
              className="keyword-chip"
              key={keyword}
              onClick={() => onKeywordClick(keyword)}
            >
              {keyword}
            </button>
          ))}
        </div>
      )}

      <div className="publication-actions">
        {webpageUrl && (
          <a
            className="publication-link primary"
            href={webpageUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open webpage
          </a>
        )}

        {pdfLinks.map((pdfLink, index) => (
          <a
            key={pdfLink}
            className="publication-link"
            href={pdfLink}
            target="_blank"
            rel="noreferrer"
          >
            Download file {pdfLinks.length > 1 ? index + 1 : ''}
          </a>
        ))}

        {sourcePageUrl && sourcePageUrl !== webpageUrl && (
          <a
            className="publication-link secondary"
            href={sourcePageUrl}
            target="_blank"
            rel="noreferrer"
          >
            Source page
          </a>
        )}
      </div>
    </article>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function App() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const publications = safeArray(publicationsData.publications);
  const topicSummary = safeArray(publicationsData.topicSummary || publicationsData.topicsSummary);
  const keywordCloud = safeArray(publicationsData.keywordCloud);
  const sourceStatus = safeArray(publicationsData.sourceStatus);

  const regions = useMemo(
    () => ['All', ...uniqueSorted(publications.map((publication) => publication.region || 'Unknown'))],
    [publications]
  );

  const institutions = useMemo(
    () => [
      'All',
      ...uniqueSorted(
        publications.map(
          (publication) =>
            publication.institution || publication.sourceName || 'Unknown'
        )
      )
    ],
    [publications]
  );

  const sources = useMemo(
    () => ['All', ...uniqueSorted(publications.map((publication) => publication.sourceName || 'Unknown'))],
    [publications]
  );

  const topics = useMemo(
    () => [
      'All',
      ...uniqueSorted(
        publications.flatMap((publication) => safeArray(publication.topics))
      )
    ],
    [publications]
  );

  const keywords = useMemo(
    () => [
      'All',
      ...uniqueSorted(
        publications.flatMap((publication) => safeArray(publication.matchedKeywords))
      ).slice(0, 100)
    ],
    [publications]
  );

  const visiblePublications = useMemo(() => {
    const searchTerm = filters.search.trim().toLowerCase();
    const selectedKeyword = filters.keyword.toLowerCase();

    return publications.filter((publication) => {
      const publicationInstitution =
        publication.institution || publication.sourceName || 'Unknown';
      const publicationSource = publication.sourceName || 'Unknown';
      const publicationRegion = publication.region || 'Unknown';

      const publicationText = [
        publication.title,
        publication.summary,
        publication.url,
        publication.sourceName,
        publication.institution,
        publication.region,
        publication.jurisdiction,
        safeArray(publication.topics).join(' '),
        safeArray(publication.matchedKeywords).join(' ')
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !searchTerm || publicationText.includes(searchTerm);
      const matchesRegion = filters.region === 'All' || publicationRegion === filters.region;
      const matchesInstitution =
        filters.institution === 'All' || publicationInstitution === filters.institution;
      const matchesSource = filters.source === 'All' || publicationSource === filters.source;
      const matchesTopic =
        filters.topic === 'All' || safeArray(publication.topics).includes(filters.topic);
      const matchesKeyword =
        filters.keyword === 'All' ||
        safeArray(publication.matchedKeywords)
          .map((keyword) => String(keyword).toLowerCase())
          .includes(selectedKeyword);
      const matchesDate = publicationMatchesDateRange(publication, filters.dateRange);

      return (
        matchesSearch &&
        matchesRegion &&
        matchesInstitution &&
        matchesSource &&
        matchesTopic &&
        matchesKeyword &&
        matchesDate
      );
    });
  }, [publications, filters]);

  const totalPages = Math.max(1, Math.ceil(visiblePublications.length / ITEMS_PER_PAGE));

  const paginatedPublications = visiblePublications.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function updateFilter(name, value) {
    setFilters((current) => ({
      ...current,
      [name]: value
    }));
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
  }

  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'search') {
      return value.trim() !== '';
    }

    return value !== 'All';
  }).length;

  const successfulSources = publicationsData.successfulSources ?? 0;
  const warningSources = publicationsData.warningSources ?? 0;
  const failedSources = publicationsData.failedSources ?? 0;

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Regulatory intelligence dashboard</p>
          <h1>RegPulse</h1>
          <p className="hero-copy">
            Daily regulatory publications from EU, UK, US and global bodies, tagged by topic and ready for review.
          </p>
        </div>

        <div className="hero-card">
          <span>Updated</span>
          <strong>{formatDateTime(publicationsData.generatedAt)}</strong>
        </div>
      </section>

      <section className="system-overview">
        <div>
          <span>Total publications</span>
          <strong>{publicationsData.totalPublications || publications.length}</strong>
        </div>
        <div>
          <span>Sources monitored</span>
          <strong>{publicationsData.sourceCount || sourceStatus.length}</strong>
        </div>
        <div>
          <span>Healthy sources</span>
          <strong>{successfulSources}</strong>
        </div>
        <div>
          <span>Warnings</span>
          <strong>{warningSources}</strong>
        </div>
        <div>
          <span>Failed</span>
          <strong>{failedSources}</strong>
        </div>
      </section>

      <section className="filters-panel">
        <div className="filters-header">
          <div>
            <h2>Filters</h2>
            <p>
              Showing {visiblePublications.length} of {publications.length} publications.
            </p>
          </div>

          {activeFilterCount > 0 && (
            <button type="button" className="clear-button" onClick={clearFilters}>
              Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
            </button>
          )}
        </div>

        <label className="search-field">
          <span>Search</span>
          <input
            type="search"
            placeholder="Search title, summary, institution, topic or keyword..."
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
          />
        </label>

        <div className="filter-grid">
          <SelectField
            label="Region"
            value={filters.region}
            onChange={(value) => updateFilter('region', value)}
            options={regions}
          />

          <SelectField
            label="Institution"
            value={filters.institution}
            onChange={(value) => updateFilter('institution', value)}
            options={institutions}
          />

          <SelectField
            label="Source"
            value={filters.source}
            onChange={(value) => updateFilter('source', value)}
            options={sources}
          />

          <SelectField
            label="Topic"
            value={filters.topic}
            onChange={(value) => updateFilter('topic', value)}
            options={topics}
          />

          <SelectField
            label="Keyword"
            value={filters.keyword}
            onChange={(value) => updateFilter('keyword', value)}
            options={keywords}
          />

          <SelectField
            label="Published"
            value={filters.dateRange}
            onChange={(value) => updateFilter('dateRange', value)}
            options={['All', '7 days', '30 days', '90 days']}
          />
        </div>
      </section>

      <section className="executive-layout">
        <div className="main-column">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Publication feed</p>
              <h2>Latest updates</h2>
            </div>

            <p className="page-indicator">
              Page {page} of {totalPages}
            </p>
          </div>

          <div className="publication-list">
            {paginatedPublications.length > 0 ? (
              paginatedPublications.map((publication, index) => (
                <PublicationCard
                  key={makePublicationRenderKey(publication, index, filters)}
                  publication={publication}
                  onTopicClick={(topic) => updateFilter('topic', topic)}
                  onKeywordClick={(keyword) => updateFilter('keyword', keyword)}
                />
              ))
            ) : (
              <div className="empty-state">
                <h3>No publications match the selected filters.</h3>
                <p>Clear filters or broaden the search.</p>
              </div>
            )}
          </div>

          <div className="pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>

            <span>
              {page} / {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
            </button>
          </div>
        </div>

        <aside className="insights-column">
          <section className="panel">
            <h2>Topic pulse</h2>
            <div className="topic-summary-list">
              {topicSummary.slice(0, 12).map((item) => {
                const maxCount = topicSummary[0]?.count || 1;
                const width = `${Math.max(8, (item.count / maxCount) * 100)}%`;

                return (
                  <button
                    type="button"
                    className="topic-bar"
                    key={item.topic}
                    onClick={() => updateFilter('topic', item.topic)}
                  >
                    <span>
                      <strong>{item.topic}</strong>
                      <em>{item.count}</em>
                    </span>
                    <div>
                      <i style={{ width }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <h2>Keyword cloud</h2>
            <div className="keyword-cloud">
              {keywordCloud.slice(0, 35).map((item) => (
                <button
                  type="button"
                  key={item.keyword}
                  onClick={() => updateFilter('keyword', item.keyword)}
                >
                  {item.keyword}
                  <span>{item.count}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Source status</h2>
            <div className="source-status-list">
              {sourceStatus.map((source) => (
                <div className="source-status-item" key={source.id}>
                  <div>
                    <strong>{source.name}</strong>
                    <span>{source.itemCount} items · {source.parserMode || 'n/a'}</span>
                  </div>
                  <em className={`status-${source.status}`}>
                    {getStatusLabel(source.status)}
                  </em>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <footer className="app-footer">
        RegPulse by KM
      </footer>
    </main>
  );
}

export default App;