import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useConversationStore } from '@/stores/conversationStore';
import { useProviderStore } from '@/stores/providerStore';
import { useModelStore } from '@/stores/modelStore';
import { Send, Square, Pencil, Trash2, Copy, Check, Settings, ImagePlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ModelParams } from '@/types';

export function ChatView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    active, messages, streaming, streamingContent, error,
    selectConversation, sendMessage, cancelStream,
    editMessage, deleteMessage, update, clearError, create,
  } = useConversationStore();
  const { providers, fetch: fetchProviders } = useProviderStore();
  const { models, fetch: fetchModels } = useModelStore();

  const [input, setInput] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [showParams, setShowParams] = useState(false);
  const [params, setParams] = useState<ModelParams>({ temperature: 0.7, max_tokens: 4096, top_p: 1.0 });
  const [systemPrompt, setSystemPrompt] = useState('');
  const [editingMsg, setEditingMsg] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<Array<{ id: string; url: string; file: File }>>([]);
  const [kbIds, setKbIds] = useState<string[]>([]);
  const [availableKbs, setAvailableKbs] = useState<Array<{ id: string; name: string }>>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Init
  useEffect(() => {
    fetchProviders();
    fetchModels();
  }, [fetchProviders, fetchModels]);

  // Load conversation
  useEffect(() => {
    if (id) {
      selectConversation(id).catch(() => navigate('/'));
    }
  }, [id]);

  // Set defaults from active conversation or first available
  useEffect(() => {
    if (active) {
      setSystemPrompt(active.system_prompt || '');
      setParams(active.params || { temperature: 0.7, max_tokens: 4096, top_p: 1.0 });
    }
  }, [active]);

  useEffect(() => {
    if (active?.model_id) {
      const model = models.find(m => m.id === active.model_id);
      if (model) {
        setSelectedModel(model.id);
        setSelectedProvider(model.provider_id);
      }
    }
  }, [active, models]);

  // Auto-select first available
  useEffect(() => {
    if (!selectedProvider && providers.length > 0) {
      const active = providers.find(p => p.is_active);
      if (active) setSelectedProvider(active.id);
    }
  }, [providers, selectedProvider]);

  // Load available KBs
  useEffect(() => {
    fetch('/api/knowledge-bases', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    }).then(r => r.json()).then(d => setAvailableKbs(d || [])).catch(() => {});
  }, []);

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const newImages = files.map(f => ({
      id: crypto.randomUUID(),
      url: URL.createObjectURL(f),
      file: f,
    }));
    setUploadedImages(prev => [...prev, ...newImages]);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  function removeImage(id: string) {
    setUploadedImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img) URL.revokeObjectURL(img.url);
      return prev.filter(i => i.id !== id);
    });
  }

  const availableModels = models.filter(
    m => m.provider_id === selectedProvider && m.is_active && (m.type === 'chat' || m.type === 'vision')
  );

  useEffect(() => {
    if (!selectedModel && availableModels.length > 0) {
      const def = availableModels.find(m => m.is_default_per_type) || availableModels[0];
      setSelectedModel(def.id);
    }
  }, [availableModels, selectedModel]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  // Keyboard shortcut
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [input, selectedProvider, selectedModel, streaming]);

  async function handleSend() {
    if (!input.trim() || streaming || !selectedProvider || !selectedModel) return;
    const msg = input.trim();
    setInput('');

    // Auto-create conversation if no id
    let convId = id;
    if (!convId) {
      convId = await create();
      navigate(`/chat/${convId}`, { replace: true });
    }

    // Sync system prompt if changed
    if (systemPrompt !== active?.system_prompt && convId) {
      await update(convId, { system_prompt: systemPrompt, model_id: selectedModel, params, knowledge_base_ids: kbIds });
    }

    // Build content with images
    let content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> = msg;
    if (uploadedImages.length > 0) {
      content = [{ type: 'text', text: msg }];
      for (const img of uploadedImages) {
        // For now, use data URL; later use Supabase Storage URLs
        content.push({ type: 'image_url', image_url: { url: img.url } });
      }
    }
    setUploadedImages([]);

    await sendMessage(typeof content === 'string' ? content : JSON.stringify(content), {
      providerId: selectedProvider, modelId: selectedModel, params,
    });
  }

  function handleCopy(text: string, msgId: string) {
    navigator.clipboard.writeText(text);
    setCopied(msgId);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleEdit(msgId: string, content: string) {
    setEditingMsg(msgId);
    setEditContent(typeof content === 'string' ? content : JSON.stringify(content));
  }

  async function handleSaveEdit() {
    if (editingMsg) {
      await editMessage(editingMsg, editContent);
      setEditingMsg(null);
    }
  }

  // Combine persisted messages + streaming
  const allMessages = [...messages];
  if (streaming) {
    const last = allMessages[allMessages.length - 1];
    if (last?.role === 'assistant' && last.id.startsWith('temp-')) {
      allMessages.pop();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chat Header */}
      <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
        <input
          type="text"
          value={active?.title || 'New Chat'}
          onChange={e => id && update(id, { title: e.target.value })}
          className="bg-transparent font-medium text-sm border-none outline-none flex-1"
          placeholder="Chat title"
        />

        <div className="flex items-center gap-2 ml-4">
          {/* Provider dropdown */}
          <select
            value={selectedProvider}
            onChange={e => setSelectedProvider(e.target.value)}
            className="rounded border bg-background px-2 py-1 text-xs max-w-[120px] truncate"
          >
            {providers.filter(p => p.is_active).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Model dropdown */}
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className="rounded border bg-background px-2 py-1 text-xs max-w-[140px] truncate"
          >
            {availableModels.map(m => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>

          {/* KB selector */}
          {availableKbs.length > 0 && (
            <select
              multiple
              value={kbIds}
              onChange={e => setKbIds(Array.from(e.target.selectedOptions, o => o.value))}
              className="rounded border bg-background px-2 py-1 text-xs max-w-[100px] truncate"
              title="Select knowledge bases"
            >
              {availableKbs.map(kb => (
                <option key={kb.id} value={kb.id}>{kb.name}</option>
              ))}
            </select>
          )}

          {/* Params toggle */}
          <button
            onClick={() => setShowParams(!showParams)}
            className={cn('rounded p-1 hover:bg-accent', showParams && 'bg-accent')}
            title="Parameters"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Parameters panel */}
      {showParams && (
        <div className="border-b px-4 py-3 shrink-0 bg-muted/30 space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              className="w-full rounded border bg-background px-2 py-1 text-xs min-h-[60px] resize-y"
              placeholder="You are a helpful assistant..."
              rows={3}
            />
          </div>
          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-xs">
              Temp
              <input
                type="number" step="0.1" min="0" max="2"
                value={params.temperature ?? 0.7}
                onChange={e => setParams(p => ({ ...p, temperature: parseFloat(e.target.value) || undefined }))}
                className="w-16 rounded border bg-background px-1 py-0.5 text-xs"
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              Max Tokens
              <input
                type="number"
                value={params.max_tokens ?? 4096}
                onChange={e => setParams(p => ({ ...p, max_tokens: parseInt(e.target.value) || undefined }))}
                className="w-20 rounded border bg-background px-1 py-0.5 text-xs"
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              Top P
              <input
                type="number" step="0.1" min="0" max="1"
                value={params.top_p ?? 1.0}
                onChange={e => setParams(p => ({ ...p, top_p: parseFloat(e.target.value) || undefined }))}
                className="w-16 rounded border bg-background px-1 py-0.5 text-xs"
              />
            </label>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {allMessages.length === 0 && !streaming && (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm px-4 text-center">
            <div>
              <p className="text-lg font-medium mb-1">Start a conversation</p>
              <p>Select a model and type a message to begin.</p>
            </div>
          </div>
        )}

        <div className="mx-auto max-w-3xl px-4 py-4 space-y-4">
          {allMessages
            .filter(m => m.role !== 'system')
            .map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-3 group',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-lg px-4 py-2.5 text-sm',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : msg.role === 'system'
                        ? 'bg-muted text-muted-foreground italic'
                        : 'bg-muted'
                  )}
                >
                  {/* Edit mode */}
                  {editingMsg === msg.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        className="w-full rounded border bg-background px-2 py-1 text-sm min-h-[60px]"
                        rows={3}
                      />
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => setEditingMsg(null)}
                          className="rounded px-2 py-0.5 text-xs hover:bg-accent"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Content */}
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                            {typeof msg.content === 'string' ? msg.content : ''}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap break-words">
                          {typeof msg.content === 'string' ? msg.content : '(media message)'}
                        </div>
                      )}

                      {/* Actions (hover) */}
                      <div className="flex gap-0.5 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleCopy(
                            typeof msg.content === 'string' ? msg.content : '',
                            msg.id
                          )}
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                          title="Copy"
                        >
                          {copied === msg.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </button>
                        {msg.role === 'user' && (
                          <>
                            <button
                              onClick={() => handleEdit(msg.id, typeof msg.content === 'string' ? msg.content : '')}
                              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                              title="Edit"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => deleteMessage(msg.id)}
                              className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}

          {/* Streaming bubble */}
          {streamingContent && (
            <div className="flex gap-3 justify-start">
              <div className="max-w-[85%] rounded-lg bg-muted px-4 py-2.5 text-sm">
                <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {streamingContent}
                  </ReactMarkdown>
                </div>
                <span className="inline-block w-2 h-4 ml-0.5 bg-foreground animate-pulse rounded-sm align-text-bottom" />
              </div>
            </div>
          )}

          {/* Streaming? indicator */}
          {streaming && !streamingContent && (
            <div className="flex gap-3 justify-start">
              <div className="rounded-lg bg-muted px-4 py-2.5">
                <span className="inline-block w-2 h-4 bg-foreground animate-pulse rounded-sm" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center justify-between">
          <span className="truncate">{error}</span>
          <button onClick={clearError} className="ml-2 shrink-0 text-xs underline">Dismiss</button>
        </div>
      )}

      {/* Input bar */}
      <div className="border-t bg-background px-4 py-3 shrink-0">
        {/* Image preview */}
        {uploadedImages.length > 0 && (
          <div className="mx-auto max-w-3xl flex gap-2 mb-2 flex-wrap">
            {uploadedImages.map(img => (
              <div key={img.id} className="relative w-16 h-16 rounded border overflow-hidden shrink-0">
                <img src={img.url} alt="" className="w-full h-full object-cover" />
                <button onClick={() => removeImage(img.id)} className="absolute top-0 right-0 bg-black/50 text-white rounded-bl p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mx-auto max-w-3xl flex gap-2 items-end">
          {/* Image upload button */}
          <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
          <button onClick={() => imageInputRef.current?.click()}
            className="rounded-md border p-2 hover:bg-accent text-muted-foreground shrink-0" title="Upload image">
            <ImagePlus className="h-4 w-4" />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            style={{ maxHeight: '200px' }}
          />

          {streaming ? (
            <button
              onClick={cancelStream}
              className="rounded-md bg-destructive p-2 text-destructive-foreground hover:bg-destructive/90 shrink-0"
              title="Stop"
            >
              <Square className="h-4 w-4" fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || !selectedModel}
              className="rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
