import { useState } from 'react';
import { MessageSquare, Phone, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const CHANNEL_ICONS = {
  sms: MessageSquare,
  call: Phone,
  email: MessageSquare,
};

function MessageBubble({ message }) {
  const isInbound = message.direction === 'inbound';
  const Icon = CHANNEL_ICONS[message.channel] || MessageSquare;
  const time = new Date(message.created_at).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <div className={`flex gap-2 ${isInbound ? 'flex-row' : 'flex-row-reverse'}`}>
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs
        ${isInbound ? 'bg-gray-100 text-gray-500' : 'bg-primary-100 text-primary-600'}`}>
        {isInbound
          ? <ArrowDownLeft className="w-3.5 h-3.5" />
          : <ArrowUpRight className="w-3.5 h-3.5" />}
      </div>
      <div className={`max-w-xs lg:max-w-sm ${isInbound ? '' : 'items-end'} flex flex-col gap-0.5`}>
        <div className={`px-3 py-2 rounded-xl text-sm
          ${isInbound
            ? 'bg-gray-100 text-gray-900 rounded-tl-sm'
            : 'bg-primary-600 text-white rounded-tr-sm'}`}>
          {message.body || (message.channel === 'call' ? <em className="opacity-70">Call record</em> : '\u2014')}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Icon className="w-3 h-3" />
          <span>{time}</span>
          {message.status && message.status !== 'sent' && message.status !== 'received' && (
            <span className="text-orange-500">&middot; {message.status}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LeadMessageThread({ messages = [], isLoading, leadId, leadPhone }) {
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  const handleSend = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const { error } = await supabase.functions.invoke('send-manual-sms', {
        body: { lead_id: leadId, body: replyText.trim() },
      });
      if (error) throw error;
      setReplyText('');
    } catch (err) {
      setSendError(err.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
        <p className="text-gray-500 text-sm mt-2">Loading messages...</p>
      </div>
    );
  }

  // Group messages by date
  let lastDate = null;

  return (
    <div>
      {messages.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">No messages yet</p>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
          {messages.map((msg) => {
            const msgDate = new Date(msg.created_at).toLocaleDateString();
            const showDateDivider = msgDate !== lastDate;
            lastDate = msgDate;
            return (
              <div key={msg.id}>
                {showDateDivider && (
                  <div className="flex items-center gap-3 my-3">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400">{msgDate}</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                )}
                <MessageBubble message={msg} />
              </div>
            );
          })}
        </div>
      )}

      {/* Manual reply input */}
      <div className="border-t border-gray-200 pt-3 mt-3">
        {!leadPhone ? (
          <p className="text-sm text-gray-400 text-center">No phone number on file</p>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Send a message..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary-500"
              maxLength={320}
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={sending || !replyText.trim()}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm
                         font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {sending ? 'Sending\u2026' : 'Send'}
            </button>
          </div>
        )}
        {sendError && <p className="text-xs text-red-600 mt-1">{sendError}</p>}
      </div>
    </div>
  );
}
