import BpmnModdle from "bpmn-moddle";
import wrioExtension from "./wrio-moddle.json";
import type { ProcessDefinition, Step, Transition, GatewayType } from "../model/types.js";

interface BpmnElement {
  id: string;
  $type: string;
  name?: string;
  outgoing?: BpmnFlow[];
  incoming?: BpmnFlow[];
  extensionElements?: { values?: BpmnElement[] };
  flowElements?: BpmnElement[];
  sourceRef?: { id: string };
  targetRef?: { id: string };
  conditionExpression?: { body: string };
  calledElement?: string;
  laneSets?: { lanes: BpmnLane[] }[];
  rootElements?: BpmnElement[];
  errorRef?: { id: string };
  attachedToRef?: { id: string };
  eventDefinitions?: BpmnElement[];
  [key: string]: unknown;
}

interface BpmnFlow {
  id: string;
  conditionExpression?: { body: string };
  targetRef: { id: string };
  sourceRef: { id: string };
  $type?: string;
}

interface BpmnLane {
  id: string;
  name: string;
  flowNodeRef: { id: string }[];
}

interface WrioNode {
  $type: string;
  category: string;
  action: string;
  params?: WrioParam[];
}

interface WrioParam {
  $type?: string;
  name: string;
  value: string;
}

function createModdle() {
  return new BpmnModdle({ wrio: wrioExtension });
}

export async function parseBpmn(bpmnXml: string): Promise<ProcessDefinition> {
  const moddle = createModdle();
  const { rootElement } = await moddle.fromXML(bpmnXml);

  const process = (rootElement as BpmnElement).rootElements?.find(
    (e: BpmnElement) => e.$type === "bpmn:Process",
  );

  if (!process) {
    throw new Error("No Process element found in BPMN XML");
  }

  const flowMap = new Map<string, BpmnFlow[]>();
  if (process.flowElements) {
    for (const el of process.flowElements) {
      if (el.$type === "bpmn:SequenceFlow" && "sourceRef" in el) {
        const flow = el as unknown as BpmnFlow;
        const sourceId = flow.sourceRef.id;
        if (!flowMap.has(sourceId)) flowMap.set(sourceId, []);
        flowMap.get(sourceId)!.push(flow);
      }
    }
  }

  const boundaryEvents = new Map<string, string>();
  if (process.flowElements) {
    for (const el of process.flowElements) {
      if (el.$type === "bpmn:BoundaryEvent") {
        const attachedTo = (el as BpmnElement).attachedToRef?.id;
        const outgoingFlow = (el as BpmnElement).outgoing?.[0];
        if (attachedTo && outgoingFlow) {
          boundaryEvents.set(attachedTo, outgoingFlow.targetRef.id);
        }
      }
    }
  }

  const entryPoint = findEntryPoint(process, flowMap);
  const steps: Step[] = [];
  const visited = new Set<string>();

  const flowElements: BpmnElement[] = process.flowElements || [];
  const elementMap = new Map<string, BpmnElement>();
  for (const el of flowElements) {
    if (el.id) elementMap.set(el.id, el);
    if (el.$type === "bpmn:SubProcess" && el.flowElements) {
      for (const subEl of el.flowElements) {
        elementMap.set(subEl.id, subEl);
      }
    }
  }

  for (const el of flowElements) {
    if (el.$type === "bpmn:SequenceFlow" || el.$type === "bpmn:LaneSet") continue;
    if (visited.has(el.id)) continue;
    visited.add(el.id);

    const step = convertElement(el, flowMap, boundaryEvents, elementMap);
    if (step) steps.push(step);
  }

  return {
    "@context": "https://wr.io/workflow",
    "@type": "Process",
    "@id": process.id,
    name: process.name || process.id,
    version: "1.0.0",
    entry_point_id: entryPoint,
    steps,
  };
}

function findEntryPoint(process: BpmnElement, flowMap: Map<string, BpmnFlow[]>): string {
  const flowElements: BpmnElement[] = process.flowElements || [];

  const startEvent = flowElements.find(
    (e) => e.$type === "bpmn:StartEvent",
  );
  if (startEvent) return startEvent.id;

  const hasIncoming = new Set<string>();
  for (const [, flows] of flowMap) {
    for (const f of flows) {
      hasIncoming.add(f.targetRef.id);
    }
  }

  for (const el of flowElements) {
    if (
      el.$type !== "bpmn:SequenceFlow" &&
      el.$type !== "bpmn:LaneSet" &&
      el.$type !== "bpmn:BoundaryEvent" &&
      el.$type !== "bpmn:TextAnnotation" &&
      !hasIncoming.has(el.id)
    ) {
      return el.id;
    }
  }

  const firstTask = flowElements.find(
    (e) =>
      e.$type !== "bpmn:SequenceFlow" &&
      e.$type !== "bpmn:LaneSet" &&
      e.$type !== "bpmn:BoundaryEvent",
  );
  return firstTask?.id || "StartEvent";
}

