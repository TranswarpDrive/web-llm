import { useNavigate } from 'react-router-dom';
import { MessageSquarePlus } from 'lucide-react';
import { api } from '@/services/api';

export function HomePage() {
  const navigate = useNavigate();

  async function handleNewChat() {
    try {
      const conv = await api.createConversation({});
      navigate(`/chat/${conv.id}`);
    } catch {
      // handled by API client
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <h2 className="text-2xl font-bold mb-2">Welcome to WebLLM</h2>
      <p className="text-muted-foreground text-sm mb-8 text-center max-w-md">
        Your personal LLM frontend. Manage providers, chat with models,
        search knowledge bases, and more.
      </p>
      <button
        onClick={handleNewChat}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <MessageSquarePlus className="h-4 w-4" />
        Start a New Chat
      </button>
    </div>
  );
}
