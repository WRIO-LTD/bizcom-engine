declare module "jexl" {
  interface Jexl {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addTransform(name: string, transform: (...args: any[]) => any): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addFunction(name: string, fn: (...args: any[]) => any): void;
    eval(expression: string, context?: Record<string, unknown>): Promise<unknown>;
  }

  const jexl: Jexl;
  export default jexl;
}
