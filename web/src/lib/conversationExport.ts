import type { Citation, Conversation, Message, MessageContent, ToolCall } from '@/types';

export interface ConversationExportOptions {
  includeSystemPrompt: boolean;
  includeModelInfo: boolean;
  includeTimestamps: boolean;
  includeToolCalls: boolean;
  includeCitations: boolean;
}

type ConversationForExport = Partial<Conversation> & {
  messages?: Array<Partial<Message>>;
  total_messages?: number;
  has_more?: boolean;
};

type ApiFetcher = (path: string) => Promise<any>;

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; url?: string };

const DEFAULT_IMAGE_OPTIONS: ConversationExportOptions = {
  includeSystemPrompt: false,
  includeModelInfo: true,
  includeTimestamps: true,
  includeToolCalls: true,
  includeCitations: true,
};

const ROLE_LABELS: Record<string, string> = {
  system: '系统',
  user: '你',
  assistant: '助手',
  tool: '工具',
};

const ROLE_INITIALS: Record<string, string> = {
  system: 'S',
  user: '你',
  assistant: 'AI',
  tool: 'T',
};

export async function fetchCompleteConversation(id: string, apiFetcher: ApiFetcher = defaultApiFetcher) {
  const pageSize = 200;
  const firstPage = await apiFetcher(`/conversations/${id}?limit=${pageSize}`);
  let messages = Array.isArray(firstPage.messages) ? firstPage.messages : [];
  let cursor = messages[0]?.created_at;
  let hasMore = Boolean(firstPage.has_more && cursor);
  let pageCount = 0;

  while (hasMore && cursor && pageCount < 100) {
    const page = await apiFetcher(`/conversations/${id}?limit=${pageSize}&before=${encodeURIComponent(cursor)}`);
    const pageMessages = Array.isArray(page.messages) ? page.messages : [];
    if (pageMessages.length === 0) break;

    messages = [...pageMessages, ...messages];
    cursor = pageMessages[0]?.created_at;
    hasMore = Boolean(page.has_more && cursor);
    pageCount += 1;
  }

  return { ...firstPage, messages, has_more: false };
}

export async function exportConversationImage(
  conversation: ConversationForExport,
  options: Partial<ConversationExportOptions> = {},
) {
  const mergedOptions = { ...DEFAULT_IMAGE_OPTIONS, ...options };
  const node = createConversationImageNode(conversation, mergedOptions);
  document.body.appendChild(node);

  try {
    await settleLayout(node);
    const { toPng } = await import('html-to-image');
    const pixelRatio = node.scrollHeight > 18000 ? 1 : 2;
    const dataUrl = await toPng(node, {
      backgroundColor: '#f7f7f8',
      cacheBust: true,
      pixelRatio,
    });

    downloadDataUrl(dataUrl, `${safeFileName(conversation.title || 'conversation')}-${Date.now()}.png`);
  } finally {
    node.remove();
  }
}

function createConversationImageNode(conversation: ConversationForExport, options: ConversationExportOptions) {
  const root = element('div', {
    position: 'fixed',
    left: '-12000px',
    top: '0',
    width: '900px',
    boxSizing: 'border-box',
    padding: '28px',
    background: '#f7f7f8',
    color: '#111827',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    lineHeight: '1.55',
    letterSpacing: '0',
    zIndex: '-1',
  });

  const frame = element('div', {
    overflow: 'hidden',
    border: '1px solid #e5e7eb',
    borderRadius: '18px',
    background: '#ffffff',
    boxShadow: '0 24px 70px rgba(15, 23, 42, 0.10)',
  });
  root.appendChild(frame);

  frame.appendChild(renderHeader(conversation, options));

  if (options.includeSystemPrompt && conversation.system_prompt) {
    frame.appendChild(renderSystemPrompt(conversation.system_prompt));
  }

  const list = element('div', {
    display: 'grid',
    gap: '26px',
    padding: '26px 30px 34px',
    background: '#ffffff',
  });

  const messages = (conversation.messages || []).filter(msg => {
    return msg.role !== 'system' || options.includeSystemPrompt;
  });

  if (messages.length === 0) {
    list.appendChild(element('div', {
      border: '1px dashed #d1d5db',
      borderRadius: '14px',
      padding: '24px',
      color: '#6b7280',
      textAlign: 'center',
    }, '这个对话还没有消息'));
  } else {
    for (const message of messages) {
      list.appendChild(renderMessage(message, options));
    }
  }

  frame.appendChild(list);
  return root;
}

