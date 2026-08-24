declare module "bpmn-moddle" {
  export default class BpmnModdle {
    // AS_ANY_JUSTIFICATION: Third-party library typings stub
    constructor(options?: any);
    fromXML(xml: string): Promise<{
      // AS_ANY_JUSTIFICATION: Third-party library typings stub
      rootElement: any;
      // AS_ANY_JUSTIFICATION: Third-party library typings stub
      references: any[];
      // AS_ANY_JUSTIFICATION: Third-party library typings stub
      warnings: any[];
    }>;
  }
}
