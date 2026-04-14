export interface BpmnProcess {
  "@id": string;
  name: string;
  lanes?: Array<{ "@id": string; name: string; steps: string[] }>;
  steps: Array<{
    "@id": string;
    name: string;
    step_type: string;
    lane?: string;
    transitions?: Array<{ target_id: string; type: string }>;
    [key: string]: any;
  }>;
}

export function generateBpmnXml(process: BpmnProcess): string {
  const process_id = process["@id"] || "Process_1";
  const processName = process.name || "Process";

  let bpmnXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${process_id}" name="${processName}" isExecutable="true">`;

  // Lanes
  if (process.lanes && process.lanes.length > 0) {
    bpmnXml += `\n    <bpmn:laneSet id="LaneSet_1">`;
    process.lanes.forEach((lane) => {
      bpmnXml += `\n      <bpmn:lane id="${lane["@id"]}" name="${lane.name}">`;
      lane.steps.forEach((stepId) => {
        bpmnXml += `\n        <bpmn:flowNodeRef>${stepId}</bpmn:flowNodeRef>`;
      });
      bpmnXml += `\n      </bpmn:lane>`;
    });
    bpmnXml += `\n    </bpmn:laneSet>`;
  }

  // Steps
  process.steps.forEach((step) => {
    const incoming = process.steps
      .filter((s) => s.transitions?.some((t) => t.target_id === step["@id"]))
      .map((s) => `Flow_${s["@id"]}_to_${step["@id"]}`);

    const outgoing =
      step.transitions?.map((t) => `Flow_${step["@id"]}_to_${t.target_id}`) ||
      [];

    let tag = "task";
    switch (step.step_type) {
      case "start":
        tag = "startEvent";
        break;
      case "end":
        tag = "endEvent";
        break;
      case "service":
        tag = "serviceTask";
        break;
      case "user":
        tag = "userTask";
        break;
      case "manual":
        tag = "manualTask";
        break;
      case "form":
        tag = "userTask";
        break; // Forms are user tasks
    }

    bpmnXml += `\n    <bpmn:${tag} id="${step["@id"]}" name="${step.name}">`;
    incoming.forEach(
      (flowId) =>
        (bpmnXml += `\n      <bpmn:incoming>${flowId}</bpmn:incoming>`),
    );
    outgoing.forEach(
      (flowId) =>
        (bpmnXml += `\n      <bpmn:outgoing>${flowId}</bpmn:outgoing>`),
    );
    bpmnXml += `\n    </bpmn:${tag}>`;
  });

  // Sequence Flows
  process.steps.forEach((step) => {
    if (step.transitions) {
      step.transitions.forEach((t) => {
        bpmnXml += `\n    <bpmn:sequenceFlow id="Flow_${step["@id"]}_to_${t.target_id}" sourceRef="${step["@id"]}" targetRef="${t.target_id}" />`;
      });
    }
  });

  bpmnXml += `\n  </bpmn:process>`;

  // DI (Diagram Interchange)
  bpmnXml += `\n  <bpmndi:BPMNDiagram id="BPMNDiagram_1">`;
  bpmnXml += `\n    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${process_id}">`;

  // Simple layout logic
  const stepPositions: Record<string, { x: number; y: number }> = {};

  // Find start step
  const startStep = process.steps.find((s) => s.step_type === "start");
  if (startStep) {
    traverse(startStep, 150, 100);
  } else {
    // Fallback linear layout
    process.steps.forEach((step, i) => {
      stepPositions[step["@id"]] = { x: 150 + i * 150, y: 100 };
    });
  }

  function traverse(step: any, currentX: number, currentY: number) {
    if (stepPositions[step["@id"]]) return; // Already visited

    stepPositions[step["@id"]] = { x: currentX, y: currentY };

    if (step.transitions) {
      step.transitions.forEach((t: any, i: number) => {
        const nextStep = process.steps.find((s) => s["@id"] === t.target_id);
        if (nextStep) {
          traverse(nextStep, currentX + 150, currentY + i * 100);
        }
      });
    }
  }

  // Generate Shapes
  process.steps.forEach((step) => {
    const autoPos = stepPositions[step["@id"]] || { x: 0, y: 0 };
    const pos = {
      x: step.x !== undefined ? step.x : autoPos.x,
      y: step.y !== undefined ? step.y : autoPos.y,
    };
    // Update stepPositions with final values for edge generation
    stepPositions[step["@id"]] = pos;

    const isEvent =
      step.step_type === "start" ||
      step.step_type === "end" ||
      step.step_type.includes("Event");
    const width = isEvent ? 36 : 100;
    const height = isEvent ? 36 : 80;

    // Adjust Y for lanes if present
    let finalY = pos.y;
    if (process.lanes && step.lane) {
      const laneIndex = process.lanes.findIndex((l) => l["@id"] === step.lane);
      if (laneIndex >= 0) {
        finalY = 100 + laneIndex * 200; // Simple lane spacing
      }
    }

    bpmnXml += `\n      <bpmndi:BPMNShape id="Shape_${step["@id"]}" bpmnElement="${step["@id"]}">`;
    bpmnXml += `\n        <dc:Bounds x="${pos.x}" y="${finalY}" width="${width}" height="${height}" />`;
    bpmnXml += `\n      </bpmndi:BPMNShape>`;
  });

  // Generate Edges
  process.steps.forEach((step) => {
    if (step.transitions) {
      step.transitions.forEach((t) => {
        const sourcePos = stepPositions[step["@id"]];
        const targetPos = stepPositions[t.target_id];

        if (sourcePos && targetPos) {
          // Recalculate Y based on lanes
          let sourceY = sourcePos.y;
          let targetY = targetPos.y;

          if (process.lanes && step.lane) {
            const laneIndex = process.lanes.findIndex(
              (l) => l["@id"] === step.lane,
            );
            if (laneIndex >= 0) sourceY = 100 + laneIndex * 200;
          }

          const targetStep = process.steps.find(
            (s) => s["@id"] === t.target_id,
          );
          if (targetStep && process.lanes && targetStep.lane) {
            const laneIndex = process.lanes.findIndex(
              (l) => l["@id"] === targetStep.lane,
            );
            if (laneIndex >= 0) targetY = 100 + laneIndex * 200;
          }

          const isSourceEvent =
            step.step_type === "start" ||
            step.step_type === "end" ||
            step.step_type.includes("Event");
          const isTargetEvent = targetStep
            ? targetStep.step_type === "start" ||
              targetStep.step_type === "end" ||
              targetStep.step_type.includes("Event")
            : false;

          const sourceWidth = isSourceEvent ? 36 : 100;
          const sourceHeight = isSourceEvent ? 36 : 80;
          const targetHeight = isTargetEvent ? 36 : 80;

          const flowId = `Flow_${step["@id"]}_to_${t.target_id}`;

          bpmnXml += `\n      <bpmndi:BPMNEdge id="Edge_${flowId}" bpmnElement="${flowId}">`;
          bpmnXml += `\n        <di:waypoint x="${sourcePos.x + sourceWidth}" y="${sourceY + sourceHeight / 2}" />`;
          bpmnXml += `\n        <di:waypoint x="${targetPos.x}" y="${targetY + targetHeight / 2}" />`;
          bpmnXml += `\n      </bpmndi:BPMNEdge>`;
        }
      });
    }
  });

  bpmnXml += `\n    </bpmndi:BPMNPlane>`;
  bpmnXml += `\n  </bpmndi:BPMNDiagram>`;
  bpmnXml += `\n</bpmn:definitions>`;

  return bpmnXml;
}
