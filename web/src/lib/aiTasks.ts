import { api } from '@/services/api';
import type { Conversation, Message, Model } from '@/types';
import { getUserPreferences } from '@/lib/userPreferences';

type ChatMessage = { role: string; content: unknown };

export async function generateConversationTitle(conversationId: string) {
  const prefs = getUserPreferences();
  if (!prefs.titleGenerationModelId) {
    throw new Error('请先在设置里选择标题生成模型');
  }

  const conversation = await api.getConversation(conversationId);
  const transcript = buildTranscript(conversation.messages || []);
  if (!transcript.trim()) throw new Error('这个对话还没有可用于生成标题的消息');

  const content = `${prefs.titleGenerationPrompt}\n\n对话内容：\n${transcript}`;
  const result = await callModelOnce(prefs.titleGenerationModelId, [
    { role: 'user', content },
  ], { temperature: 0.2, max_tokens: 80 });

  const title = cleanTitle(extractAssistantContent(result));
  if (!title) throw new Error('标题生成失败');
  return title;
}

export async function describeImagesWithOcr(
  images: Array<{ file: File; name?: string }>,
  userText: string,
  models?: Model[],
) {
  const prefs = getUserPreferences();
  if (!prefs.ocrModelId) throw new Error('请先在设置里选择 OCR 模型');

  const ocrModel = await resolveModel(prefs.ocrModelId, models);
  if (!ocrModel || !(ocrModel.capabilities?.vision || ocrModel.type === 'vision')) {
    throw new Error('OCR 模型不可用或不支持识图');
  }

  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    {
      type: 'text',
      text: `${prefs.ocrPrompt}\n\n用户原始问题：\n${userText || '用户未提供额外文字。'}`,
    },
  ];

  for (const image of images) {
    content.push({ type: 'image_url', image_url: { url: await fileToDataUrl(image.file) } });
  }

  const result = await callModelOnce(ocrModel.id, [
    { role: 'user', content },
  ], { temperature: 0.1, max_tokens: 2048 }, models);

  const text = extractAssistantContent(result).trim();
  if (!text) throw new Error('OCR 模型没有返回识别结果');
  return text;
}

export function extractAssistantContent(response: any) {
  const message = response?.choices?.[0]?.message;
  const content = message?.content ?? response?.choices?.[0]?.text ?? '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => part?.text || part?.content || '').filter(Boolean).join('\n');
  }
  return JSON.stringify(content || '');
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

async function callModelOnce(
  modelId: string,
  messages: ChatMessage[],
  params?: Record<string, unknown>,
  models?: Model[],
) {
  const model = await resolveModel(modelId, models);
  if (!model) throw new Error('模型不可用');

  return api.chatCompletion({
    provider_id: model.provider_id,
    model_id: model.id,
    messages,
    params,
    stream: false,
  });
}

async function resolveModel(modelId: string, models?: Model[]) {
  const source = models || await api.getModels();
  return source.find(model => model.id === modelId && model.is_active);
}

function buildTranscript(messages: Message[]) {
  return messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .slice(-12)
    .map(message => {
      const role = message.role === 'user' ? '用户' : '助手';
      return `${role}: ${contentToText(message.content).slice(0, 1200)}`;
    })
    .join('\n\n')
    .slice(0, 8000);
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return contentToText(JSON.parse(trimmed));
      } catch {
        return content;
      }
    }
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(part => {
      if (part?.type === 'text') return part.text || '';
      if (part?.type === 'image_url') return '[图片]';
      return JSON.stringify(part);
    }).join('\n');
  }

  if (content && typeof content === 'object' && 'content' in content) {
    return contentToText((content as Conversation & { content?: unknown }).content);
  }

  return content == null ? '' : JSON.stringify(content);
}

function cleanTitle(value: string) {
  return value
    .split('\n')[0]
    .replace(/^#+\s*/, '')
    .replace(/^标题[:：]\s*/, '')
    .replace(/["'“”‘’`。.!！]+/g, '')
    .trim()
    .slice(0, 32);
}
