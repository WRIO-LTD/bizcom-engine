import type {
  ProcessDefinition,
  Step,
  Transition,
  GatewayType,
} from "../model/types.js";

function sanitizeId(id: string): string {
  if (!id) return "id_" + Math.random().toString(36).substring(7);
  let result = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (/^[0-9]/.test(result)) result = "id_" + result;
  return result;
}

function getStepTransitions(
  step: Step,
  allSteps: Step[],
  index: number,
  hasExplicitEnd: boolean,
): TransitionRecord[] {
  if (step.transitions && step.transitions.length > 0) {
    return step.transitions.filter((t) => !t.on_error);
  }

  const isEnd = step.step_type === "end";
  if (!isEnd) {
    const next = allSteps[index + 1];
    if (next) {
      return [{ target_id: next["@id"] }];
    } else if (!hasExplicitEnd) {
      return [{ target_id: "EndEvent_1" }];
    }
  }

  return [];
}

interface TransitionRecord {
  target_id: string;
  condition?: string;
  on_error?: boolean;
  label?: string;
}

interface CoordMap {
  [key: string]: { x: number; y: number; w: number; h: number };
}

export function serializeBpmn(definition: ProcessDefinition): string {
  const processId = sanitizeId(definition["@id"]);
  const processName = definition.name || definition["@id"];
  const steps = definition.steps;

  const hasExplicitStart = steps.some((s) => s.step_type === "start");
  const hasExplicitEnd = steps.some((s) => s.step_type === "end");
  const startEventId = "StartEvent_1";
  const endEventId = "EndEvent_1";
  const entryPoint =
    definition.entry_point_id ||
    (hasExplicitStart
      ? steps.find((s) => s.step_type === "start")!["@id"]
      : steps[0]?.["@id"] || "");

  const elements: string[] = [];
  const flows: string[] = [];
  const onErrorElements: string[] = [];

  if (!hasExplicitStart) {
    elements.push(
      `    <bpmn:startEvent id="${startEventId}" name="Start">`,
      `      <bpmn:outgoing>Flow_${startEventId}_to_${sanitizeId(entryPoint)}</bpmn:outgoing>`,
      `    </bpmn:startEvent>`,
    );
    flows.push(
      `    <bpmn:sequenceFlow id="Flow_${startEventId}_to_${sanitizeId(entryPoint)}" sourceRef="${startEventId}" targetRef="${sanitizeId(entryPoint)}" />`,
    );
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepId = sanitizeId(step["@id"]);

    elements.push(...renderStep(step, stepId));

    const stepTransitions = getStepTransitions(step, steps, i, hasExplicitEnd);

    for (const t of stepTransitions) {
      const targetId = sanitizeId(t.target_id);
      const flowId = `Flow_${stepId}_to_${targetId}`;
      const condAttr = t.condition
        ? `\n      <bpmn:conditionExpression>${escapeXml(t.condition)}</bpmn:conditionExpression>\n    `
        : " ";
      const labelAttr = t.label ? ` name="${escapeXml(t.label)}"` : "";
      flows.push(
        `    <bpmn:sequenceFlow id="${flowId}" sourceRef="${stepId}" targetRef="${targetId}"${labelAttr}>${condAttr}</bpmn:sequenceFlow>`,
      );
    }

    if (step.transitions) {
      for (const t of step.transitions) {
        if (t.on_error && t.target_id) {
          const targetId = sanitizeId(t.target_id);
          const errorEventId = `ErrorEvent_${stepId}`;
          onErrorElements.push(
            `    <bpmn:boundaryEvent id="${errorEventId}" attachedToRef="${stepId}">`,
            `      <bpmn:errorEventDefinition />`,
            `      <bpmn:outgoing>Flow_${errorEventId}_to_${targetId}</bpmn:outgoing>`,
            `    </bpmn:boundaryEvent>`,
          );
          flows.push(
            `    <bpmn:sequenceFlow id="Flow_${errorEventId}_to_${targetId}" sourceRef="${errorEventId}" targetRef="${targetId}" />`,
          );
        }
      }
    }
  }

  if (steps.length === 0 && !hasExplicitStart) {
    flows.push(
      `    <bpmn:sequenceFlow id="Flow_${startEventId}_to_${endEventId}" sourceRef="${startEventId}" targetRef="${endEventId}" />`,
    );
  }

  if (!hasExplicitEnd) {
    const pointsToEnd = flows.some((f) => f.includes(`targetRef="${endEventId}"`));
    const hasEndInElements = elements.some((e) => e.includes(`id="${endEventId}"`));
    if ((pointsToEnd || steps.length === 0) && !hasEndInElements) {
      elements.push(
        `    <bpmn:endEvent id="${endEventId}" name="End">`,
        `      <bpmn:incoming>Flow_to_end</bpmn:incoming>`,
        `    </bpmn:endEvent>`,
      );
    }
  }

  const allElements = [...elements, ...onErrorElements];

  const bpmnXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                   xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                   xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                   xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                   xmlns:wrio="http://wrio.io/schema/bpmn/wrio"
                   id="Definitions_1"
                   targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${processId}" name="${escapeXml(processName)}" isExecutable="true">
${allElements.join("\n")}
${flows.join("\n")}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}">
${generateDiagram(definition, hasExplicitStart, hasExplicitEnd, startEventId, endEventId)}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

  return bpmnXml;
}

