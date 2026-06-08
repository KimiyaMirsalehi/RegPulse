import { useMemo, useState } from 'react';
import publicationsData from '../data/publications.json';

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
    if (Array.isArray(publication.topics)) {
      publication.topics.forEach((topic) => topics.add(topic));
    }
  });

  return Array.from(topics).sort();
}

function PublicationCard({ publication }) {
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

      {publication.topics?.length > 0 && (
        <div className="topic-list">
          {publication.topics.map((topic) => (
            <span className="topic-pill" key={topic}>
              {topic}
            </span>
          ))}
        </div>
      )}

      {publication.matchedKeywords?.length > 0 && (
        <p className="matched-keywords">
          Matched keywords: {publication.matchedKeywords.slice(0, 8).join(', ')}
        </p>
      )}

      <div className="publication-links">
        {publication.link && (
          <a href={publication.link} target="_blank" rel="noreferrer">
            Open source
          </a>
        )}

        {publication.pdfLinks?.map((pdfLink, index) => (
          <a href={pdfLink} target="_blank" rel="noreferrer" key={pdfLink}>
            PDF {index + 1}
          </a>
        ))}
      </div>
    </article>
  );
}

function SummaryCard({ label, value, helper }) {
  return (
    <div className="summary-card">
      <p>{label}</p>
      <strong>{value}</strong>
      {helper && <span>{helper}</span>}
    </div>
  );
}

function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [selectedTopic, setSelectedTopic] = useState('All');

  const publications = publicationsData.publications || [];
  const topicSummary = publicationsData.topicSummary || [];
  const keywordSummary = publicationsData.keywordSummary || [];

  const regions = useMemo(() => getUniqueValues(publications, 'region'), [publications]);
  const topics = useMemo(() => getUniqueTopics(publications), [publications]);

  const filteredPublications = useMemo(() => {
    const normalisedSearch = searchTerm.trim().toLowerCase();

    return publications.filter((publication) => {
      const matchesSearch =
        !normalisedSearch ||
        [
          publication.title,
          publication.summary,
          publication.institution,
          publication.sourceName,
          ...(publication.topics || []),
          ...(publication.matchedKeywords || [])
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalisedSearch);

      const matchesRegion =
        selectedRegion === 'All' || publication.region === selectedRegion;

      const matchesTopic =
        selectedTopic === 'All' || publication.topics?.includes(selectedTopic);

      return matchesSearch && matchesRegion && matchesTopic;
    });
  }, [publications, searchTerm, selectedRegion, selectedTopic]);

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">Regulatory intelligence monitor</p>
          <h1>RegPulse</h1>
          <p className="hero-copy">
            Daily monitoring of regulatory publications across EU, UK and US institutions,
            with topic tagging for risk, compliance and financial services teams.
          </p>
        </div>

        <div className="hero-status">
          <span>Last updated</span>
          <strong>{formatDate(publicationsData.generatedAt)}</strong>
        </div>
      </section>

      <section className="summary-grid">
        <SummaryCard
          label="Publications"
          value={publicationsData.totalPublications || publications.length}
          helper="unique items collected"
        />
        <SummaryCard
          label="Sources"
          value={publicationsData.successfulSources || 0}
          helper={`${publicationsData.failedSources?.length || 0} failed`}
        />
        <SummaryCard
          label="Top topic"
          value={topicSummary[0]?.topic || 'No topics yet'}
          helper={topicSummary[0] ? `${topicSummary[0].count} publications` : ''}
        />
        <SummaryCard
          label="Warnings"
          value={publicationsData.warningSources?.length || 0}
          helper="sources using fallback parser"
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Explore publications</h2>
            <p>
              Search and filter the latest collected regulatory updates.
            </p>
          </div>
          <strong>{filteredPublications.length} results</strong>
        </div>

        <div className="filters">
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
            Topic
            <select
              value={selectedTopic}
              onChange={(event) => setSelectedTopic(event.target.value)}
            >
              <option value="All">All topics</option>
              {topics.map((topic) => (
                <option value={topic} key={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <h2>Top topics</h2>
          <div className="ranked-list">
            {topicSummary.slice(0, 10).map((item) => (
              <div className="ranked-item" key={item.topic}>
                <span>{item.topic}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Keyword cloud</h2>
          <div className="keyword-cloud">
            {keywordSummary.slice(0, 35).map((item) => (
              <span
                key={item.keyword}
                style={{
                  fontSize: `${Math.min(26, 12 + item.count / 2)}px`
                }}
              >
                {item.keyword}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="publication-list">
        {filteredPublications.slice(0, 100).map((publication) => (
          <PublicationCard publication={publication} key={publication.id} />
        ))}

        {filteredPublications.length === 0 && (
          <div className="empty-state">
            No publications matched your filters.
          </div>
        )}

        {filteredPublications.length > 100 && (
          <div className="limit-note">
            Showing first 100 results. Use search or filters to narrow the list.
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
