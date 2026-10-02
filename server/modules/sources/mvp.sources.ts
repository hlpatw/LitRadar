// Explicit authoritative MVP source model.
//
// The MVP set is 13 entities confirmed against the authoritative workbook
// (语言习得_心理语言学_追踪源核实表.xlsx). Of these, only 7 are journals reachable
// today through the Crossref works API and are marked connectorStatus='ready'.
// The rest (one OA journal without a stable ISSN, three conferences, the arXiv
// preprint radar, and the ACL Anthology) are retained as authoritative MVP entries
// but scaffolded (connectorStatus='skeleton') until their connectors are built.

export type ConnectorType = 'crossref' | 'openalex' | 'rss' | 'html' | 'arxiv' | 'acl' | 'manual' | 'none';
export type ConnectorStatus = 'ready' | 'skeleton';
export type PollPolicy = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'manual';

export interface MvpSource {
  name: string;
  /** ISSN when the venue has one; null for conferences/preprints/libraries. */
  issn: string | null;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  sourceType: 'journal' | 'conference' | 'preprint' | 'proceedings';
  connectorType: ConnectorType;
  /** ready = wired & polled now; skeleton = planned, not implemented. */
  connectorStatus: ConnectorStatus;
  pollPolicy: PollPolicy;
  pageSize: number;
}

export const MVP_SOURCES: readonly MvpSource[] = [
  // --- 7 Crossref-runnable journal whitelist (ready) ---
  { name: 'Journal of Memory and Language', issn: '0749-596X', priority: 'P0', sourceType: 'journal', connectorType: 'crossref', connectorStatus: 'ready', pollPolicy: 'weekly', pageSize: 25 },
  { name: 'Cognition', issn: '0010-0277', priority: 'P0', sourceType: 'journal', connectorType: 'crossref', connectorStatus: 'ready', pollPolicy: 'weekly', pageSize: 25 },
  { name: 'Journal of Child Language', issn: '0305-0009', priority: 'P0', sourceType: 'journal', connectorType: 'crossref', connectorStatus: 'ready', pollPolicy: 'weekly', pageSize: 25 },
  { name: 'First Language', issn: '0142-7237', priority: 'P0', sourceType: 'journal', connectorType: 'crossref', connectorStatus: 'ready', pollPolicy: 'weekly', pageSize: 25 },
  { name: 'Applied Psycholinguistics', issn: '0142-7164', priority: 'P0', sourceType: 'journal', connectorType: 'crossref', connectorStatus: 'ready', pollPolicy: 'weekly', pageSize: 25 },
  { name: 'Language Acquisition', issn: '1048-9223', priority: 'P1', sourceType: 'journal', connectorType: 'crossref', connectorStatus: 'ready', pollPolicy: 'biweekly', pageSize: 25 },
  { name: 'Bilingualism: Language and Cognition', issn: '1366-7289', priority: 'P1', sourceType: 'journal', connectorType: 'crossref', connectorStatus: 'ready', pollPolicy: 'biweekly', pageSize: 25 },
  // --- 6 authoritative-but-skeleton MVP entries ---
  { name: 'Language Development Research', issn: null, priority: 'P0', sourceType: 'journal', connectorType: 'rss', connectorStatus: 'skeleton', pollPolicy: 'weekly', pageSize: 25 },
  { name: 'AMLaP', issn: null, priority: 'P0', sourceType: 'conference', connectorType: 'html', connectorStatus: 'skeleton', pollPolicy: 'monthly', pageSize: 25 },
  { name: 'HSP / CUNY Human Sentence Processing', issn: null, priority: 'P0', sourceType: 'conference', connectorType: 'html', connectorStatus: 'skeleton', pollPolicy: 'monthly', pageSize: 25 },
  { name: 'BUCLD', issn: null, priority: 'P0', sourceType: 'conference', connectorType: 'html', connectorStatus: 'skeleton', pollPolicy: 'monthly', pageSize: 25 },
  { name: 'arXiv cs.CL / stat.ML / q-bio.NC', issn: null, priority: 'P3', sourceType: 'preprint', connectorType: 'arxiv', connectorStatus: 'skeleton', pollPolicy: 'daily', pageSize: 25 },
  { name: 'ACL Anthology', issn: null, priority: 'P3', sourceType: 'proceedings', connectorType: 'acl', connectorStatus: 'skeleton', pollPolicy: 'weekly', pageSize: 25 },
] as const;

/** The 7 journals actually pollable via Crossref right now. */
export const CROSSREF_READY_ISSNS: readonly string[] = MVP_SOURCES.filter(
  (s) => s.connectorType === 'crossref' && s.connectorStatus === 'ready',
).map((s) => s.issn!);

export function getMvpSourceByIssn(issn: string): MvpSource | undefined {
  const norm = issn.trim().toLowerCase();
  return MVP_SOURCES.find((s) => s.issn?.toLowerCase() === norm);
}

export function isCrossrefReady(issn: string): boolean {
  const norm = issn.trim().toLowerCase();
  return CROSSREF_READY_ISSNS.some((x) => x.toLowerCase() === norm);
}
