import { useEffect, useMemo, useState } from 'react';
import { Bot, ChevronLeft, ChevronRight, MessageSquarePlus, RefreshCw, Search, Send, Trash2, UserRound } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import DictationButton from '../../components/ui/DictationButton.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { useToast } from '../../components/useToast.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';

const formatTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

const renderAssistantMessage = (content = '') => {
  const blocks = String(content)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) return null;

  return (
    <div className="space-y-3.5">
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
        return (
          <div key={blockIndex} className="space-y-1.5">
            {lines.map((line, lineIndex) => {
              const bulletMatch = line.match(/^[-*]\s+(.*)$/);
              if (bulletMatch) {
                return (
                  <div key={lineIndex} className="flex gap-2 leading-6">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sage/70" />
                    <span>{bulletMatch[1]}</span>
                  </div>
                );
              }
              return (
                <p key={lineIndex} className="leading-6">
                  {line}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

const CrmChatGPT = () => {
  const { user } = useAuth();
  const { toasts, showToast, dismissToast } = useToast();
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [chatListCollapsed, setChatListCollapsed] = useState(false);

  const activeId = activeChat?.id || 'new';
  const canDeleteChats = user?.role === ROLES.ADMIN;
  const currentUserId = String(user?.id || user?._id || '');
  const isViewingOtherUserChat = Boolean(
    activeChat?.owner && currentUserId && String(activeChat.owner) !== currentUserId
  );

  const sortedMessages = useMemo(() => activeChat?.messages || [], [activeChat]);

  const loadConversations = async ({ keepActive = true } = {}) => {
    setError('');
    try {
      const { data } = await api.get('/crm-chat/conversations', { params: { search } });
      const rows = data.conversations || [];
      setConversations(rows);
      if (!keepActive && rows[0]) {
        await openConversation(rows[0].id);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load chats.');
    } finally {
      setLoading(false);
    }
  };

  const openConversation = async (id) => {
    setError('');
    try {
      const { data } = await api.get(`/crm-chat/conversations/${id}`);
      setActiveChat(data.conversation);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not open chat.');
    }
  };

  const startNewChat = () => {
    setActiveChat({ id: 'new', title: 'New Chat', messages: [] });
    setMessage('');
    setError('');
  };

  const submitMessage = async (event) => {
    event.preventDefault();
    if (!message.trim() || isViewingOtherUserChat) return;

    const outgoing = message.trim();
    setSending(true);
    setError('');
    setMessage('');
    setActiveChat((current) => ({
      ...(current || { id: 'new', title: 'New Chat' }),
      messages: [
        ...((current && current.messages) || []),
        { id: `local-${Date.now()}`, role: 'user', content: outgoing, createdAt: new Date().toISOString() },
      ],
    }));

    try {
      const { data } = await api.post(`/crm-chat/conversations/${activeId}/messages`, { message: outgoing });
      setActiveChat(data.conversation);
      await loadConversations();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!sending && message.trim() && !isViewingOtherUserChat) {
      submitMessage(event);
    }
  };

  const confirmDeleteChat = async (chat) => {
    setError('');
    try {
      await api.delete(`/crm-chat/conversations/${chat.id}`);
      setConversations((current) => current.filter((item) => item.id !== chat.id));
      if (activeChat?.id === chat.id) {
        setActiveChat(null);
      }
      showToast('Chat deleted');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete chat.');
      showToast(err.response?.data?.message || 'Could not delete chat.', 'error');
    }
  };

  const requestDeleteChat = (event, chat) => {
    event.stopPropagation();
    showToast(`Delete "${chat.title}"?`, 'confirm', {
      persist: true,
      actionLabel: 'Delete',
      cancelLabel: 'Cancel',
      onAction: () => confirmDeleteChat(chat),
    });
  };

  useEffect(() => {
    loadConversations({ keepActive: true });
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => loadConversations({ keepActive: true }), 250);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    if (!activeChat && conversations[0]) {
      openConversation(conversations[0].id);
    }
  }, [conversations, activeChat]);

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-4">
      <Toast toasts={toasts} onDismiss={dismissToast} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">CRM Assistant</h1>
          <p className="mt-1 text-sm text-charcoal/55">Ask questions about CRM patients, follow-ups, payments, worksheets, and activity history.</p>
        </div>
        <Button onClick={startNewChat}>
          <MessageSquarePlus size={16} /> New Chat
        </Button>
      </div>

      {error && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{error}</div>}

      <div className={`grid min-h-[620px] flex-1 grid-cols-1 gap-4 ${chatListCollapsed ? 'lg:grid-cols-[56px_minmax(0,1fr)]' : 'lg:grid-cols-[320px_minmax(0,1fr)]'}`}>
        <Card className="flex min-h-0 flex-col overflow-hidden" padded={false}>
          <div className={`border-b border-cardline p-3 ${chatListCollapsed ? 'flex justify-center' : ''}`}>
            {chatListCollapsed ? (
              <button
                type="button"
                onClick={() => setChatListCollapsed(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sage hover:bg-sage-muted/20"
                aria-label="Expand chat list"
                title="Expand chat list"
              >
                <ChevronRight size={18} />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/35" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search chats"
                    className="w-full rounded-lg border border-cardline bg-offwhite-200 py-2 pl-9 pr-3 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setChatListCollapsed(true)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sage hover:bg-sage-muted/20"
                  aria-label="Collapse chat list"
                  title="Collapse chat list"
                >
                  <ChevronLeft size={18} />
                </button>
              </div>
            )}
          </div>
          {chatListCollapsed ? (
            <div className="flex flex-1 items-start justify-center pt-3">
              <button
                type="button"
                onClick={startNewChat}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sage hover:bg-sage-muted/20"
                aria-label="New chat"
                title="New chat"
              >
                <MessageSquarePlus size={17} />
              </button>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-charcoal/50">
                  <RefreshCw size={15} className="animate-spin" /> Loading chats...
                </div>
              ) : conversations.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-charcoal/50">No chats yet.</div>
              ) : (
                conversations.map((chat) => (
                  <div
                    key={chat.id}
                    className={`mb-1 flex w-full items-center gap-1 rounded-lg transition ${
                      activeChat?.id === chat.id ? 'bg-sage text-offwhite-100' : 'text-charcoal hover:bg-sage-muted/20'
                    }`}
                  >
                    <button type="button" onClick={() => openConversation(chat.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                      <span className="block truncate text-sm font-semibold">{chat.title}</span>
                      <span className={`mt-0.5 block text-xs ${activeChat?.id === chat.id ? 'text-offwhite-100/75' : 'text-charcoal/45'}`}>
                        {formatTime(chat.lastMessageAt)}
                      </span>
                      {user?.role === ROLES.ADMIN && chat.ownerName && (
                        <span className={`mt-0.5 block truncate text-[11px] ${activeChat?.id === chat.id ? 'text-offwhite-100/65' : 'text-charcoal/40'}`}>
                          By {chat.ownerName}
                        </span>
                      )}
                    </button>
                    {canDeleteChats && (
                      <button
                        type="button"
                        onClick={(event) => requestDeleteChat(event, chat)}
                        className={`mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                          activeChat?.id === chat.id ? 'text-offwhite-100/75 hover:bg-white/15 hover:text-white' : 'text-charcoal/35 hover:bg-[#8C3B2E]/10 hover:text-[#8C3B2E]'
                        }`}
                        aria-label={`Delete ${chat.title}`}
                        title="Delete chat"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </Card>

        <Card className="flex min-h-0 flex-col" padded={false}>
          <div className="flex items-center gap-3 border-b border-cardline px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sage-muted/25 text-sage">
              <Bot size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-charcoal">{activeChat?.title || 'New Chat'}</p>
              <p className="text-xs text-charcoal/45">
                {isViewingOtherUserChat ? `Viewing ${activeChat?.ownerName || 'another user'}'s chat history.` : 'Answers use CRM context and the previous messages in this chat.'}
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-offwhite-200/35 p-4">
            {sortedMessages.length === 0 ? (
              <div className="flex h-full min-h-[360px] items-center justify-center">
                <div className="max-w-lg text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-sage-muted/25 text-sage">
                    <Bot size={23} />
                  </div>
                  <h2 className="mt-4 font-display text-lg font-bold text-charcoal">Start a CRM question</h2>
                  <p className="mt-2 text-sm text-charcoal/55">
                    Example: how many follow-ups happened for a patient, what a counselor did today, or which payments were added this month.
                  </p>
                </div>
              </div>
            ) : (
              sortedMessages.map((item) => {
                const isUser = item.role === 'user';
                return (
                  <div key={item.id} className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser && (
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sage-muted/25 text-sage">
                        <Bot size={16} />
                      </div>
                    )}
                    <div className={`max-w-[820px] rounded-lg px-4 py-3 text-sm shadow-sm ${isUser ? 'bg-sage text-offwhite-100' : 'border border-cardline bg-offwhite-100 text-charcoal'}`}>
                      {isUser ? <p className="whitespace-pre-line leading-6">{item.content}</p> : renderAssistantMessage(item.content)}
                      <p className={`mt-1 text-[10px] ${isUser ? 'text-offwhite-100/70' : 'text-charcoal/40'}`}>{formatTime(item.createdAt)}</p>
                    </div>
                    {isUser && (
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-950 text-offwhite-100">
                        <UserRound size={15} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {sending && (
              <div className="flex gap-2 justify-start">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sage-muted/25 text-sage">
                  <Bot size={16} />
                </div>
                <div className="rounded-lg border border-cardline bg-offwhite-100 px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1.5" aria-label="CRM Assistant is thinking">
                    {[0, 1, 2, 3, 4].map((dot) => (
                      <span
                        key={dot}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-sage"
                        style={{ animationDelay: `${dot * 90}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={submitMessage} className="border-t border-cardline bg-offwhite-100 p-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <textarea
                  rows={2}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={isViewingOtherUserChat ? 'This chat history is read-only for admin.' : 'Ask about this CRM...'}
                  disabled={isViewingOtherUserChat}
                  className="min-h-[44px] w-full resize-none rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 pr-12 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
                />
                <DictationButton
                  value={message}
                  onChange={setMessage}
                  disabled={isViewingOtherUserChat}
                  className="absolute bottom-2 right-2"
                />
              </div>
              <Button type="submit" disabled={sending || !message.trim() || isViewingOtherUserChat} className="self-end">
                <Send size={16} />
                <span className="hidden sm:inline">{sending ? 'Sending...' : 'Send'}</span>
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default CrmChatGPT;
