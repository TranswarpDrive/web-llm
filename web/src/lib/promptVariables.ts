// Prompt variables supported in assistant / system prompts. Kept in sync with
// the worker-side renderer (worker/src/services/promptVars.ts).

export const PROMPT_VARIABLES: { token: string; label: string }[] = [
  { token: '{model}', label: '当前模型名称' },
  { token: '{date}', label: '当前日期' },
  { token: '{time}', label: '当前时间' },
  { token: '{datetime}', label: '日期 + 时间' },
];

/** Client-side preview substitution (server renders authoritatively at send time). */
export function renderPromptVariables(text: string, ctx: { model?: string; now?: Date } = {}): string {
  if (!text || text.indexOf('{') === -1) return text;
  const now = ctx.now || new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const map: Record<string, string> = { model: ctx.model || '当前模型', date, time, datetime: `${date} ${time}` };
  return text.replace(/\{(model|date|time|datetime)\}/g, (_m, key: string) => map[key] ?? _m);
}
