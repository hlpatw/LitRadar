import { sql } from 'drizzle-orm';
import {
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const journals = pgTable('journals', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 300 }).notNull(),
  abbreviation: varchar('abbreviation', { length: 100 }),
  sourceType: varchar('source_type', { length: 20 }).notNull().default('journal'),
  priority: varchar('priority', { length: 10 }).notNull().default('P2'),
  category: varchar('category', { length: 200 }),
  description: text('description'),
  url: varchar('url', { length: 500 }),
  updateFrequency: varchar('update_frequency', { length: 200 }),
  keywordsFilter: text('keywords_filter'),
  issn: varchar('issn', { length: 50 }),
  // --- Phase-1 source model additions (reversible, backward compatible) ---
  // Self-referential hierarchy: parent source (e.g. a venue/conference under a society).
  parentId: uuid('parent_id'),
  // active = tracked; archived = retired/old-only source kept adjacent, never deleted.
  status: varchar('status', { length: 20 }).notNull().default('active'),
  // How we ingest: crossref | openalex | rss | html | manual | none
  connectorType: varchar('connector_type', { length: 30 }),
  // How often we poll: daily | weekly | biweekly | monthly | manual
  pollPolicy: varchar('poll_policy', { length: 20 }),
  // Connector bookkeeping: external identifier (e.g. ISSN / OpenAlex source id).
  externalId: varchar('external_id', { length: 200 }),
  lastSyncedAt: timestamp('last_synced_at', { precision: 3, withTimezone: true }),
  createdAt: timestamp('_created_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  createdBy: varchar('_created_by', { length: 100 }),
  updatedAt: timestamp('_updated_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedBy: varchar('_updated_by', { length: 100 }),
});

export const papers = pgTable('papers', {
  id: uuid('id').primaryKey().defaultRandom(),
  journalId: uuid('journal_id'),
  title: varchar('title', { length: 500 }).notNull(),
  authors: text('authors'),
  doi: varchar('doi', { length: 200 }),
  keywords: text('keywords'),
  abstractText: text('abstract_text'),
  methods: text('methods'),
  conclusions: text('conclusions'),
  publishedDate: date('published_date'),
  url: varchar('url', { length: 500 }),
  fetchedAt: timestamp('fetched_at', { precision: 3, withTimezone: true }),
  // Phase-1: which connector run inserted/updated this paper (provenance).
  sourceRunId: uuid('source_run_id'),
  createdAt: timestamp('_created_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  createdBy: varchar('_created_by', { length: 100 }),
  updatedAt: timestamp('_updated_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedBy: varchar('_updated_by', { length: 100 }),
}, (table) => [
  // DOI is a natural key: one row per DOI. Upsert relies on this partial unique index.
  uniqueIndex('papers_doi_unique').on(table.doi).where(sql`doi IS NOT NULL AND doi <> ''`),
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  email: varchar('email', { length: 200 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 200 }).notNull(),
  displayName: varchar('display_name', { length: 200 }),
  createdAt: timestamp('created_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const userFavorites = pgTable('user_favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id', { length: 100 }).notNull(),
  paperId: uuid('paper_id').notNull(),
  createdAt: timestamp('_created_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  createdBy: varchar('_created_by', { length: 100 }),
  updatedAt: timestamp('_updated_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedBy: varchar('_updated_by', { length: 100 }),
}, (table) => [
  uniqueIndex('idx_user_fav_user_paper').on(table.userId, table.paperId),
]);

export const readingChecklist = pgTable('reading_checklist', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id', { length: 100 }).notNull(),
  paperId: uuid('paper_id'),
  titleOverride: varchar('title_override', { length: 500 }),
  status: varchar('status', { length: 20 }).notNull().default('todo'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('_created_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  createdBy: varchar('_created_by', { length: 100 }),
  updatedAt: timestamp('_updated_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedBy: varchar('_updated_by', { length: 100 }),
});

export const userNotes = pgTable('user_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id', { length: 100 }).notNull(),
  content: text('content').notNull(),
  paperId: uuid('paper_id'),
  createdAt: timestamp('_created_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  createdBy: varchar('_created_by', { length: 100 }),
  updatedAt: timestamp('_updated_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedBy: varchar('_updated_by', { length: 100 }),
});

export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id', { length: 100 }).notNull().unique(),
  fieldOfStudy: text('field_of_study'),
  interestedKeywords: text('interested_keywords'),
  createdAt: timestamp('_created_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  createdBy: varchar('_created_by', { length: 100 }),
  updatedAt: timestamp('_updated_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedBy: varchar('_updated_by', { length: 100 }),
});

export const journalsTable = journals;
export const papersTable = papers;
export const readingChecklistTable = readingChecklist;
export const userFavoritesTable = userFavorites;
export const userNotesTable = userNotes;
export const userSettingsTable = userSettings;
// Phase-1: extensible source aliases / venue lineage (former names, ISSNs, parent venues).
export const sourceAliases = pgTable('source_aliases', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull(),
  aliasName: varchar('alias_name', { length: 300 }).notNull(),
  // former_name | abbreviation | venue | issn
  aliasType: varchar('alias_type', { length: 20 }).notNull().default('former_name'),
  issn: varchar('issn', { length: 50 }),
  note: text('note'),
  createdAt: timestamp('_created_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('source_aliases_source_name_ux').on(table.sourceId, table.aliasName),
]);

// Phase-1: one row per incremental connector run (provenance / sync bookkeeping).
export const sourceSyncRuns = pgTable('source_sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull(),
  connectorType: varchar('connector_type', { length: 30 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('running'),
  startedAt: timestamp('started_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  finishedAt: timestamp('finished_at', { precision: 3, withTimezone: true }),
  fetchedCount: integer('fetched_count').notNull().default(0),
  insertedCount: integer('inserted_count').notNull().default(0),
  updatedCount: integer('updated_count').notNull().default(0),
  message: text('message'),
}, (table) => [
  index('source_sync_runs_source_idx').on(table.sourceId),
]);

export const sourceAliasesTable = sourceAliases;
export const sourceSyncRunsTable = sourceSyncRuns;