function convertElement(
  el: BpmnElement,
  flowMap: Map<string, BpmnFlow[]>,
  boundaryEvents: Map<string, string>,
  elementMap: Map<string, BpmnElement>,
): Step | null {
  const step: Step = {
    "@type": "Step",
    "@id": el.id,
    name: el.name || el.id,
    step_type: "service",
  };

  switch (el.$type) {
    case "bpmn:StartEvent": {
      step.step_type = "start";
      step.transitions = getTransitions(el.id, flowMap);
      break;
    }
    case "bpmn:EndEvent": {
      step.step_type = "end";
      break;
    }
    case "bpmn:ServiceTask": {
      step.step_type = "service";
      applyWrioNode(step, el);
      step.transitions = getTransitions(el.id, flowMap, boundaryEvents.get(el.id));
      break;
    }
    case "bpmn:UserTask": {
      step.step_type = "user_task";
      applyWrioNode(step, el);
      step.transitions = getTransitions(el.id, flowMap, boundaryEvents.get(el.id));
      break;
    }
    case "bpmn:ManualTask": {
      step.step_type = "manual";
      step.transitions = getTransitions(el.id, flowMap, boundaryEvents.get(el.id));
      break;
    }
    case "bpmn:ScriptTask": {
      step.step_type = "service";
      step.transitions = getTransitions(el.id, flowMap, boundaryEvents.get(el.id));
      break;
    }
    case "bpmn:SendTask": {
      step.step_type = "service";
      applyWrioNode(step, el);
      step.transitions = getTransitions(el.id, flowMap, boundaryEvents.get(el.id));
      break;
    }
    case "bpmn:CallActivity": {
      step.step_type = "call_activity";
      step.called_definition = el.calledElement;
      step.transitions = getTransitions(el.id, flowMap, boundaryEvents.get(el.id));
      break;
    }
    case "bpmn:SubProcess": {
      step.step_type = "subprocess";
      step.steps = [];
      if (el.flowElements) {
        const subFlowMap = new Map<string, BpmnFlow[]>();
        for (const subEl of el.flowElements) {
          if (subEl.$type === "bpmn:SequenceFlow" && "sourceRef" in subEl) {
            const flow = subEl as unknown as BpmnFlow;
            const srcId = flow.sourceRef.id;
            if (!subFlowMap.has(srcId)) subFlowMap.set(srcId, []);
            subFlowMap.get(srcId)!.push(flow);
          }
        }
        for (const subEl of el.flowElements) {
          if (subEl.$type === "bpmn:SequenceFlow" || subEl.$type === "bpmn:BoundaryEvent") continue;
          const subStep = convertElement(subEl, subFlowMap, new Map(), elementMap);
          if (subStep) step.steps.push(subStep);
        }
      }
      step.transitions = getTransitions(el.id, flowMap, boundaryEvents.get(el.id));
      break;
    }
    case "bpmn:Task": {
      step.step_type = "service";
      step.transitions = getTransitions(el.id, flowMap, boundaryEvents.get(el.id));
      break;
    }
    case "bpmn:ExclusiveGateway": {
      step.step_type = "gateway";
      step.gateway_type = "exclusive";
      step.transitions = getGatewayTransitions(el.id, flowMap);
      break;
    }
    case "bpmn:InclusiveGateway": {
      step.step_type = "gateway";
      step.gateway_type = "inclusive";
      step.transitions = getGatewayTransitions(el.id, flowMap);
      break;
    }
    case "bpmn:ParallelGateway": {
      step.step_type = "gateway";
      const outFlows = flowMap.get(el.id) || [];
      const inCount = stepIsJoin(el.id, flowMap);
      step.gateway_type = inCount > 1 ? "parallel_join" : "parallel_fork";
      step.transitions = outFlows.map((f: BpmnFlow) => ({
        target_id: f.targetRef.id,
      }));
      break;
    }
    case "bpmn:IntermediateCatchEvent": {
      const hasTimer = el.eventDefinitions?.some((d: BpmnElement) =>
        d.$type === "bpmn:TimerEventDefinition",
      );
      const hasMessage = el.eventDefinitions?.some((d: BpmnElement) =>
        d.$type === "bpmn:MessageEventDefinition",
      );
      if (hasMessage) {
        step.step_type = "user_task";
      } else if (hasTimer) {
        step.step_type = "timer";
      } else {
        step.step_type = "service";
      }
      step.transitions = getTransitions(el.id, flowMap);
      break;
    }
    case "bpmn:BoundaryEvent": {
      return null;
    }
    default: {
      return null;
    }
  }

  return step;
}

function applyWrioNode(step: Step, el: BpmnElement): void {
  if (!el.extensionElements?.values) return;
  const wrioNode = el.extensionElements.values.find(
    (e: BpmnElement) => e.$type === "wrio:Node",
  ) as unknown as WrioNode | undefined;

  if (wrioNode) {
    step.action = `${wrioNode.category}.${wrioNode.action}`;
    if (wrioNode.params) {
      step.params = {};
      for (const param of wrioNode.params) {
        (step.params as Record<string, unknown>)[param.name] = param.value;
      }
    }
  }
}

function getTransitions(
  elementId: string,
  flowMap: Map<string, BpmnFlow[]>,
  onErrorTarget?: string,
): Transition[] | undefined {
  const outgoing = flowMap.get(elementId);
  if (!outgoing || outgoing.length === 0) return undefined;

  const result: Transition[] = outgoing.map((f: BpmnFlow) => ({
    target_id: f.targetRef.id,
  }));

  if (onErrorTarget) {
    result.push({ target_id: onErrorTarget, on_error: true });
  }

  return result.length > 0 ? result : undefined;
}

function getGatewayTransitions(
  elementId: string,
  flowMap: Map<string, BpmnFlow[]>,
): Transition[] {
  const outgoing = flowMap.get(elementId);
  if (!outgoing || outgoing.length === 0) return [];

  const hasConditional = outgoing.some((f: BpmnFlow) => f.conditionExpression);

  if (!hasConditional) {
    return outgoing.map((f: BpmnFlow) => ({
      target_id: f.targetRef.id,
    }));
  }

  return outgoing.map((f: BpmnFlow) => ({
    target_id: f.targetRef.id,
    condition: f.conditionExpression?.body || undefined,
  }));
}

function stepIsJoin(elementId: string, flowMap: Map<string, BpmnFlow[]>): number {
  let count = 0;
  for (const [, flows] of flowMap) {
    for (const f of flows) {
      if (f.targetRef.id === elementId) count++;
    }
  }
  return count;
}
