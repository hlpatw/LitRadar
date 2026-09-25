import { sql } from 'drizzle-orm';
import {
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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
  createdAt: timestamp('_created_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  createdBy: varchar('_created_by', { length: 100 }),
  updatedAt: timestamp('_updated_at', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedBy: varchar('_updated_by', { length: 100 }),
});

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