function renderHeader(conversation: ConversationForExport, options: ConversationExportOptions) {
  const header = element('div', {
    borderBottom: '1px solid #e5e7eb',
    padding: '28px 30px 24px',
    background: 'linear-gradient(180deg, #ffffff 0%, #fafafa 100%)',
  });

  header.appendChild(element('div', {
    marginBottom: '10px',
    color: '#6b7280',
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
  }, 'WebLLM 对话导出'));

  header.appendChild(element('h1', {
    margin: '0',
    color: '#111827',
    fontSize: '28px',
    fontWeight: '700',
    lineHeight: '1.25',
    overflowWrap: 'anywhere',
  }, conversation.title || '未命名对话'));

  const meta = [
    options.includeModelInfo && conversation.model_id ? `模型 ${conversation.model_id}` : '',
    conversation.created_at ? `创建于 ${formatDateTime(conversation.created_at)}` : '',
    typeof conversation.total_messages === 'number' ? `${conversation.total_messages} 条消息` : '',
  ].filter(Boolean);

  if (meta.length > 0) {
    header.appendChild(element('div', {
      marginTop: '10px',
      color: '#6b7280',
      fontSize: '13px',
    }, meta.join(' · ')));
  }

  return header;
}

function renderSystemPrompt(prompt: string) {
  const section = element('div', {
    borderBottom: '1px solid #e5e7eb',
    padding: '18px 30px',
    background: '#fbfbfb',
  });

  section.appendChild(element('div', {
    marginBottom: '8px',
    color: '#6b7280',
    fontSize: '12px',
    fontWeight: '700',
  }, '系统提示'));

  section.appendChild(element('div', {
    borderRadius: '12px',
    background: '#f3f4f6',
    padding: '13px 15px',
    color: '#374151',
    fontSize: '13px',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  }, prompt));

  return section;
}

function renderMessage(message: Partial<Message>, options: ConversationExportOptions) {
  const role = message.role || 'assistant';
  const isUser = role === 'user';
  const row = element('div', {
    display: 'flex',
    justifyContent: isUser ? 'flex-end' : 'flex-start',
    gap: '12px',
  });

  if (!isUser) {
    row.appendChild(renderAvatar(role));
  }

  const bubble = element('div', {
    maxWidth: isUser ? '72%' : 'calc(100% - 48px)',
    minWidth: isUser ? '160px' : '0',
    border: isUser ? '1px solid #dbe7e1' : '1px solid #e5e7eb',
    borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
    background: isUser ? '#eef8f3' : '#ffffff',
    padding: '14px 16px',
    boxShadow: isUser ? 'none' : '0 10px 28px rgba(15, 23, 42, 0.06)',
  });

  bubble.appendChild(renderMessageMeta(message, role, options));

  if (options.includeToolCalls && message.tool_calls?.length) {
    bubble.appendChild(renderToolCalls(message.tool_calls));
  }

  const content = element('div', {
    display: 'grid',
    gap: '10px',
    color: '#111827',
    fontSize: '14px',
  });
  appendContentParts(content, extractContentParts(message.content));
  bubble.appendChild(content);

  if (options.includeCitations && message.citations?.length) {
    bubble.appendChild(renderCitations(message.citations));
  }

  row.appendChild(bubble);
  return row;
}

function renderAvatar(role: string) {
  return element('div', {
    display: 'flex',
    width: '36px',
    height: '36px',
    flex: '0 0 36px',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '11px',
    background: role === 'tool' ? '#fef3c7' : role === 'system' ? '#e0e7ff' : '#e6f4ee',
    color: role === 'tool' ? '#92400e' : role === 'system' ? '#3730a3' : '#176348',
    fontSize: '12px',
    fontWeight: '800',
  }, ROLE_INITIALS[role] || 'AI');
}

function renderMessageMeta(message: Partial<Message>, role: string, options: ConversationExportOptions) {
  const meta = element('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '9px',
    color: '#6b7280',
    fontSize: '12px',
  });

  meta.appendChild(element('span', { fontWeight: '700', color: '#374151' }, ROLE_LABELS[role] || role));

  const details = [
    options.includeModelInfo && message.model_used ? message.model_used : '',
    options.includeTimestamps && message.created_at ? formatTime(message.created_at) : '',
  ].filter(Boolean);

  if (details.length > 0) {
    meta.appendChild(element('span', { textAlign: 'right' }, details.join(' · ')));
  }

  return meta;
}

