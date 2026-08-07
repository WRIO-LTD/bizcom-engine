import type { Incident, IncidentStatus, IncidentType, IncidentSeverity } from "../model/incident.js";

export class IncidentManager {
  private incidents: Map<string, Incident[]> = new Map();

  create(
    instanceId: string,
    stepId: string,
    type: IncidentType,
    message: string,
    maxAttempts: number = 1,
    severity: IncidentSeverity = "error",
    details?: Record<string, unknown>,
  ): Incident {
    const incident: Incident = {
      instance_id: instanceId,
      step_id: stepId,
      type,
      message,
      status: "open",
      severity,
      attempts: 1,
      max_attempts: maxAttempts,
      created_at: new Date().toISOString(),
      details,
    };

    const list = this.incidents.get(instanceId) || [];
    list.push(incident);
    this.incidents.set(instanceId, list);

    return incident;
  }

  incrementAttempt(instanceId: string, stepId: string): Incident | undefined {
    const list = this.incidents.get(instanceId);
    if (!list) return undefined;

    const incident = list.find(
      (i) => i.step_id === stepId && i.status === "open",
    );
    if (!incident) return undefined;

    incident.attempts++;
    if (incident.attempts > incident.max_attempts) {
      incident.status = "exhausted";
    }
    return incident;
  }

  resolve(instanceId: string, stepId: string): Incident | undefined {
    const list = this.incidents.get(instanceId);
    if (!list) return undefined;

    const incident = list.find(
      (i) => i.step_id === stepId && i.status === "open",
    );
    if (!incident) return undefined;

    incident.status = "resolved";
    incident.resolved_at = new Date().toISOString();
    return incident;
  }

  getIncidents(instanceId: string): Incident[] {
    return this.incidents.get(instanceId) || [];
  }

  getOpenIncidents(instanceId: string): Incident[] {
    return this.getIncidents(instanceId).filter((i) => i.status === "open");
  }

  clear(instanceId: string): void {
    this.incidents.delete(instanceId);
  }
}

