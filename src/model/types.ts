export type StepType =
  | "start"
  | "end"
  | "service"
  | "service_task"
  | "user_task"
  | "timer"
  | "gateway"
  | "form"
  | "manual"
  | "call_activity"
  | "subprocess";

export type GatewayType =
  | "exclusive"
  | "inclusive"
  | "parallel_fork"
  | "parallel_join";

export interface ProcessDefinition {
  "@context": string;
  "@type": "Process";
  "@id": string;
  name: string;
  description?: string;
  version: string;
  entry_point_id: string;
  inputs?: WorkflowInputDefinition[];
  steps: Step[];
  outputs?: Record<string, string>;
}

export interface WorkflowInputDefinition {
  name: string;
  type: string;
  label?: string;
  description?: string;
  placeholder?: string;
  default?: unknown;
  required?: boolean;
  pattern?: string;
  options?: unknown[];
}

export interface Step {
  "@type": "Step";
  "@id": string;
  name: string;
  step_type: StepType;
  description?: string;

  gateway_type?: GatewayType;

  action?: string;
  params?: Record<string, unknown>;

  duration?: string;
  schedule?: string;

  transitions?: Transition[];
  timeout?: string;
  retry?: RetryConfig;

  output?: Record<string, unknown>;
  output_values?: Record<string, string>;

  called_definition?: string;
  steps?: Step[];
}

export interface Transition {
  target_id: string;
  condition?: string;
  on_error?: boolean;
}

export interface RetryConfig {
  max_attempts: number;
  delay_ms?: number;
  backoff?: "exponential" | "linear";
  max_delay?: number;
}
