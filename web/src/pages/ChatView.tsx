import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useConversationStore } from '@/stores/conversationStore';
import { useProviderStore } from '@/stores/providerStore';
import { useModelStore } from '@/stores/modelStore';
import { Send, Square, Pencil, Trash2, Copy, Check, Settings, ImagePlus, X, RefreshCw, Camera, Globe, BookOpen, Wrench, FilePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ModelParams } from '@/types';

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
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ id: string; name: string; content: string }>>([]);
  const [kbIds, setKbIds] = useState<string[]>([]);
  const [availableKbs, setAvailableKbs] = useState<Array<{ id: string; name: string }>>([]);
  const [webSearchOn, setWebSearchOn] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Init
  useEffect(() => { fetchProviders(); fetchModels(); }, [fetchProviders, fetchModels]);
  useEffect(() => { if (id) selectConversation(id).catch(() => navigate('/')); }, [id]);
  useEffect(() => {
    if (active) { setSystemPrompt(active.system_prompt || ''); setParams(active.params || { temperature: 0.7, max_tokens: 4096, top_p: 1.0 }); setKbIds(active.knowledge_base_ids || []); }
  }, [active]);
  useEffect(() => {
    if (active?.model_id) { const m = models.find(x => x.id === active.model_id); if (m) { setSelectedModel(m.id); setSelectedProvider(m.provider_id); } }
  }, [active, models]);
  useEffect(() => { if (!selectedProvider && providers.length > 0) { const a = providers.find(p => p.is_active); if (a) setSelectedProvider(a.id); } }, [providers, selectedProvider]);

  const availableModels = models.filter(m => m.provider_id === selectedProvider && m.is_active && (m.type === 'chat' || m.type === 'vision'));
  useEffect(() => { if (!selectedModel && availableModels.length > 0) { const def = availableModels.find(m => m.is_default_per_type) || availableModels[0]; setSelectedModel(def.id); } }, [availableModels, selectedModel]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingContent, streamingToolCalls]);
  useEffect(() => {
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'; }
  }, [input]);

  // Load KBs
  useEffect(() => {
    fetch('/api/knowledge-bases', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(d => setAvailableKbs(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [input, selectedProvider, selectedModel, streaming]);

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
    const msg = input.trim(); setInput('');
    let convId = id;
    if (!convId) { convId = await create(); navigate(`/chat/${convId}`, { replace: true }); }
    if (systemPrompt !== active?.system_prompt && convId) {
      await update(convId, { system_prompt: systemPrompt, model_id: selectedModel, params, knowledge_base_ids: kbIds });
    }

    // Vision model check: warn if images uploaded without vision capability
    const curModel = models.find(m => m.id === selectedModel);
    if (uploadedImages.length > 0 && curModel && !curModel.capabilities?.vision) {
      const visionModel = availableModels.find(m => m.capabilities?.vision);
      if (visionModel) {
        if (confirm(`Current model "${curModel.display_name}" doesn't support images. Switch to "${visionModel.display_name}"?`)) {
          setSelectedModel(visionModel.id);
        }
      } else {
        alert(`"${curModel.display_name}" doesn't support images. No vision-enabled model available for this provider.`);
      }
    }

    // Build message content with uploaded files as context
    let fullMsg = msg;
    if (uploadedFiles.length > 0) {
      const ctx = uploadedFiles.map(f => `[File: ${f.name}]\n${f.content}`).join('\n\n---\n\n');
      fullMsg = `${msg}\n\n--- Attached files ---\n\n${ctx}`;
    }
    setUploadedFiles([]);

    let content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> = fullMsg;
    if (uploadedImages.length > 0) {
      content = [{ type: 'text', text: fullMsg }];
      for (const img of uploadedImages) content.push({ type: 'image_url', image_url: { url: img.url } });
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

  function handleCopy(text: string, msgId: string) { navigator.clipboard.writeText(text); setCopied(msgId); setTimeout(() => setCopied(null), 2000); }
  function handleEdit(msgId: string, content: string) { setEditingMsg(msgId); setEditContent(typeof content === 'string' ? content : JSON.stringify(content)); }
  async function handleSaveEdit() { if (editingMsg) { await editMessage(editingMsg, editContent); setEditingMsg(null); } }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setUploadedImages(prev => [...prev, ...files.map(f => ({ id: crypto.randomUUID(), url: URL.createObjectURL(f), file: f }))]);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }
  function removeImage(id: string) { setUploadedImages(prev => { const img = prev.find(i => i.id === id); if (img) URL.revokeObjectURL(img.url); return prev.filter(i => i.id !== id); }); }

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
        // Limit context size to ~50K chars
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
    const el = document.getElementById('messages-container');
    if (!el) return;
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(el, { backgroundColor: document.documentElement.classList.contains('dark') ? '#09090b' : '#ffffff' });
      const a = document.createElement('a'); a.href = dataUrl; a.download = `chat-${Date.now()}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch { /* html-to-image not critical */ }
  }

  const allMessages = [...messages];

  return (
    <div className="flex h-full flex-col">
      {/* Chat Header */}
      <div className="flex items-center justify-between border-b px-4 py-2 shrink-0 flex-wrap gap-1">
        <input type="text" value={active?.title || 'New Chat'}
          onChange={e => id && update(id, { title: e.target.value })}
          className="bg-transparent font-medium text-sm border-none outline-none flex-1 min-w-0" placeholder="Chat title" />

        <div className="flex items-center gap-1 flex-wrap">
          {/* Provider */}
          <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}
            className="rounded border bg-background px-2 py-1 text-xs max-w-[100px] truncate">
            {providers.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {/* Model */}
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
            className="rounded border bg-background px-2 py-1 text-xs max-w-[120px] truncate">
            {availableModels.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>
          {/* KB selector */}
          {availableKbs.length > 0 && (
            <select multiple value={kbIds}
              onChange={e => setKbIds(Array.from(e.target.selectedOptions, o => o.value))}
              className="rounded border bg-background px-1 py-1 text-xs max-w-[80px] truncate" title="Knowledge bases">
              {availableKbs.map(kb => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
            </select>
          )}
          {/* Web search toggle */}
          <button onClick={() => setWebSearchOn(!webSearchOn)}
            className={cn('rounded p-1 text-xs', webSearchOn ? 'bg-primary/20 text-primary' : 'hover:bg-accent text-muted-foreground')} title="Web search">
            <Globe className="h-4 w-4" />
          </button>
          {/* Screenshot */}
          <button onClick={handleScreenshot} className="rounded p-1 hover:bg-accent text-muted-foreground" title="Screenshot">
            <Camera className="h-4 w-4" />
          </button>
          {/* Params */}
          <button onClick={() => setShowParams(!showParams)}
            className={cn('rounded p-1 hover:bg-accent', showParams && 'bg-accent')} title="Parameters">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Parameters panel */}
      {showParams && (
        <div className="border-b px-4 py-3 shrink-0 bg-muted/30 space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">System Prompt</label>
            <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
              className="w-full rounded border bg-background px-2 py-1 text-xs min-h-[60px] resize-y" rows={3} />
          </div>
          <div className="flex gap-4 flex-wrap">
            {[
              ['Temp', 'temperature', 0, 2, 0.1],
              ['Max Tokens', 'max_tokens', 1, 131072, 1],
              ['Top P', 'top_p', 0, 1, 0.1],
            ].map(([label, key, min, max, step]) => (
              <label key={key as string} className="flex items-center gap-1 text-xs">
                {label as string}
                <input type="number" step={step as number} min={min as number} max={max as number}
                  value={(params as any)[key] ?? ''}
                  onChange={e => setParams(p => ({ ...p, [key as string]: parseFloat(e.target.value) || undefined }))}
                  className="w-16 rounded border bg-background px-1 py-0.5 text-xs" />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div id="messages-container" className="flex-1 overflow-y-auto">
        {allMessages.length === 0 && !streaming && (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm px-4 text-center">
            <div><p className="text-lg font-medium mb-1">Start a conversation</p><p>Select a model and type a message.</p></div>
          </div>
        )}
        <div className="mx-auto max-w-3xl px-4 py-4 space-y-4">
          {/* Load earlier messages */}
          {(active as any)?._hasMore && (
            <button
              onClick={async () => {
                if (id) await loadMoreMessages(id);
              }}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1"
            >
              ↑ Load earlier messages
            </button>
          )}
          {allMessages.filter(m => m.role !== 'system').map((msg, idx) => (
            <div key={msg.id} className={cn('flex gap-3 group', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[85%] rounded-lg px-4 py-2.5 text-sm',
                msg.role === 'user' ? 'bg-primary text-primary-foreground' :
                  msg.role === 'tool' ? 'bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800' :
                    'bg-muted')}>
                {editingMsg === msg.id ? (
                  <div className="space-y-2"><textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full rounded border bg-background px-2 py-1 text-sm min-h-[60px]" rows={3} />
                    <div className="flex gap-1 justify-end"><button onClick={() => setEditingMsg(null)} className="rounded px-2 py-0.5 text-xs hover:bg-accent">Cancel</button><button onClick={handleSaveEdit} className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">Save</button></div>
                  </div>
                ) : (
                  <>
                    {/* Tool calls */}
                    {msg.tool_calls && msg.tool_calls.length > 0 && (
                      <div className="mb-2 space-y-1">
                        {msg.tool_calls.map((tc, i) => (
                          <div key={tc.id || i} className="rounded bg-background/50 px-2 py-1 text-xs flex items-center gap-1.5">
                            <Wrench className="h-3 w-3 shrink-0 text-blue-500" />
                            <span className="font-medium">{tc.function.name}</span>
                            <span className="text-muted-foreground truncate">{tc.function.arguments.slice(0, 80)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Streaming tool calls */}
                    {streamingToolCalls.length > 0 && idx === allMessages.length - 1 && (
                      <div className="mb-2 space-y-1">
                        {streamingToolCalls.map((tc, i) => (
                          <div key={tc.id || i} className="rounded bg-background/50 px-2 py-1 text-xs flex items-center gap-1.5">
                            <Wrench className="h-3 w-3 shrink-0 text-blue-500 animate-pulse" />
                            <span className="font-medium">{tc.name || 'tool'}</span>
                            <span className="text-muted-foreground truncate">{tc.arguments?.slice(0, 60) || '...'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Citations */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mb-2 border-t pt-2 space-y-1">
                        <div className="text-xs font-medium text-muted-foreground flex items-center gap-1"><BookOpen className="h-3 w-3" />Sources</div>
                        {msg.citations.map((c, i) => (
                          <div key={i} className="text-xs bg-background/50 rounded px-2 py-1">
                            <span className="font-medium">[{c.index}] {c.document_name}</span>
                            <span className="text-muted-foreground ml-1">({(c.similarity * 100).toFixed(0)}%)</span>
                            <p className="text-muted-foreground mt-0.5">{c.chunk_content?.slice(0, 150)}...</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Content */}
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                          {typeof msg.content === 'string' ? msg.content : ''}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{typeof msg.content === 'string' ? msg.content : '(media)'}</div>
                    )}
                    {/* Actions */}
                    <div className="flex gap-0.5 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleCopy(typeof msg.content === 'string' ? msg.content : '', msg.id)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" title="Copy">
                        {copied === msg.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                      {msg.role === 'user' && (<>
                        <button onClick={() => handleEdit(msg.id, typeof msg.content === 'string' ? msg.content : '')} className="rounded p-0.5 text-muted-foreground hover:text-foreground" title="Edit"><Pencil className="h-3 w-3" /></button>
                        <button onClick={() => deleteMessage(msg.id)} className="rounded p-0.5 text-muted-foreground hover:text-destructive" title="Delete"><Trash2 className="h-3 w-3" /></button>
                      </>)}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}

          {/* Streaming */}
          {streamingContent && (
            <div className="flex gap-3 justify-start">
              <div className="max-w-[85%] rounded-lg bg-muted px-4 py-2.5 text-sm">
                <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{streamingContent}</ReactMarkdown>
                </div>
                <span className="inline-block w-2 h-4 ml-0.5 bg-foreground animate-pulse rounded-sm align-text-bottom" />
              </div>
            </div>
          )}
          {streaming && !streamingContent && streamingToolCalls.length === 0 && (
            <div className="flex gap-3 justify-start"><div className="rounded-lg bg-muted px-4 py-2.5"><span className="inline-block w-2 h-4 bg-foreground animate-pulse rounded-sm" /></div></div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error + Regenerate */}
      {error && (
        <div className="mx-4 mb-2 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center justify-between">
          <span className="truncate">{error}</span>
          <div className="flex gap-1 ml-2 shrink-0">
            <button onClick={handleRegenerate} className="text-xs underline flex items-center gap-1"><RefreshCw className="h-3 w-3" />Retry</button>
            <button onClick={clearError} className="text-xs underline">Dismiss</button>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="border-t bg-background px-4 py-3 shrink-0">
        {/* File preview */}
        {uploadedFiles.length > 0 && (
          <div className="mx-auto max-w-3xl flex gap-2 mb-2 flex-wrap">
            {uploadedFiles.map(f => (
              <div key={f.id} className="flex items-center gap-1 rounded border bg-accent/50 px-2 py-1 text-xs max-w-[200px]">
                <span className="truncate">{f.name}</span>
                <button onClick={() => removeFile(f.id)} className="shrink-0"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
        {uploadedImages.length > 0 && (
          <div className="mx-auto max-w-3xl flex gap-2 mb-2 flex-wrap">
            {uploadedImages.map(img => (
              <div key={img.id} className="relative w-16 h-16 rounded border overflow-hidden shrink-0">
                <img src={img.url} alt="" className="w-full h-full object-cover" />
                <button onClick={() => removeImage(img.id)} className="absolute top-0 right-0 bg-black/50 text-white rounded-bl p-0.5"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="mx-auto max-w-3xl flex gap-2 items-end">
          <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
          <button onClick={() => imageInputRef.current?.click()} className="rounded-md border p-2 hover:bg-accent text-muted-foreground shrink-0" title="Upload image"><ImagePlus className="h-4 w-4" /></button>
          <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.html,.csv,.json,.log" multiple className="hidden" onChange={handleFileUpload} />
          <button onClick={() => fileInputRef.current?.click()} className="rounded-md border p-2 hover:bg-accent text-muted-foreground shrink-0" title="Upload file"><FilePlus className="h-4 w-4" /></button>
          <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send)" rows={1} disabled={streaming}
            className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            style={{ maxHeight: '200px' }} />
          {streaming ? (
            <button onClick={cancelStream} className="rounded-md bg-destructive p-2 text-destructive-foreground hover:bg-destructive/90 shrink-0" title="Stop"><Square className="h-4 w-4" fill="currentColor" /></button>
          ) : (
            <>
              {allMessages.length > 0 && (
                <button onClick={handleRegenerate} className="rounded-md border p-2 hover:bg-accent text-muted-foreground shrink-0" title="Regenerate"><RefreshCw className="h-4 w-4" /></button>
              )}
              <button onClick={handleSend} disabled={!input.trim() || !selectedModel}
                className="rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0" title="Send"><Send className="h-4 w-4" /></button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
