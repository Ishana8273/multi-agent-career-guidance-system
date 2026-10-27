import {
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const candidates = pgTable("candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  currentRole: text("current_role").notNull(),
  targetRole: text("target_role").notNull(),
  years: text("years").notNull(),
  stack: text("stack").notNull(),
  focus: text("focus").notNull(),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const runs = pgTable("runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  candidateId: uuid("candidate_id"),
  input: jsonb("input").notNull(),
  trace: jsonb("trace").notNull(),
  chunks: jsonb("chunks").notNull(),
  plan: jsonb("plan").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const memoryItems = pgTable("memory_items", {
  id: serial("id").primaryKey(),
  runId: uuid("run_id"),
  label: text("label").notNull(),
  value: text("value").notNull(),
  source: text("source").notNull(),
  score: text("score").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Candidate = typeof candidates.$inferSelect;
export type Run = typeof runs.$inferSelect;
