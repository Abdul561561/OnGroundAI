import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { Conversation, Message, AIModel, Contact } from '../../types';
import {
  Send,
  Plus,
  Trash2,
  Bot,
  User as UserIcon,
  Loader2,
  AlertCircle,
  RefreshCw,
  Cpu,
  Briefcase,
  CheckCircle2,
} from 'lucide-react';

export const TextAIChat: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);

  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('openrouter/auto');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [isSavingCase, setIsSavingCase] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load conversations, models, and CRM contacts
  useEffect(() => {
    loadConversations();
    loadModels();
    api.getContacts().then(setContacts).catch(() => {});
  }, []);

  const loadModels = async () => {
    try {
      const modelList = await api.getModels();
      setModels(modelList);
    } catch (e) {
      console.warn('Could not fetch models dynamically:', e);
    }
  };

  const loadConversations = async () => {
    try {
      const list = await api.getConversations('text_ai');
      setConversations(list);
      if (list.length > 0 && !activeConversationId) {
        selectConversation(list[0]._id);
      }
    } catch (e) {
      console.error('Error fetching conversations:', e);
    }
  };

  const selectConversation = async (convId: string) => {
    setActiveConversationId(convId);
    setLoadingHistory(true);
    setError(null);
    try {
      const msgs = await api.getMessages(convId);
      setMessages(msgs);
    } catch (e: any) {
      setError(e.message || 'Failed to load conversation messages.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const startNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
  };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c._id !== convId));
      if (activeConversationId === convId) {
        startNewConversation();
      }
    } catch (e: any) {
      setError(e.message || 'Failed to delete conversation.');
    }
  };

  const handleCreateCaseFromChat = async () => {
    if (messages.length === 0) return;
    setIsSavingCase(true);
    setError(null);
    setSavedNotice(null);
    try {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || 'Customer Support Inquiry';
      const lastAi = [...messages].reverse().find((m) => m.role === 'assistant')?.content || '';
      const created = await api.createCase({
        title: `CRM Chat: ${lastUser.slice(0, 60)}`,
        description: `Customer Inquiry: ${lastUser}\n\nAI Resolution: ${lastAi}`,
        customer_id: selectedContact?._id,
        customer_name: selectedContact?.name || 'General Inquiry',
        customer_phone: selectedContact?.phone_number || '',
        priority: 'medium',
      });
      if (selectedContact) {
        await api.updateContact(selectedContact._id, {
          status: 'in_progress',
          notes: selectedContact.notes
            ? `${selectedContact.notes}\n[CRM AI Chat Case #${created._id.slice(-6)}]: ${lastUser}`
            : `[CRM AI Chat Case #${created._id.slice(-6)}]: ${lastUser}`,
        });
      }
      setSavedNotice(
        `Support Case #${created._id.slice(-6).toUpperCase()} saved to MongoDB${selectedContact ? ` and linked to ${selectedContact.name}` : ''}.`
      );
    } catch (err: any) {
      setError(err.message || 'Failed to create support case.');
    } finally {
      setIsSavingCase(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage.trim();
    if (!text || loading) return;

    setError(null);
    setLastFailedMessage(null);
    setInputMessage('');
    setLoading(true);

    // Optimistic user message display
    const tempUserMsg: Message = {
      _id: `temp-${Date.now()}`,
      conversation_id: activeConversationId || '',
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await api.sendMessage(
        text,
        activeConversationId || undefined,
        'text_ai',
        selectedModel,
        selectedContact?._id
      );

      // If new conversation, set active ID and refresh list
      if (!activeConversationId) {
        setActiveConversationId(res.conversation_id);
        loadConversations();
      }

      // Replace optimistic message and append assistant message
      setMessages((prev) => [
        ...prev.filter((m) => m._id !== tempUserMsg._id),
        res.user_message,
        res.ai_message,
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to generate response. Please retry.');
      setLastFailedMessage(text);
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m._id !== tempUserMsg._id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row bg-slate-950 overflow-hidden">
      {/* Conversations Sidebar */}
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/60 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-400" />
            <h2 className="font-bold text-white text-sm">CRM Grounded Chat</h2>
          </div>
          <button
            onClick={startNewConversation}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>
        </div>

        {/* CRM Customer Grounding & Model Selector */}
        <div className="p-3 border-b border-slate-800 bg-slate-900/90 space-y-2.5">
          <div>
            <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 mb-1">
              <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ground in Customer CRM Record</span>
            </label>
            <select
              value={selectedContact?._id || ''}
              onChange={(e) => {
                const found = contacts.find((c) => c._id === e.target.value) || null;
                setSelectedContact(found);
              }}
              className="w-full bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg p-2 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="">General Support (No Customer Linked)</option>
              {contacts.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} ({c.phone_number})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 mb-1">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <span>OpenRouter Intelligence Model</span>
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg p-2 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {models.length > 0 ? (
                models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id}
                  </option>
                ))
              ) : (
                <option value="openrouter/auto">Auto Free Routing (Recommended)</option>
              )}
            </select>
          </div>

          {messages.length > 0 && (
            <button
              onClick={handleCreateCaseFromChat}
              disabled={isSavingCase}
              className="w-full py-1.5 px-3 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>{isSavingCase ? 'Saving Case...' : 'Log Support Case from Chat'}</span>
            </button>
          )}

          {savedNotice && (
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              <span>{savedNotice}</span>
            </div>
          )}
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-48 md:max-h-full">
          {conversations.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No conversations yet. Start a new chat!
            </div>
          ) : (
            conversations.map((c) => {
              const isActive = activeConversationId === c._id;
              return (
                <div
                  key={c._id}
                  onClick={() => selectConversation(c._id)}
                  className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer text-xs transition-all ${
                    isActive
                      ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30 font-medium'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <span className="truncate pr-2">{c.title || 'Untitled Chat'}</span>
                  <button
                    onClick={(e) => deleteConversation(c._id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-opacity"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Thread Panel */}
      <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {loadingHistory ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              <span>Retrieving conversation context from MongoDB Atlas...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-white text-base">OnGround AI Text Agent</h3>
              <p className="text-xs text-slate-400 max-w-sm">
                Ask questions, draft customer responses, or simulate customer support scenarios.
                All conversations are persistently stored in MongoDB Atlas with full multi-turn context.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m._id}
                  className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isUser
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-blue-400 border border-slate-700'
                    }`}
                  >
                    {isUser ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-tr-none shadow-md shadow-blue-600/20'
                        : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none shadow-md'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    <span
                      className={`block text-[10px] mt-1.5 ${
                        isUser ? 'text-blue-200' : 'text-slate-500'
                      }`}
                    >
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              );
            })
          )}

          {loading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-800 text-blue-400 border border-slate-700 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-none p-3.5 flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                <span>OpenRouter AI is generating answer...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error Alert with Retry */}
        {error && (
          <div className="mx-4 mb-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center justify-between text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            {lastFailedMessage && (
              <button
                onClick={() => handleSendMessage(lastFailedMessage)}
                className="flex items-center gap-1 font-semibold text-rose-200 hover:underline shrink-0 ml-2"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type your message to OnGround AI..."
              disabled={loading}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white p-2.5 rounded-xl transition-all shadow-md shadow-blue-600/20 disabled:shadow-none disabled:text-slate-600 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
