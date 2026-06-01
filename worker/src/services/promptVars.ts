/**
 * Render prompt variables in a system prompt at send time.
 * Supported tokens: {model}, {date}, {time}, {datetime}. Unknown braces are left
 * untouched so user text isn't mangled.
 */
export interface PromptVarContext {
  model?: string;
  now?: Date;
}

export function renderPromptVariables(text: string, ctx: PromptVarContext = {}): string {
  if (!text || text.indexOf('{') === -1) return text;
  const now = ctx.now || new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const datetime = `${date} ${time}`;

  const map: Record<string, string> = {
    model: ctx.model || '',
    date,
    time,
    datetime,
  };

  return text.replace(/\{(model|date|time|datetime)\}/g, (_m, key: string) => map[key] ?? _m);
}
