import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CandidateInput, Chunk, Plan, TraceStep } from "./roles";

export interface StoredRun {
  id: string;
  createdAt: string;
  input: CandidateInput;
  trace: TraceStep[];
  chunks: Chunk[];
  plan: Plan;
}

const dataDirectory = path.join(process.cwd(), "data");
const runsFile = path.join(dataDirectory, "runs.json");
let writeQueue: Promise<void> = Promise.resolve();

async function readRuns(): Promise<StoredRun[]> {
  try {
    const contents = await readFile(runsFile, "utf8");
    const parsed: unknown = JSON.parse(contents);
    if (!Array.isArray(parsed)) {
      throw new Error("Local run store must contain a JSON array");
    }
    return parsed as StoredRun[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeRuns(runs: StoredRun[]) {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryFile = path.join(dataDirectory, `runs-${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryFile, JSON.stringify(runs, null, 2), "utf8");
    await rename(temporaryFile, runsFile);
  } catch (error) {
    await rm(temporaryFile, { force: true });
    throw error;
  }
}

export async function listLocalRuns(): Promise<StoredRun[]> {
  await writeQueue;
  return readRuns();
}

export async function getLocalRun(id: string): Promise<StoredRun | undefined> {
  const runs = await listLocalRuns();
  return runs.find((run) => run.id === id);
}

export async function saveLocalRun(
  run: Omit<StoredRun, "id" | "createdAt">,
): Promise<StoredRun> {
  const saved: StoredRun = {
    ...run,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const operation = writeQueue.then(async () => {
    const runs = await readRuns();
    await writeRuns([saved, ...runs]);
  });
  writeQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  await operation;
  return saved;
}