function renderStep(step: Step, stepId: string): string[] {
  const lines: string[] = [];
  const tag = mapStepToTag(step);
  const name = escapeXml(step.name || stepId);

  const incoming = computeIncoming(stepId);
  const outgoing = computeOutgoing(step, stepId);

  let extraAttrs = "";
  if (step.called_definition) {
    extraAttrs += ` calledElement="${escapeXml(step.called_definition)}"`;
  }

  if (step.step_type === "subprocess" && step.steps) {
    lines.push(
      `    <bpmn:subProcess id="${stepId}" name="${name}"${extraAttrs}>`,
    );
    for (const subStep of step.steps) {
      const subId = sanitizeId(subStep["@id"]);
      lines.push(...renderStep(subStep, subId).map((l) => "  " + l));
    }
    lines.push(`    </bpmn:subProcess>`);
    return lines;
  }

  if (tag === "subProcess") {
    return lines;
  }

  lines.push(
    `    <bpmn:${tag} id="${stepId}" name="${name}"${extraAttrs}>`,
  );

  const wrioExt = renderWrioExtension(step);
  if (wrioExt) {
    lines.push(`      <bpmn:extensionElements>`);
    lines.push(`        ${wrioExt}`);
    lines.push(`      </bpmn:extensionElements>`);
  }

  incoming.forEach((flowId) => {
    lines.push(`      <bpmn:incoming>${flowId}</bpmn:incoming>`);
  });
  outgoing.forEach((flowId) => {
    lines.push(`      <bpmn:outgoing>${flowId}</bpmn:outgoing>`);
  });

  lines.push(`    </bpmn:${tag}>`);
  return lines;
}

function computeIncoming(stepId: string): string[] {
  return [];
}

function computeOutgoing(step: Step, stepId: string): string[] {
  if (!step.transitions || step.transitions.length === 0) return [];
  return step.transitions.map((t, i) => {
    const targetId = sanitizeId(t.target_id);
    if (t.on_error) {
      return `Flow_ErrorEvent_${stepId}_to_${targetId}`;
    }
    return `Flow_${stepId}_to_${targetId}`;
  });
}

function mapStepToTag(step: Step): string {
  switch (step.step_type) {
    case "start":
      return "startEvent";
    case "end":
      return "endEvent";
    case "service":
    case "service_task":
      return "serviceTask";
    case "user_task":
    case "form":
      return "userTask";
    case "manual":
      return "manualTask";
    case "timer":
      return "intermediateCatchEvent";
    case "gateway":
      return mapGatewayTag(step.gateway_type);
    case "call_activity":
      return "callActivity";
    case "subprocess":
      return "subProcess";
    default:
      return "task";
  }
}

function mapGatewayTag(gwType?: GatewayType): string {
  switch (gwType) {
    case "exclusive":
      return "exclusiveGateway";
    case "inclusive":
      return "inclusiveGateway";
    case "parallel_fork":
    case "parallel_join":
      return "parallelGateway";
    default:
      return "exclusiveGateway";
  }
}

