// Maps Crossref Work API items into our paper shape. Pure / side-effect free -> unit-testable.

export interface CrossrefWork {
  DOI?: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string }>;
  abstract?: string;
  issued?: { 'date-parts'?: Array<[number?, number?, number?]> };
  URL?: string;
  type?: string;
  published?: { 'date-parts'?: Array<[number?, number?, number?]> };
}

export interface MappedPaper {
  doi: string;
  title: string;
  authors: string | null;
  abstractText: string | null;
  publishedDate: string | null; // YYYY-MM-DD
  url: string | null;
}

function cleanAbstract(raw: string): string | null {
  if (!raw) return null;
  // Strip JATS tags, e.g. <jats:p>...</jats:p>.
  const stripped = raw.replace(/<[^>]+>/g, '').trim();
  return stripped.length > 0 ? stripped : null;
}

function formatAuthors(author?: Array<{ given?: string; family?: string }>): string | null {
  if (!author || author.length === 0) return null;
  const names = author
    .map((a) => [a.given, a.family].filter(Boolean).join(' ').trim())
    .filter((n) => n.length > 0);
  return names.length > 0 ? names.join(', ') : null;
}

function toDateString(work: CrossrefWork): string | null {
  const parts =
    work.issued?.['date-parts']?.[0] ?? work.published?.['date-parts']?.[0];
  if (!parts || !parts[0]) return null;
  const [y, m, d] = parts;
  const mm = String(m ?? 1).padStart(2, '0');
  const dd = String(d ?? 1).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

export function mapCrossrefWork(work: CrossrefWork): MappedPaper | null {
  const doi = (work.DOI || '').trim().toLowerCase();
  const title = (work.title?.[0] || '').trim();
  if (!doi || !title) return null; // skip records we cannot dedupe/title

  return {
    doi,
    title,
    authors: formatAuthors(work.author),
    abstractText: cleanAbstract(work.abstract || ''),
    publishedDate: toDateString(work),
    url: work.URL || `https://doi.org/${doi}`,
  };
}
