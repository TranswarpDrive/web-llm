import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useConversationStore } from '@/stores/conversationStore';
import { useProviderStore } from '@/stores/providerStore';
import { useModelStore } from '@/stores/modelStore';
import { useAssistantStore } from '@/stores/assistantStore';
import {
  BookOpen,
  Bot,
  Camera,
  Check,
  ChevronDown,
  Copy,
  Database,
  FilePlus,
  Globe,
  ImagePlus,
  Paperclip,
  Pencil,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Square,
  Trash2,
  Wand2,
  Wrench,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmAction } from '@/components/FormControls';
import { exportConversationImage, fetchCompleteConversation } from '@/lib/conversationExport';
import { describeImagesWithOcr, fileToDataUrl } from '@/lib/aiTasks';
import { getUserPreferences } from '@/lib/userPreferences';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ModelParams } from '@/types';

type ChatMenu = 'model' | 'knowledge' | 'tools' | 'params' | 'assistant' | null;

const DEFAULT_PARAMS: ModelParams = { temperature: 0.7, max_tokens: 4096, top_p: 1.0 };

export function ChatView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    active, messages, streaming, streamingContent, streamingToolCalls, error,
    selectConversation, sendMessage, cancelStream, regenerate,
    editMessage, deleteMessage, update, clearError, create, loadMoreMessages,
  } = useConversationStore();
  const { providers, fetch: fetchProviders } = useProviderStore();
  const { models, fetch: fetchModels } = useModelStore();
  const { assistants, fetch: fetchAssistants } = useAssistantStore();

  const [input, setInput] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [activeMenu, setActiveMenu] = useState<ChatMenu>(null);
  const [params, setParams] = useState<ModelParams>(DEFAULT_PARAMS);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [editingMsg, setEditingMsg] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<Array<{ id: string; url: string; file: File }>>([]);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ id: string; name: string; content: string }>>([]);
  const [kbIds, setKbIds] = useState<string[]>([]);
  const [availableKbs, setAvailableKbs] = useState<Array<{ id: string; name: string }>>([]);
  const [webSearchOn, setWebSearchOn] = useState(false);
  const [composerNotice, setComposerNotice] = useState('');
  const [visionSwitch, setVisionSwitch] = useState<{ modelId: string; modelName: string; currentName: string } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchProviders(); fetchModels(); fetchAssistants(); }, [fetchProviders, fetchModels, fetchAssistants]);
  useEffect(() => { if (id) selectConversation(id).catch(() => navigate('/')); }, [id, navigate, selectConversation]);
  useEffect(() => {
    if (!active) return;
    setSystemPrompt(active.system_prompt || '');
    setParams(active.params || DEFAULT_PARAMS);
    setKbIds(active.knowledge_base_ids || []);
  }, [active]);
  useEffect(() => {
    if (!active?.model_id) return;
    const model = models.find(m => m.id === active.model_id);
    if (model) {
      setSelectedModel(model.id);
      setSelectedProvider(model.provider_id);
    }
  }, [active, models]);
  useEffect(() => {
    if (!selectedProvider && providers.length > 0) {
      const activeProvider = providers.find(p => p.is_active);
      if (activeProvider) setSelectedProvider(activeProvider.id);
    }
  }, [providers, selectedProvider]);

  const availableModels = models.filter(m => m.provider_id === selectedProvider && m.is_active && (m.type === 'chat' || m.type === 'vision' || m.type === 'reasoning' || m.capabilities?.chat));
  const selectedProviderData = providers.find(p => p.id === selectedProvider);
  const selectedModelData = models.find(m => m.id === selectedModel);
  const selectedKbNames = availableKbs.filter(kb => kbIds.includes(kb.id)).map(kb => kb.name);

  useEffect(() => {
    if (!selectedModel && availableModels.length > 0) {
      const preferredModel = models.find(model => model.id === getUserPreferences().defaultConversationModelId && model.is_active);
      if (preferredModel) {
        setSelectedProvider(preferredModel.provider_id);
        setSelectedModel(preferredModel.id);
        return;
      }
      const def = availableModels.find(m => m.is_default_per_type) || availableModels[0];
      setSelectedModel(def.id);
    }
  }, [availableModels, models, selectedModel]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingContent, streamingToolCalls]);
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 190) + 'px';
  }, [input]);
  useEffect(() => {
    fetch('/api/knowledge-bases', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(d => setAvailableKbs(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [input, selectedProvider, selectedModel, streaming, uploadedFiles, uploadedImages, kbIds, systemPrompt, params, webSearchOn]);

  function toggleKb(kbId: string) {
    setKbIds(prev => prev.includes(kbId) ? prev.filter(id => id !== kbId) : [...prev, kbId]);
  }

  function applyAssistant(a: typeof assistants[number]) {
    setSystemPrompt(a.system_prompt || '');
    if (a.params && Object.keys(a.params).length > 0) setParams({ ...DEFAULT_PARAMS, ...a.params });
    if (a.default_model_id) {
      const model = models.find(m => m.id === a.default_model_id && m.is_active);
      if (model) { setSelectedProvider(model.provider_id); setSelectedModel(model.id); }
    }
    setActiveMenu(null);
  }

  async function getTools(): Promise<unknown[] | undefined> {
    const tools: unknown[] = [];
    if (webSearchOn) {
      tools.push({
        type: 'function',
        function: { name: 'web_search', description: 'Search the web', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      });
    }
    return tools.length > 0 ? tools : undefined;
  }

  async function handleSend() {
    if (!input.trim() || streaming || !selectedProvider || !selectedModel) return;

    const msg = input.trim();
    const curModel = models.find(m => m.id === selectedModel);
    const currentModelSupportsVision = Boolean(curModel?.capabilities?.vision || curModel?.type === 'vision');
    let ocrText = '';

    if (uploadedImages.length > 0 && curModel && !currentModelSupportsVision) {
      const prefs = getUserPreferences();
      if (prefs.ocrModelId) {
        try {
          setComposerNotice('正在用 OCR 模型识别图片...');
          ocrText = await describeImagesWithOcr(uploadedImages, msg, models);
        } catch (err: any) {
          setComposerNotice(err?.message || 'OCR 识图失败，请检查设置里的 OCR 模型。');
          return;
        }
      } else {
        const visionModel = availableModels.find(m => m.capabilities?.vision || m.type === 'vision');
        if (visionModel) {
          setVisionSwitch({ modelId: visionModel.id, modelName: visionModel.display_name, currentName: curModel.display_name });
          setComposerNotice('');
          return;
        } else {
          setComposerNotice(`"${curModel.display_name}" 不支持图片。请在设置里配置 OCR 模型，或切换到视觉模型。`);
          return;
        }
      }
    }

    setInput('');
    setActiveMenu(null);
    setComposerNotice('');
    setVisionSwitch(null);

    let convId = id;
    if (!convId) {
      convId = await create();
      navigate(`/chat/${convId}`, { replace: true });
    }

    if (convId) {
      await update(convId, { system_prompt: systemPrompt, model_id: selectedModel, params, knowledge_base_ids: kbIds });
    }

    let fullMsg = msg;
    if (uploadedFiles.length > 0) {
      const ctx = uploadedFiles.map(f => `[File: ${f.name}]\n${f.content}`).join('\n\n---\n\n');
      fullMsg = `${msg}\n\n--- Attached files ---\n\n${ctx}`;
    }
    if (ocrText) {
      fullMsg = `${fullMsg}\n\n--- 图片识别结果（由 OCR 模型生成） ---\n\n${ocrText}`;
    }
    setUploadedFiles([]);

    let content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> = fullMsg;
    if (uploadedImages.length > 0 && !ocrText) {
      content = [{ type: 'text', text: fullMsg }];
      for (const img of uploadedImages) content.push({ type: 'image_url', image_url: { url: await fileToDataUrl(img.file) } });
    }
    setUploadedImages([]);

    const tools = await getTools();
    await sendMessage(typeof content === 'string' ? content : JSON.stringify(content), { providerId: selectedProvider, modelId: selectedModel, params, tools, kbIds });
  }

  async function handleRegenerate() {
    if (streaming || !selectedProvider || !selectedModel) return;
    const tools = await getTools();
    await regenerate({ providerId: selectedProvider, modelId: selectedModel, params, tools, kbIds });
  }

  function handleCopy(text: string, msgId: string) {
    navigator.clipboard.writeText(text);
    setCopied(msgId);
    setTimeout(() => setCopied(null), 2000);
  }
  function handleEdit(msgId: string, content: string) { setEditingMsg(msgId); setEditContent(typeof content === 'string' ? content : JSON.stringify(content)); }
  async function handleSaveEdit() { if (editingMsg) { await editMessage(editingMsg, editContent); setEditingMsg(null); } }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setUploadedImages(prev => [...prev, ...files.map(f => ({ id: crypto.randomUUID(), url: URL.createObjectURL(f), file: f }))]);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }
  function removeImage(id: string) {
    setUploadedImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img) URL.revokeObjectURL(img.url);
      return prev.filter(i => i.id !== id);
    });
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      let content = '';
      try {
        if (f.type === 'application/pdf' || f.name.endsWith('.pdf')) {
          const pdfjsLib = await import('pdfjs-dist');
          pdfjsLib.GlobalWorkerOptions.workerSrc = '';
          const buf = await f.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const text = await page.getTextContent();
            content += text.items.map((item: any) => item.str).join(' ') + '\n';
          }
        } else {
          content = await f.text();
        }
        if (content.length > 50000) content = content.slice(0, 50000) + '\n...(truncated)';
      } catch {
        content = `[Could not parse: ${f.name}]`;
      }
      setUploadedFiles(prev => [...prev, { id: crypto.randomUUID(), name: f.name, content }]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(id: string) {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  }

  async function handleScreenshot() {
    if (!active && allMessages.length === 0) return;

    try {
      const remoteConversation = active?.id
        ? await fetchCompleteConversation(active.id)
        : { title: '未命名对话', messages: [] };
      const remoteIds = new Set((remoteConversation.messages || []).map((message: { id?: string }) => message.id).filter(Boolean));
      const localOnlyMessages = allMessages.filter(message => !remoteIds.has(message.id));
      const liveMessages = [...(remoteConversation.messages || []), ...localOnlyMessages];

      if (streamingContent || streamingToolCalls.length > 0) {
        liveMessages.push({
          id: 'streaming',
          conversation_id: active?.id || '',
          role: 'assistant',
          content: streamingContent,
          created_at: new Date().toISOString(),
          tool_calls: streamingToolCalls.map(toolCall => ({
            id: toolCall.id,
            type: 'function' as const,
            function: { name: toolCall.name, arguments: toolCall.arguments },
          })),
        });
      }

      await exportConversationImage({
        ...remoteConversation,
        title: active?.title || remoteConversation.title,
        model_id: selectedModelData?.display_name || remoteConversation.model_id,
        messages: liveMessages,
        total_messages: liveMessages.length,
      }, {
        includeSystemPrompt: false,
        includeModelInfo: true,
        includeTimestamps: true,
        includeToolCalls: true,
        includeCitations: true,
      });
      setComposerNotice('');
    } catch {
      setComposerNotice('截图导出失败，请稍后再试。');
    }
  }

  const allMessages = [...messages];

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-card">
      <header className="sticky top-0 z-30 border-b bg-card/90 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={active?.title || '未命名对话'}
              onChange={e => id && update(id, { title: e.target.value })}
              className="h-8 w-full bg-transparent text-sm font-medium outline-none"
              placeholder="未命名对话"
            />
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {selectedProviderData?.name || '未选择服务商'} / {selectedModelData?.display_name || '未选择模型'}
              {selectedKbNames.length > 0 && ` · ${selectedKbNames.join('、')}`}
            </p>
          </div>

          <div className="relative flex items-center gap-1">
            {assistants.length > 0 && (
              <button
                onClick={() => setActiveMenu(activeMenu === 'assistant' ? null : 'assistant')}
                className={cn('flex h-9 items-center justify-center rounded-md border px-2.5 text-muted-foreground hover:bg-accent hover:text-foreground', activeMenu === 'assistant' && 'bg-accent text-foreground')}
                title="助手"
                aria-label="选择助手"
              >
                <Wand2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setActiveMenu(activeMenu === 'model' ? null : 'model')}
              className={cn('flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-accent', activeMenu === 'model' && 'bg-accent')}
              aria-label="选择模型"
            >
              <Bot className="h-4 w-4" />
              <span className="hidden max-w-32 truncate sm:inline">{selectedModelData?.display_name || '模型'}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setActiveMenu(activeMenu === 'params' ? null : 'params')}
              className={cn('flex h-9 items-center justify-center rounded-md border px-2.5 text-muted-foreground hover:bg-accent hover:text-foreground', activeMenu === 'params' && 'bg-accent text-foreground')}
              title="参数"
              aria-label="打开参数菜单"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            <button
              onClick={handleScreenshot}
              className="hidden h-9 items-center justify-center rounded-md border px-2.5 text-muted-foreground hover:bg-accent hover:text-foreground sm:flex"
              title="截图"
              aria-label="截图"
            >
              <Camera className="h-4 w-4" />
            </button>

            {activeMenu === 'assistant' && (
              <div className="absolute right-0 top-11 z-50 w-[300px] rounded-md border bg-card p-2 shadow-xl">
                <div className="mb-1 flex items-center justify-between px-2 py-1">
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">助手</span>
                  <button onClick={() => { setActiveMenu(null); navigate('/assistants'); }} className="text-xs text-primary hover:underline">管理</button>
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {assistants.map(a => (
                    <button
                      key={a.id}
                      onClick={() => applyAssistant(a)}
                      className="flex w-full items-start gap-2 rounded px-2 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-sm">
                        {a.emoji || <Wand2 className="h-3.5 w-3.5 text-primary" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{a.name}</span>
                        {a.system_prompt && <span className="block truncate text-xs text-muted-foreground">{a.system_prompt}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeMenu === 'model' && (
              <div className="absolute right-0 top-11 z-50 w-[340px] rounded-md border bg-card p-2 shadow-xl">
                <div className="grid grid-cols-[118px_1fr] gap-2">
                  <div className="space-y-1 border-r pr-2">
                    <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">服务商</p>
                    {providers.filter(p => p.is_active).map(provider => (
                      <button
                        key={provider.id}
                        onClick={() => {
                          setSelectedProvider(provider.id);
                          const nextModel = models.find(m => m.provider_id === provider.id && m.is_active && (m.type === 'chat' || m.type === 'vision'));
                          if (nextModel) setSelectedModel(nextModel.id);
                        }}
                        className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent', selectedProvider === provider.id && 'bg-accent font-medium')}
                      >
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        <span className="truncate">{provider.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">模型</p>
                    {availableModels.map(model => (
                      <button
                        key={model.id}
                        onClick={() => { setSelectedModel(model.id); setActiveMenu(null); }}
                        className={cn('flex w-full items-start gap-2 rounded px-2 py-2 text-left text-sm hover:bg-accent', selectedModel === model.id && 'bg-accent')}
                      >
                        <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{model.display_name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{model.model_id}</span>
                        </span>
                        {selectedModel === model.id && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
                      </button>
                    ))}
                    {availableModels.length === 0 && (
                      <button onClick={() => navigate('/models')} className="w-full rounded border border-dashed px-3 py-4 text-center text-xs text-muted-foreground hover:bg-accent">
                        添加模型
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeMenu === 'params' && (
              <div className="absolute right-0 top-11 z-50 w-[360px] rounded-md border bg-card p-3 shadow-xl">
                <label className="block text-xs font-medium text-muted-foreground">System Prompt</label>
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  className="mt-1 min-h-[92px] w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  rows={4}
                />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    ['温度', 'temperature', 0, 2, 0.1],
                    ['最大 tokens', 'max_tokens', 1, 131072, 1],
                    ['Top P', 'top_p', 0, 1, 0.1],
                  ].map(([label, key, min, max, step]) => (
                    <label key={key as string} className="space-y-1 text-xs text-muted-foreground">
                      {label as string}
                      <input
                        type="number"
                        step={step as number}
                        min={min as number}
                        max={max as number}
                        value={(params as any)[key] ?? ''}
                        onChange={e => setParams(p => ({ ...p, [key as string]: parseFloat(e.target.value) || undefined }))}
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div id="messages-container" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col px-4 pb-32 pt-6">
          {allMessages.length === 0 && !streaming && (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Bot className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">今天想聊什么？</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">选择模型、知识库和工具后，直接开始你的工作流。</p>
              <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-3">
                {[
                  ['整理资料', '把这段内容整理成结构化笔记'],
                  ['检索知识库', '基于知识库回答一个问题'],
                  ['写代码', '帮我重构一个 React 组件'],
                ].map(([title, text]) => (
                  <button
                    key={title}
                    onClick={() => setInput(text)}
                    className="rounded-md border bg-background px-3 py-3 text-left text-sm transition hover:bg-accent"
                  >
                    <span className="block font-medium">{title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(active as any)?._hasMore && (
            <button
              onClick={async () => { if (id) await loadMoreMessages(id); }}
              className="mx-auto mb-6 rounded-md border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              加载更早消息
            </button>
          )}

          <div className="space-y-8">
            {allMessages.filter(m => m.role !== 'system').map((msg, idx) => (
              <div key={msg.id} className={cn('group flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                {msg.role !== 'user' && (
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {msg.role === 'tool' ? <Wrench className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                )}
                <div className={cn('min-w-0 text-sm leading-6', msg.role === 'user' ? 'max-w-[78%] rounded-2xl bg-muted px-4 py-2.5' : 'max-w-[calc(100%-44px)] flex-1')}>
                  {editingMsg === msg.id ? (
                    <div className="space-y-2">
                      <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="min-h-[90px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring" rows={4} />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingMsg(null)} className="rounded-md px-2 py-1 text-xs hover:bg-accent">取消</button>
                        <button onClick={handleSaveEdit} className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground">保存</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {msg.tool_calls && msg.tool_calls.length > 0 && (
                        <div className="mb-3 space-y-1">
                          {msg.tool_calls.map((tc, i) => (
                            <div key={tc.id || i} className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs">
                              <Wrench className="h-3.5 w-3.5 shrink-0 text-primary" />
                              <span className="font-medium">{tc.function.name}</span>
                              <span className="truncate text-muted-foreground">{tc.function.arguments.slice(0, 90)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {streamingToolCalls.length > 0 && idx === allMessages.length - 1 && (
                        <div className="mb-3 space-y-1">
                          {streamingToolCalls.map((tc, i) => (
                            <div key={tc.id || i} className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs">
                              <Wrench className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />
                              <span className="font-medium">{tc.name || 'tool'}</span>
                              <span className="truncate text-muted-foreground">{tc.arguments?.slice(0, 80) || '...'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mb-3 space-y-1 rounded-md border bg-background p-2">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><BookOpen className="h-3.5 w-3.5" />引用</div>
                          {msg.citations.map((c, i) => (
                            <div key={i} className="rounded bg-muted/70 px-2 py-1.5 text-xs">
                              <span className="font-medium">[{c.index}] {c.document_name}</span>
                              <span className="ml-1 text-muted-foreground">({(c.similarity * 100).toFixed(0)}%)</span>
                              <p className="mt-0.5 line-clamp-2 text-muted-foreground">{c.chunk_content?.slice(0, 150)}...</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none break-words dark:prose-invert">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                            {typeof msg.content === 'string' ? msg.content : ''}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap break-words">{typeof msg.content === 'string' ? msg.content : '(media)'}</div>
                      )}
                      <div className={cn('mt-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100', msg.role === 'user' && 'justify-end')}>
                        <button onClick={() => handleCopy(typeof msg.content === 'string' ? msg.content : '', msg.id)} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="复制">
                          {copied === msg.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        {msg.role === 'user' && (
                          <>
                            <button onClick={() => handleEdit(msg.id, typeof msg.content === 'string' ? msg.content : '')} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="编辑"><Pencil className="h-3.5 w-3.5" /></button>
                            <ConfirmAction
                              onConfirm={() => deleteMessage(msg.id)}
                              className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              confirmLabel="删除"
                              title="删除"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </ConfirmAction>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}

            {streamingContent && (
              <div className="flex gap-3">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 text-sm leading-6">
                  <div className="prose prose-sm max-w-none break-words dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{streamingContent}</ReactMarkdown>
                  </div>
                  <span className="inline-block h-4 w-2 rounded-sm bg-foreground align-text-bottom opacity-70 animate-pulse" />
                </div>
              </div>
            )}
            {streaming && !streamingContent && streamingToolCalls.length === 0 && (
              <div className="flex gap-3">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Bot className="h-4 w-4" /></div>
                <div className="mt-2 flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {error && (
        <div className="absolute bottom-32 left-1/2 z-30 flex w-[min(760px,calc(100%-2rem))] -translate-x-1/2 items-center justify-between rounded-md border border-destructive/30 bg-card px-3 py-2 text-sm text-destructive shadow-lg">
          <span className="truncate">{error}</span>
          <div className="ml-3 flex shrink-0 gap-2">
            <button onClick={handleRegenerate} className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-destructive/10"><RefreshCw className="h-3.5 w-3.5" />重试</button>
            <button onClick={clearError} className="rounded px-2 py-1 text-xs hover:bg-destructive/10">关闭</button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-card via-card to-transparent px-4 pb-4 pt-12">
        <div className="pointer-events-auto mx-auto max-w-3xl">
          {visionSwitch && (
            <div className="mb-2 flex items-start gap-3 rounded-md border border-primary/20 bg-card px-3 py-2 text-sm shadow-sm">
              <ImagePlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">当前模型不支持图片</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {visionSwitch.currentName} 无法处理图片，可切换到 {visionSwitch.modelName} 后继续发送。
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedModel(visionSwitch.modelId);
                  setVisionSwitch(null);
                }}
                className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                切换
              </button>
              <button onClick={() => setVisionSwitch(null)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {composerNotice && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-card px-3 py-2 text-sm text-destructive shadow-sm">
              <span className="min-w-0 truncate">{composerNotice}</span>
              <button onClick={() => setComposerNotice('')} className="shrink-0 rounded-md p-1 hover:bg-destructive/10">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {(uploadedFiles.length > 0 || uploadedImages.length > 0) && (
            <div className="mb-2 flex flex-wrap gap-2">
              {uploadedFiles.map(f => (
                <div key={f.id} className="flex max-w-[220px] items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-sm">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{f.name}</span>
                  <button onClick={() => removeFile(f.id)} className="shrink-0 rounded hover:bg-accent"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {uploadedImages.map(img => (
                <div key={img.id} className="relative h-16 w-16 overflow-hidden rounded-md border bg-card shadow-sm">
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                  <button onClick={() => removeImage(img.id)} className="absolute right-0 top-0 rounded-bl bg-black/55 p-0.5 text-white"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}

          {activeMenu === 'knowledge' && (
            <div className="mb-2 rounded-md border bg-card p-2 shadow-xl">
              <div className="mb-1 flex items-center justify-between px-2 py-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">知识库</span>
                <button
                  onClick={() => {
                    setActiveMenu(null);
                    navigate('/knowledge-bases');
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  管理
                </button>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {availableKbs.map(kb => {
                  const checked = kbIds.includes(kb.id);
                  return (
                    <button
                      key={kb.id}
                      onClick={() => toggleKb(kb.id)}
                      className={cn('flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-accent', checked && 'bg-primary/5 text-primary')}
                    >
                      <span className={cn('flex h-4 w-4 items-center justify-center rounded border', checked && 'border-primary bg-primary text-primary-foreground')}>
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{kb.name}</span>
                    </button>
                  );
                })}
                {availableKbs.length === 0 && (
                  <button
                    onClick={() => {
                      setActiveMenu(null);
                      navigate('/knowledge-bases');
                    }}
                    className="w-full rounded border border-dashed px-3 py-4 text-center text-xs text-muted-foreground hover:bg-accent"
                  >
                    创建知识库
                  </button>
                )}
              </div>
            </div>
          )}

          {activeMenu === 'tools' && (
            <div className="mb-2 rounded-md border bg-card p-2 shadow-xl">
              <button
                onClick={() => setWebSearchOn(v => !v)}
                className={cn('flex w-full items-center gap-3 rounded px-2 py-2.5 text-left text-sm hover:bg-accent', webSearchOn && 'bg-primary/5 text-primary')}
              >
                <Globe className="h-4 w-4" />
                <span className="flex-1">联网搜索</span>
                <span className={cn('h-5 w-9 rounded-full border p-0.5 transition', webSearchOn ? 'border-primary bg-primary' : 'bg-muted')}>
                  <span className={cn('block h-3.5 w-3.5 rounded-full bg-card transition', webSearchOn && 'translate-x-4')} />
                </span>
              </button>
              <button
                onClick={() => {
                  setActiveMenu(null);
                  navigate('/mcp');
                }}
                className="flex w-full items-center gap-3 rounded px-2 py-2.5 text-left text-sm hover:bg-accent"
              >
                <Wrench className="h-4 w-4" />
                <span className="flex-1">MCP 工具白名单</span>
                <ChevronDown className="-rotate-90 h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <button
                onClick={handleRegenerate}
                disabled={streaming || allMessages.length === 0}
                className="flex w-full items-center gap-3 rounded px-2 py-2.5 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="flex-1">重新生成</span>
              </button>
            </div>
          )}

          <div className="rounded-2xl border bg-card p-2 shadow-[0_18px_55px_rgba(15,23,42,0.12)]">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="给 WebLLM 发送消息"
              rows={1}
              disabled={streaming}
              className="max-h-[190px] min-h-[52px] w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-6 outline-none disabled:opacity-50"
            />
            <div className="flex items-center justify-between gap-2 border-t px-1.5 pt-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                <button onClick={() => imageInputRef.current?.click()} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" title="上传图片">
                  <ImagePlus className="h-4 w-4" />
                  <span className="hidden sm:inline">图片</span>
                </button>
                <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.html,.csv,.json,.log" multiple className="hidden" onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current?.click()} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" title="上传文件">
                  <FilePlus className="h-4 w-4" />
                  <span className="hidden sm:inline">文件</span>
                </button>
                <button
                  onClick={() => setActiveMenu(activeMenu === 'knowledge' ? null : 'knowledge')}
                  className={cn('flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground', kbIds.length > 0 && 'bg-primary/10 text-primary')}
                  title="知识库"
                >
                  <Database className="h-4 w-4" />
                  <span className="hidden sm:inline">知识库{kbIds.length > 0 ? ` ${kbIds.length}` : ''}</span>
                </button>
                <button
                  onClick={() => setActiveMenu(activeMenu === 'tools' ? null : 'tools')}
                  className={cn('flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground', webSearchOn && 'bg-primary/10 text-primary')}
                  title="工具"
                >
                  <Wrench className="h-4 w-4" />
                  <span className="hidden sm:inline">工具{webSearchOn ? ' 1' : ''}</span>
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                {allMessages.length > 0 && !streaming && (
                  <button onClick={handleRegenerate} className="hidden h-8 items-center justify-center rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground sm:flex" title="重新生成">
                    <RefreshCw className="h-4 w-4" />
                  </button>
                )}
                {streaming ? (
                  <button onClick={cancelStream} className="flex h-9 w-9 items-center justify-center rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90" title="停止">
                    <Square className="h-4 w-4" fill="currentColor" />
                  </button>
                ) : (
                  <button onClick={handleSend} disabled={!input.trim() || !selectedModel} className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45" title="发送">
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <Search className="h-3 w-3" />
            <span>{selectedModelData?.display_name || '请选择模型'}{webSearchOn ? ' · 联网搜索已开启' : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