function renderWrioExtension(step: Step): string | null {
  if (!step.action) return null;
  const parts = step.action.split(".");
  if (parts.length !== 2) return null;
  const [category, action] = parts;

  let nodeXml = `<wrio:node category="${escapeXml(category)}" action="${escapeXml(action)}"`;
  if (!step.params || Object.keys(step.params).length === 0) {
    nodeXml += ` />`;
  } else {
    nodeXml += `>`;
    for (const [key, value] of Object.entries(step.params)) {
      nodeXml += `\n          <wrio:param name="${escapeXml(key)}">${escapeXml(String(value))}</wrio:param>`;
    }
    nodeXml += `\n        </wrio:node>`;
  }
  return nodeXml;
}

function generateDiagram(
  definition: ProcessDefinition,
  hasExplicitStart: boolean,
  hasExplicitEnd: boolean,
  startEventId: string,
  endEventId: string,
): string {
  const steps = definition.steps;
  const coords: CoordMap = {};
  const diElements: string[] = [];

  if (!hasExplicitStart) {
    const x = 100,
      y = 182,
      w = 36,
      h = 36;
    coords[startEventId] = { x, y, w, h };
    diElements.push(renderShape(startEventId, x, y, w, h));
  }

  steps.forEach((step, index) => {
    const stepId = sanitizeId(step["@id"]);
    const isEvent = step.step_type === "start" || step.step_type === "end";
    const isGateway = step.step_type === "gateway";
    const width = isEvent ? 36 : isGateway ? 50 : 100;
    const height = isEvent ? 36 : isGateway ? 50 : 80;

    const x = 200 + index * 150;
    const y = isEvent ? 182 : 160;

    coords[stepId] = { x, y, w: width, h: height };
    diElements.push(renderShape(stepId, x, y, width, height));

    if (step.transitions) {
      for (const t of step.transitions) {
        if (t.on_error) {
          const errorEventId = `ErrorEvent_${stepId}`;
          coords[errorEventId] = {
            x: x + width - 16,
            y: y,
            w: 32,
            h: 32,
          };
          diElements.push(
            renderShape(errorEventId, x + width - 16, y, 32, 32),
          );
        }
      }
    }
  });

  if (!hasExplicitEnd) {
    const lastStep = steps[steps.length - 1];
    const lastX = lastStep ? 200 + (steps.length - 1) * 150 + 100 : 100;
    const x = lastX + 50,
      y = 182,
      w = 36,
      h = 36;
    coords[endEventId] = { x, y, w, h };
    diElements.push(renderShape(endEventId, x, y, w, h));
  }

  const allSteps: Array<{ id: string; transitions: TransitionRecord[] }> = [];

  if (!hasExplicitStart && steps.length > 0) {
    const entryPoint =
      definition.entry_point_id ||
      (hasExplicitStart
        ? steps.find((s) => s.step_type === "start")!["@id"]
        : steps[0]?.["@id"] || "");
    allSteps.push({
      id: startEventId,
      transitions: [{ target_id: entryPoint }],
    });
  }

  steps.forEach((step, index) => {
    allSteps.push({
      id: sanitizeId(step["@id"]),
      transitions: getStepTransitions(step, steps, index, hasExplicitEnd),
    });
    if (step.transitions) {
      for (const t of step.transitions) {
        if (t.on_error) {
          allSteps.push({
            id: `ErrorEvent_${sanitizeId(step["@id"])}`,
            transitions: [{ target_id: t.target_id }],
          });
        }
      }
    }
  });

  for (const src of allSteps) {
    const source = coords[src.id];
    if (!source) continue;
    for (const t of src.transitions) {
      const targetId = sanitizeId(t.target_id);
      const target = coords[targetId];
      if (!target) continue;
      const flowId = `Flow_${src.id}_to_${targetId}`;
      diElements.push(renderEdge(flowId, source, target));
    }
  }

  return diElements.join("\n");
}

function renderShape(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  return `      <bpmndi:BPMNShape id="Shape_${id}" bpmnElement="${id}">
        <dc:Bounds x="${x}" y="${y}" width="${width}" height="${height}" />
      </bpmndi:BPMNShape>`;
}

function renderEdge(
  id: string,
  source: { x: number; y: number; w: number; h: number },
  target: { x: number; y: number; w: number; h: number },
): string {
  const startX = source.x + source.w;
  const startY = source.y + source.h / 2;
  const endX = target.x;
  const endY = target.y + target.h / 2;

  return `      <bpmndi:BPMNEdge id="Edge_${id}" bpmnElement="${id}">
        <di:waypoint x="${startX}" y="${startY}" />
        <di:waypoint x="${endX}" y="${endY}" />
      </bpmndi:BPMNEdge>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
