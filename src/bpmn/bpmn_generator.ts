export interface BpmnProcess {
  "@id": string;
  name: string;
  lanes?: Array<{ "@id": string; name: string; steps: string[] }>;
  steps: Array<{
    "@id": string;
    name: string;
    step_type: string;
    lane?: string;
    transitions?: Array<{ target_id: string; type?: string; condition?: string }>;
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

  // Collect gateway info: which steps need exclusive gateways
  const gateways = new Map<string, string>(); // stepId -> gatewayId
  const gatewayTargets = new Map<string, string[]>(); // stepId -> targetIds after gateway
  const gatewayDefaultTarget = new Map<string, string>(); // stepId -> default targetId (no condition)

  process.steps.forEach((step) => {
    if (!step.transitions) return;
    const withCondition = step.transitions.filter((t) => t.condition);
    const withoutCondition = step.transitions.filter((t) => !t.condition);
    // Need gateway if: multiple conditional OR (1+ conditional AND 1+ unconditional)
    if (withCondition.length > 0 && step.transitions.length > 1) {
      const gwId = `Gateway_after_${step["@id"]}`;
      gateways.set(step["@id"], gwId);
      gatewayTargets.set(step["@id"], step.transitions.map((t) => t.target_id));
      if (withoutCondition.length === 1) {
        gatewayDefaultTarget.set(step["@id"], withoutCondition[0].target_id);
      }
    }
  });

  // Steps + Gateways
  process.steps.forEach((step) => {
    const incoming = process.steps
      .filter((s) => s.transitions?.some((t) => t.target_id === step["@id"]))
      .flatMap((s) => {
        const gwId = gateways.get(s["@id"]);
        if (gwId) {
          // Source has a gateway; target is reached from gateway
          const targets = gatewayTargets.get(s["@id"]);
          if (targets && targets.includes(step["@id"])) {
            return [`Flow_${gwId}_to_${step["@id"]}`];
          }
          return [];
        }
        return [`Flow_${s["@id"]}_to_${step["@id"]}`];
      });

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
        break;
    }

    bpmnXml += `\n    <bpmn:${tag} id="${step["@id"]}" name="${step.name}">`;
    incoming.forEach(
      (flowId) =>
        (bpmnXml += `\n      <bpmn:incoming>${flowId}</bpmn:incoming>`),
    );
    // Outgoing: if a gateway follows this step, route to gateway
    const gwId = gateways.get(step["@id"]);
    if (gwId) {
      bpmnXml += `\n      <bpmn:outgoing>Flow_${step["@id"]}_to_${gwId}</bpmn:outgoing>`;
    } else {
      const outgoing =
        step.transitions?.map((t) => {
          // If target also has a gateway before it from another source, use gateway
          return `Flow_${step["@id"]}_to_${t.target_id}`;
        }) || [];
      outgoing.forEach(
        (flowId) =>
          (bpmnXml += `\n      <bpmn:outgoing>${flowId}</bpmn:outgoing>`),
      );
    }
    bpmnXml += `\n    </bpmn:${tag}>`;

    // Generate exclusive gateway element if needed
    if (gwId) {
      const defaultTarget = gatewayDefaultTarget.get(step["@id"]);
      bpmnXml += `\n    <bpmn:exclusiveGateway id="${gwId}" name=""`;
      if (defaultTarget) {
        bpmnXml += ` default="${defaultTarget}"`;
      }
      bpmnXml += `>`;
      bpmnXml += `\n      <bpmn:incoming>Flow_${step["@id"]}_to_${gwId}</bpmn:incoming>`;
      gatewayTargets.get(step["@id"])!.forEach((targetId) => {
        bpmnXml += `\n      <bpmn:outgoing>Flow_${gwId}_to_${targetId}</bpmn:outgoing>`;
      });
      bpmnXml += `\n    </bpmn:exclusiveGateway>`;
    }
  });

  // Sequence Flows
  process.steps.forEach((step) => {
    if (!step.transitions) return;
    const gwId = gateways.get(step["@id"]);
    if (gwId) {
      // Source → Gateway
      bpmnXml += `\n    <bpmn:sequenceFlow id="Flow_${step["@id"]}_to_${gwId}" sourceRef="${step["@id"]}" targetRef="${gwId}" />`;
      // Gateway → each target
      step.transitions.forEach((t, i) => {
        const cond = t.condition;
        bpmnXml += `\n    <bpmn:sequenceFlow id="Flow_${gwId}_to_${t.target_id}" sourceRef="${gwId}" targetRef="${t.target_id}"`;
        if (cond && i > 0) {
          bpmnXml += `>
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${${cond}}</bpmn:conditionExpression>`;
          bpmnXml += `\n    </bpmn:sequenceFlow>`;
        } else {
          bpmnXml += ` />`;
        }
      });
    } else {
      step.transitions.forEach((t) => {
        bpmnXml += `\n    <bpmn:sequenceFlow id="Flow_${step["@id"]}_to_${t.target_id}" sourceRef="${step["@id"]}" targetRef="${t.target_id}" />`;
      });
    }
  });

  bpmnXml += `\n  </bpmn:process>`;

  // DI (Diagram Interchange)
  bpmnXml += `\n  <bpmndi:BPMNDiagram id="BPMNDiagram_1">`;
  bpmnXml += `\n    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${process_id}">`;

  // Layout positions
  const stepPositions: Record<string, { x: number; y: number }> = {};
  const gatewayPositions = new Map<string, { x: number; y: number }>();

  const startStep = process.steps.find((s) => s.step_type === "start");
  if (startStep) {
    traverse(startStep, 150, 100, 0);
  } else {
    // Fallback linear layout
    let xOffset = 0;
    process.steps.forEach((step) => {
      if (stepPositions[step["@id"]]) { xOffset++; return; }
      const baseX = 150 + xOffset * 150;
      stepPositions[step["@id"]] = { x: baseX, y: 100 };
      xOffset++;

      const gwId = gateways.get(step["@id"]);
      if (gwId) {
        const targets = gatewayTargets.get(step["@id"])!;
        const gwX = baseX + 100 + 20;
        const gwY = 100 + 40;
        gatewayPositions.set(gwId, { x: gwX, y: gwY });

        targets.forEach((targetId, ti) => {
          if (!stepPositions[targetId]) {
            stepPositions[targetId] = {
              x: gwX + 50 + 20,
              y: ti === 0 ? 60 : 100 + (ti - 1) * 100,
            };
          }
        });
      }
    });
  }

  function traverse(step: any, currentX: number, currentY: number, depth: number) {
    if (stepPositions[step["@id"]]) return;

    stepPositions[step["@id"]] = { x: currentX, y: currentY };

    const gwId = gateways.get(step["@id"]);
    if (gwId) {
      const gwX = currentX + 100 + 20;
      const gwY = currentY + 40;
      gatewayPositions.set(gwId, { x: gwX, y: gwY });

      const targets = gatewayTargets.get(step["@id"])!;
      targets.forEach((targetId, i) => {
        const nextStep = process.steps.find((s) => s["@id"] === targetId);
        if (nextStep) {
          const targetX = gwX + 50 + 20;
          const targetY = i === 0 ? currentY : currentY + i * 100;
          traverse(nextStep, targetX, targetY, depth + 1);
        }
      });
      return;
    }

    if (step.transitions) {
      step.transitions.forEach((t: any, i: number) => {
        const nextStep = process.steps.find((s) => s["@id"] === t.target_id);
        if (nextStep) {
          traverse(nextStep, currentX + 150, currentY + i * 100, depth + 1);
        }
      });
    }
  }

  function hasGatewayTarget(stepId: string): boolean {
    for (const targets of gatewayTargets.values()) {
      if (targets.includes(stepId)) return true;
    }
    return false;
  }

  // Generate Shapes (steps)
  process.steps.forEach((step) => {
    const autoPos = stepPositions[step["@id"]] || { x: 0, y: 0 };
    const pos = {
      x: step.x !== undefined ? step.x : autoPos.x,
      y: step.y !== undefined ? step.y : autoPos.y,
    };
    stepPositions[step["@id"]] = pos;

    const isEvent =
      step.step_type === "start" ||
      step.step_type === "end" ||
      step.step_type.includes("Event");
    const width = isEvent ? 36 : 100;
    const height = isEvent ? 36 : 80;

    let finalY = pos.y;
    if (process.lanes && step.lane) {
      const laneIndex = process.lanes.findIndex((l) => l["@id"] === step.lane);
      if (laneIndex >= 0) {
        finalY = 100 + laneIndex * 200;
      }
    }

    bpmnXml += `\n      <bpmndi:BPMNShape id="Shape_${step["@id"]}" bpmnElement="${step["@id"]}">`;
    bpmnXml += `\n        <dc:Bounds x="${pos.x}" y="${finalY}" width="${width}" height="${height}" />`;
    bpmnXml += `\n      </bpmndi:BPMNShape>`;
  });

  // Generate Shapes (gateways)
  for (const [gwId, pos] of gatewayPositions) {
    bpmnXml += `\n      <bpmndi:BPMNShape id="Shape_${gwId}" bpmnElement="${gwId}">`;
    bpmnXml += `\n        <dc:Bounds x="${pos.x}" y="${pos.y}" width="50" height="50" />`;
    bpmnXml += `\n      </bpmndi:BPMNShape>`;
  }

  // Generate Edges
  process.steps.forEach((step) => {
    if (!step.transitions) return;
    const gwId = gateways.get(step["@id"]);

    if (gwId) {
      // Source → Gateway edge
        const sourcePos = stepPositions[step["@id"]];
        const gwPos = gatewayPositions.get(gwId);
      if (sourcePos && gwPos) {
        let sourceY = sourcePos.y;
        if (process.lanes && step.lane) {
          const laneIndex = process.lanes.findIndex((l) => l["@id"] === step.lane);
          if (laneIndex >= 0) sourceY = 100 + laneIndex * 200;
        }
        const isSourceEvent =
          step.step_type === "start" ||
          step.step_type === "end" ||
          step.step_type.includes("Event");
        const sourceWidth = isSourceEvent ? 36 : 100;
        const sourceHeight = isSourceEvent ? 36 : 80;

        bpmnXml += `\n      <bpmndi:BPMNEdge id="Edge_Flow_${step["@id"]}_to_${gwId}" bpmnElement="Flow_${step["@id"]}_to_${gwId}">`;
        bpmnXml += `\n        <di:waypoint x="${sourcePos.x + sourceWidth}" y="${sourceY + sourceHeight / 2}" />`;
        bpmnXml += `\n        <di:waypoint x="${gwPos.x}" y="${gwPos.y + 25}" />`;
        bpmnXml += `\n      </bpmndi:BPMNEdge>`;
      }

      // Gateway → each target edge
      step.transitions.forEach((t, i) => {
        const targetPos = stepPositions[t.target_id];
        if (gwPos && targetPos) {
          const targetStep = process.steps.find((s) => s["@id"] === t.target_id);
          const isTargetEvent = targetStep
            ? targetStep.step_type === "start" ||
              targetStep.step_type === "end" ||
              targetStep.step_type.includes("Event")
            : false;
          const targetHeight = isTargetEvent ? 36 : 80;
          let targetY = targetPos.y;
          if (process.lanes && targetStep?.lane) {
            const laneIndex = process.lanes.findIndex((l) => l["@id"] === targetStep.lane);
            if (laneIndex >= 0) targetY = 100 + laneIndex * 200;
          }

          bpmnXml += `\n      <bpmndi:BPMNEdge id="Edge_Flow_${gwId}_to_${t.target_id}" bpmnElement="Flow_${gwId}_to_${t.target_id}">`;
          if (i === 0) {
            bpmnXml += `\n        <di:waypoint x="${gwPos.x + 25}" y="${gwPos.y}" />`;
          } else {
            bpmnXml += `\n        <di:waypoint x="${gwPos.x + 25}" y="${gwPos.y + 50}" />`;
          }
          bpmnXml += `\n        <di:waypoint x="${targetPos.x}" y="${targetY + targetHeight / 2}" />`;
          bpmnXml += `\n      </bpmndi:BPMNEdge>`;
        }
      });
    } else {
      step.transitions.forEach((t) => {
        const sourcePos = stepPositions[step["@id"]];
        const targetPos = stepPositions[t.target_id];
        if (sourcePos && targetPos) {
          let sourceY = sourcePos.y;
          let targetY = targetPos.y;
          if (process.lanes && step.lane) {
            const laneIndex = process.lanes.findIndex((l) => l["@id"] === step.lane);
            if (laneIndex >= 0) sourceY = 100 + laneIndex * 200;
          }
          const targetStep = process.steps.find((s) => s["@id"] === t.target_id);
          if (targetStep && process.lanes && targetStep.lane) {
            const laneIndex = process.lanes.findIndex((l) => l["@id"] === targetStep.lane);
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
