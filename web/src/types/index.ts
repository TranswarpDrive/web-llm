export interface User {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface Provider {
  id: string;
  user_id: string;
  name: string;
  base_url: string;
  capabilities: ProviderCapabilities;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProviderCapabilities {
  chat: boolean;
  vision: boolean;
  embedding: boolean;
  rerank: boolean;
}

export interface ModelCapabilities {
  chat: boolean;
  vision: boolean;
  reasoning: boolean;
  image_gen: boolean;
  tool_calling: boolean;
  embedding: boolean;
  rerank: boolean;
}

export type ModelType = 'chat' | 'vision' | 'embedding' | 'rerank' | 'reasoning';

export interface Model {
  id: string;
  user_id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  type: ModelType;
  capabilities: ModelCapabilities;
  default_params: ModelParams;
  is_default_per_type: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ModelParams {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

export interface MessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | MessageContent[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  citations?: Citation[];
  token_count?: number;
  model_used?: string;
  created_at: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Citation {
  index: number;
  document_name: string;
  chunk_content: string;
  similarity: number;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  system_prompt: string;
  model_id: string;
  params: ModelParams;
  tools_config: ToolsConfig;
  knowledge_base_ids: string[];
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string;
}

export interface ToolsConfig {
  enabled_tools: string[];
  mcp_servers: string[];
}

export interface Document {
  id: string;
  knowledge_base_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  status: 'pending' | 'processing' | 'ready' | 'error';
  error_message?: string;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface Chunk {
  id: string;
  document_id: string;
  knowledge_base_id: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown>;
  similarity?: number;
  created_at: string;
}

export interface KnowledgeBase {
  id: string;
  user_id: string;
  name: string;
  description: string;
  chunk_strategy: ChunkStrategy;
  retrieval_config: RetrievalConfig;
  embedding_model_id: string;
  rerank_model_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChunkStrategy {
  chunk_size: number;
  chunk_overlap: number;
  separator: string;
}

export interface RetrievalConfig {
  top_k: number;
  similarity_threshold: number;
  chunk_limit: number;
}

export interface McpServer {
  id: string;
  user_id: string;
  name: string;
  server_url: string;
  tools: McpTool[];
  tools_whitelist: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ApiError {
  error: {
    type: ErrorType;
    message: string;
    original_error?: Record<string, unknown>;
  };
}

export type ErrorType =
  | 'authentication_error'
  | 'rate_limit_error'
  | 'invalid_request_error'
  | 'server_error'
  | 'timeout_error';

export interface ChatCompletionRequest {
  provider_id: string;
  model_id: string;
  conversation_id?: string;
  messages: Array<{ role: string; content: string | MessageContent[] }>;
  params?: ModelParams;
  stream?: boolean;
  tools?: ToolDefinition[];
  knowledge_base_id?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface SSEChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string;
  }>;
}
