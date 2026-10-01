// Explicit 13-source MVP connector/polling configuration.
//
// These are the sources Phase-1 actually polls. Selection rule: sources that are
// (a) journals with a known ISSN, (b) confirmed in the authoritative workbook
// (语言习得_心理语言学_追踪源核实表.xlsx), and (c) reachable through Crossref works API.
// Other sources (conferences, preprints, P3 radar) are scaffolded but not yet polled.
//
// Each entry maps to a legacy journal row by ISSN (natural key) so we never depend on
// environment-specific UUIDs.

export type ConnectorType = 'crossref' | 'openalex' | 'rss' | 'html' | 'manual' | 'none';
export type PollPolicy = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'manual';

export interface MvpSource {
  /** Human-readable canonical name (must match the legacy journal row). */
  name: string;
  /** ISSN used both as the external key for Crossref and to locate the legacy row. */
  issn: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  connectorType: ConnectorType;
  pollPolicy: PollPolicy;
  /** Crossref rows-per-page page size for incremental fetches. */
  pageSize: number;
}

export const MVP_SOURCES: readonly MvpSource[] = [
  { name: 'Journal of Memory and Language', issn: '0749-596X', priority: 'P0', connectorType: 'crossref', pollPolicy: 'weekly', pageSize: 25 },
  { name: 'Cognition', issn: '0010-0277', priority: 'P0', connectorType: 'crossref', pollPolicy: 'weekly', pageSize: 25 },
  { name: 'Applied Psycholinguistics', issn: '0142-7164', priority: 'P0', connectorType: 'crossref', pollPolicy: 'weekly', pageSize: 25 },
  { name: 'Journal of Child Language', issn: '0305-0009', priority: 'P0', connectorType: 'crossref', pollPolicy: 'weekly', pageSize: 25 },
  { name: 'Bilingualism: Language and Cognition', issn: '1366-7289', priority: 'P1', connectorType: 'crossref', pollPolicy: 'weekly', pageSize: 25 },
  { name: 'Language Learning', issn: '0023-8333', priority: 'P1', connectorType: 'crossref', pollPolicy: 'biweekly', pageSize: 25 },
  { name: 'Studies in Second Language Acquisition', issn: '0272-2631', priority: 'P1', connectorType: 'crossref', pollPolicy: 'biweekly', pageSize: 25 },
  { name: 'Second Language Research', issn: '0267-6583', priority: 'P1', connectorType: 'crossref', pollPolicy: 'biweekly', pageSize: 25 },
  { name: 'Language', issn: '0097-8507', priority: 'P1', connectorType: 'crossref', pollPolicy: 'monthly', pageSize: 25 },
  { name: 'Cognitive Science', issn: '0364-0213', priority: 'P2', connectorType: 'crossref', pollPolicy: 'monthly', pageSize: 25 },
  { name: 'Psychonomic Bulletin & Review', issn: '1069-9384', priority: 'P2', connectorType: 'crossref', pollPolicy: 'monthly', pageSize: 25 },
  { name: 'Memory & Cognition', issn: '0090-502X', priority: 'P2', connectorType: 'crossref', pollPolicy: 'monthly', pageSize: 25 },
  { name: 'Journal of Experimental Psychology: Learning, Memory, and Cognition', issn: '0278-7393', priority: 'P2', connectorType: 'crossref', pollPolicy: 'monthly', pageSize: 25 },
] as const;

export function getMvpSourceByIssn(issn: string): MvpSource | undefined {
  const norm = issn.trim().toLowerCase();
  return MVP_SOURCES.find((s) => s.issn.toLowerCase() === norm);
}
