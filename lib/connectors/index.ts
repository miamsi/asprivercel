import { Connector } from './base';
import { connector as todosConnector } from './todos';
import { connector as notesConnector } from './notes';

export const ALL_CONNECTORS: Record<string, Connector> = {
  [todosConnector.name]: todosConnector,
  [notesConnector.name]: notesConnector,
};

export function getConnectorForTool(toolName: string): Connector | null {
  for (const conn of Object.values(ALL_CONNECTORS)) {
    if (conn.tools.some(t => t.function.name === toolName)) {
      return conn;
    }
  }
  return null;
}

export function toolsFor(connectorNames: string[]): any[] {
  const tools: any[] = [];
  for (const name of connectorNames) {
    const conn = ALL_CONNECTORS[name];
    if (conn) tools.push(...conn.tools);
  }
  return tools;
}

export function promptsFor(connectorNames: string[]): string {
  const parts: string[] = [];
  for (const name of connectorNames) {
    const conn = ALL_CONNECTORS[name];
    if (conn && conn.systemPrompt) {
      parts.push(conn.systemPrompt.trim());
    }
  }
  return parts.join('\n\n');
}
