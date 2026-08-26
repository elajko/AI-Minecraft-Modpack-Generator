export const VERSION_TYPE_COLORS: Record<string, string> = {
  release: '#4caf50',
  snapshot: '#ff9800',
  beta: '#2196f3',
  alpha: '#f44336',
  other: '#9e9e9e',
};

export function colorForVersionType(type: string): string {
  return VERSION_TYPE_COLORS[type] ?? '#9c27b0';
}
