import type { ProcessDefinition } from "./types.js";
import type { Incident } from "./incident.js";

export interface ProcessEnvelope {
  sys: ProcessSystem;
  input: Record<string, unknown>;
  steps: Record<string, unknown>;
  vars: Record<string, unknown>;
}

export interface ProcessSystem {
  process_id: string;
  instance_id: string;
  owner: string;
  process_owner: string;
  owner_identifier: string;
  initiator: string;
  project_id: string;
  started_at: string;
  is_dev: boolean;
  error_count?: number;
}

export interface VariablesContext extends ProcessEnvelope {
  history: string[];
}

export interface StepOutput {
  [key: string]: unknown;
}

export interface ProcessRunOptions {
  definition: ProcessDefinition;
  input?: Record<string, unknown>;
  owner?: ProcessOwner;
  seeds?: ProcessSeeds;
}

export interface ProcessOwner {
  owner: string;
  process_owner?: string;
  owner_identifier?: string;
  project_id: string;
  owner_type?: "user" | "org";
}

export interface ProcessSeeds {
  steps?: Record<string, unknown>;
  vars?: Record<string, unknown>;
  history?: string[];
}

export interface ProcessRunResult {
  status: "completed" | "failed" | "waiting" | "timeout";
  context: VariablesContext;
  incidents: Incident[];
  output?: Record<string, unknown>;
}