function renderToolCalls(toolCalls: ToolCall[]) {
  const wrap = element('div', {
    display: 'grid',
    gap: '7px',
    marginBottom: '12px',
  });

  for (const call of toolCalls) {
    const item = element('div', {
      border: '1px solid #dbeafe',
      borderRadius: '10px',
      background: '#eff6ff',
      padding: '9px 10px',
      color: '#1e3a8a',
      fontSize: '12px',
    });
    item.appendChild(element('div', { fontWeight: '700' }, call.function?.name || 'tool'));
    if (call.function?.arguments) {
      item.appendChild(element('div', {
        marginTop: '4px',
        color: '#1d4ed8',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      }, call.function.arguments));
    }
    wrap.appendChild(item);
  }

  return wrap;
}

function renderCitations(citations: Citation[]) {
  const wrap = element('div', {
    display: 'grid',
    gap: '8px',
    marginTop: '13px',
    borderTop: '1px solid #e5e7eb',
    paddingTop: '12px',
  });

  wrap.appendChild(element('div', {
    color: '#6b7280',
    fontSize: '12px',
    fontWeight: '700',
  }, '引用来源'));

  for (const citation of citations) {
    const item = element('div', {
      borderRadius: '10px',
      background: '#f9fafb',
      padding: '9px 10px',
      color: '#4b5563',
      fontSize: '12px',
    });
    const title = `[${citation.index}] ${citation.document_name}`;
    const score = Number.isFinite(citation.similarity) ? ` · ${(citation.similarity * 100).toFixed(0)}%` : '';
    item.appendChild(element('div', { fontWeight: '700', color: '#374151' }, `${title}${score}`));
    if (citation.chunk_content) {
      item.appendChild(element('div', {
        marginTop: '4px',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      }, citation.chunk_content));
    }
    wrap.appendChild(item);
  }

  return wrap;
}

function appendContentParts(container: HTMLElement, parts: ContentPart[]) {
  if (parts.length === 0) {
    container.appendChild(element('div', { color: '#9ca3af' }, '空消息'));
    return;
  }

  for (const part of parts) {
    if (part.type === 'text') {
      if (!part.text.trim()) continue;
      container.appendChild(element('div', {
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      }, part.text));
      continue;
    }

    container.appendChild(renderImagePart(part.url));
  }

  if (!container.hasChildNodes()) {
    container.appendChild(element('div', { color: '#9ca3af' }, '空消息'));
  }
}

function renderImagePart(url?: string) {
  if (url && canRenderImageUrl(url)) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = '对话图片';
    Object.assign(image.style, {
      display: 'block',
      maxWidth: '320px',
      maxHeight: '280px',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      objectFit: 'cover',
    });
    return image;
  }

  return element('div', {
    display: 'inline-flex',
    width: 'fit-content',
    alignItems: 'center',
    border: '1px dashed #d1d5db',
    borderRadius: '10px',
    padding: '8px 10px',
    color: '#6b7280',
    fontSize: '12px',
  }, '图片附件');
}

function extractContentParts(content: unknown): ContentPart[] {
  const value = parseJsonIfNeeded(content);

  if (Array.isArray(value)) {
    return value.flatMap((part): ContentPart[] => {
      const typedPart = part as MessageContent;
      if (typedPart.type === 'text') return [{ type: 'text', text: typedPart.text || '' }];
      if (typedPart.type === 'image_url') return [{ type: 'image', url: typedPart.image_url?.url }];
      return [{ type: 'text', text: stringifyValue(part) }];
    });
  }

  if (value && typeof value === 'object' && 'content' in value) {
    return extractContentParts((value as { content: unknown }).content);
  }

  return [{ type: 'text', text: stringifyValue(value) }];
}

function parseJsonIfNeeded(value: unknown) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function stringifyValue(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function canRenderImageUrl(url: string) {
  return url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('/') || url.startsWith(window.location.origin);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 80) || 'conversation';
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function settleLayout(root: HTMLElement) {
  await document.fonts?.ready.catch(() => undefined);
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map(image => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>(resolve => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
      });
    }),
  );
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  styles?: Partial<CSSStyleDeclaration>,
  text?: string,
) {
  const node = document.createElement(tag);
  if (styles) Object.assign(node.style, styles);
  if (text !== undefined) node.textContent = text;
  return node;
}

function defaultApiFetcher(path: string) {
  return window.fetch(`/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
  }).then(response => response.ok ? response.json() : response.json().then(error => { throw error; }));
}
