import {
  boolean,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const sessionsTable = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  color: text("color").default("#3b82f6").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const nodesTable = pgTable("nodes", {
  id: text("id").primaryKey(),
  sessionId: uuid("session_id").notNull(),
  ownerId: text("owner_id"),
  lockedToRole: text("locked_to_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const eventsTable = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  seqNum: serial("seq_num").notNull(),
  sessionId: uuid("session_id").notNull(),
  eventType: text("event_type").notNull(),
  nodeId: text("node_id"),
  userId: text("user_id"),
  payload: jsonb("payload"),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
});

export const tasksTable = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull(),
  nodeId: text("node_id").notNull().unique(),
  authorId: text("author_id"),
  title: text("title").notNull(),
  intentType: text("intent_type").notNull(),
  confirmedByAi: boolean("confirmed_by_ai").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Session = typeof sessionsTable.$inferSelect;
export type User = typeof usersTable.$inferSelect;
export type NodeRow = typeof nodesTable.$inferSelect;
export type EventRow = typeof eventsTable.$inferSelect;
export type Task = typeof tasksTable.$inferSelect;
