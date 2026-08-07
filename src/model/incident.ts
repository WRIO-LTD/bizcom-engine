export type IncidentStatus = "open" | "resolved" | "exhausted";

export type IncidentType =
  | "step_failure"
  | "timeout"
  | "expression_error"
  | "unregistered_action"
  | "validation_error";

export type IncidentSeverity = "error" | "warning" | "fatal";

export interface Incident {
  instance_id: string;
  step_id: string;
  type: IncidentType;
  message: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  attempts: number;
  max_attempts: number;
  created_at: string;
  resolved_at?: string;
  details?: Record<string, unknown>;
}

export interface CompensationResult {
  step_id: string;
  output: Record<string, unknown>;
  duration_ms: number;
}
