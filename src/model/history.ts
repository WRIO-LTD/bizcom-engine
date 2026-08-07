export type HistoryEventType =
  | "instance_started"
  | "instance_completed"
  | "instance_failed"
  | "instance_suspended"
  | "instance_resumed"
  | "step_started"
  | "step_completed"
  | "step_failed"
  | "step_retry"
  | "gateway_evaluated"
  | "compensation_started"
  | "compensation_completed";

export interface HistoryEvent {
  event_type: HistoryEventType;
  instance_id: string;
  step_id?: string;
  step_type?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: HistoryError;
  duration_ms?: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface HistoryError {
  message: string;
  code?: string;
  stack?: string;
  on_error_to?: string | null;
}
