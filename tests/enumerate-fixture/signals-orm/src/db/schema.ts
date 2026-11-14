// The tables.
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const notes = pgTable('notes', {
  id: serial('id').primaryKey(),
  body: text('body').notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const feedback = pgTable('feedback', {
  id: serial('id').primaryKey(),
  body: text('body').notNull(),
});
