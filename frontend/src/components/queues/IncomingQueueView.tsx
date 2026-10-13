import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { QueueTicket, Contact } from '../../types';
import {
  PhoneIncoming,
  Bot,
  UserCheck,
  Clock,
  Phone,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  X,
  FileText,
  Filter
} from 'lucide-react';

interface IncomingQueueViewProps {
  onSelectForCall?: (phoneNumber: string, contact?: Contact) => void;
}

export const IncomingQueueView: React.FC<IncomingQueueViewProps> = ({ onSelectForCall }) => {
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('waiting');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<QueueTicket | null>(null);

  // New Inbound ticket modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newPriority, setNewPriority] = useState<'normal' | 'high' | 'urgent'>('normal');

  const loadQueues = async () => {
    setIsLoading(true);
    try {
      const data = await api.getQueues(statusFilter === 'All' ? undefined : statusFilter, typeFilter === 'All' ? undefined : typeFilter);
      setTickets(data);
    } catch (e) {
      console.error('Error loading queues:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueues();
    const interval = setInterval(loadQueues, 8000);
    return () => clearInterval(interval);
  }, [statusFilter, typeFilter]);

  const handleClaim = async (ticket: QueueTicket) => {
    try {
      await api.claimQueueTicket(ticket._id);
      loadQueues();
      if (ticket.customer_phone && onSelectForCall) {
        onSelectForCall(ticket.customer_phone);
      }
    } catch (err: any) {
      alert(`Failed to claim ticket: ${err.message}`);
    }
  };

  const handleResolve = async (ticketId: string) => {
    try {
      await api.updateQueueTicket(ticketId, { status: 'resolved' });
      loadQueues();
      if (selectedTicket?._id === ticketId) {
        setSelectedTicket(null);
      }
    } catch (err: any) {
      alert(`Failed to resolve ticket: ${err.message}`);
    }
  };

  const handleCreateInbound = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim()) return;

    try {
      await api.escalateAiCallToHuman({
        customer_name: newCustomerName.trim(),
        customer_phone: newCustomerPhone.trim() || undefined,
        reason: newReason.trim() || 'Direct inbound caller in queue.',
        priority: newPriority,
      });
      setShowAddModal(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewReason('');
      loadQueues();
    } catch (err: any) {
      alert(`Error creating ticket: ${err.message}`);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.customer_name.toLowerCase().includes(q) ||
      (t.customer_phone && t.customer_phone.includes(q)) ||
      (t.reason && t.reason.toLowerCase().includes(q))
    );
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <PhoneIncoming className="w-6 h-6 text-indigo-400" />
            Incoming Call Queue & AI Handoffs
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time incoming customer lines, callback requests, and Voice AI escalations waiting for human dispatch.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Simulate Inbound Call</span>
          </button>
          <button
            onClick={loadQueues}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all cursor-pointer"
            title="Refresh queue"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Search customer name, phone number, or reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="waiting">Status: Waiting</option>
            <option value="claimed">Status: Claimed</option>
            <option value="resolved">Status: Resolved</option>
            <option value="All">Status: All</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="All">Type: All Queues</option>
            <option value="ai_escalation">AI Escalations</option>
            <option value="inbound_call">Inbound Calls</option>
            <option value="callback_request">Callback Requests</option>
          </select>
        </div>
      </div>

      {/* Tickets Grid */}
      {filteredTickets.length === 0 ? (
        <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-white">No Tickets in this Queue</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            All customer calls and AI escalations under this filter have been handled.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTickets.map((t) => (
            <div
              key={t._id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 p-5 rounded-2xl space-y-3 shadow-md transition-all flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-white text-sm">{t.customer_name}</h3>
                    {t.customer_phone && (
                      <p className="text-xs text-slate-400 font-mono">{t.customer_phone}</p>
                    )}
                  </div>
                  {t.queue_type === 'ai_escalation' ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1 shrink-0">
                      <Bot className="w-3 h-3" /> AI Escalation
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shrink-0">
                      Inbound
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-300 line-clamp-2">{t.reason || 'Customer waiting in queue'}</p>

                {t.transcript_summary && (
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 text-[11px] text-slate-400">
                    <span className="text-indigo-400 font-semibold">AI Summary: </span>
                    {t.transcript_summary}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Wait: {t.wait_time_seconds}s
                </span>

                <div className="flex items-center gap-2">
                  {t.status === 'waiting' && (
                    <button
                      onClick={() => handleClaim(t)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Claim</span>
                    </button>
                  )}
                  {t.status === 'claimed' && (
                    <button
                      onClick={() => handleResolve(t._id)}
                      className="bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30 font-semibold px-3 py-1.5 rounded-xl text-xs transition-all cursor-pointer"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Simulate Inbound Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <PhoneIncoming className="w-5 h-5 text-indigo-400" />
                Simulate Inbound Customer Call
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInbound} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-400">Customer Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rachel Green"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Phone Number</label>
                <input
                  type="text"
                  placeholder="e.g. +1 555-234-5678"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Inquiry Reason</label>
                <textarea
                  rows={2}
                  placeholder="Reason for calling or escalation..."
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2 rounded-xl"
                >
                  Queue Call
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
