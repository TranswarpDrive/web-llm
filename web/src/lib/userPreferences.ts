export const DEFAULT_TITLE_PROMPT = `请根据下面的对话内容生成一个简洁中文标题。
要求：
- 8 到 18 个汉字，最多 24 个字符
- 不要使用引号、句号、冒号
- 不要解释，不要换行
- 只输出标题本身`;

export const DEFAULT_OCR_PROMPT = `你是图像文字识别和视觉理解助手。请阅读用户提供的图片，输出给另一个对话模型可直接使用的中文描述。
请包含：
1. 图片中的可见文字，尽量保持原文
2. 关键物体、界面、布局和上下文
3. 与用户问题相关的细节
如果图片没有文字，请说明没有可识别文字。
只输出识别结果，不要回答用户问题。`;

export interface UserPreferences {
  defaultConversationModelId: string;
  titleGenerationModelId: string;
  ocrModelId: string;
  titleGenerationPrompt: string;
  ocrPrompt: string;
}

const STORAGE_KEY = 'webllm:user-preferences';

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  defaultConversationModelId: '',
  titleGenerationModelId: '',
  ocrModelId: '',
  titleGenerationPrompt: DEFAULT_TITLE_PROMPT,
  ocrPrompt: DEFAULT_OCR_PROMPT,
};

export function getUserPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_USER_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return normalizePreferences(parsed);
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
}

export function saveUserPreferences(next: Partial<UserPreferences>) {
  const merged = normalizePreferences({ ...getUserPreferences(), ...next });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function resetUserPrompts() {
  return saveUserPreferences({
    titleGenerationPrompt: DEFAULT_TITLE_PROMPT,
    ocrPrompt: DEFAULT_OCR_PROMPT,
  });
}

function normalizePreferences(value: Partial<UserPreferences>): UserPreferences {
  return {
    defaultConversationModelId: value.defaultConversationModelId || '',
    titleGenerationModelId: value.titleGenerationModelId || '',
    ocrModelId: value.ocrModelId || '',
    titleGenerationPrompt: value.titleGenerationPrompt || DEFAULT_TITLE_PROMPT,
    ocrPrompt: value.ocrPrompt || DEFAULT_OCR_PROMPT,
  };
}
