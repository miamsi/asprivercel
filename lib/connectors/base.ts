export interface Connector {
  name: string;
  description: string;
  tools: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  handle: (name: string, args: Record<string, any>, userId: string) => Promise<Record<string, any>>;
  systemPrompt: string;
}
