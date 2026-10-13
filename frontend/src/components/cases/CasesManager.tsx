import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { SupportCase, Contact } from '../../types';
import {
  FolderKanban,
  Search,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  Phone,
  Filter,
  X,
  RefreshCw,
  Tag
} from 'lucide-react';

interface CasesManagerProps {
  onSelectForCall?: (phoneNumber: string, contact?: Contact) => void;
}

export const CasesManager: React.FC<CasesManagerProps> = ({ onSelectForCall }) => {
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');

  const loadCases = async () => {
    setIsLoading(true);
    try {
      const data = await api.getCases(
        statusFilter === 'All' ? undefined : statusFilter,
        priorityFilter === 'All' ? undefined : priorityFilter,
        searchQuery || undefined
      );
      setCases(data);
    } catch (e) {
      console.error('Error loading cases:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, [statusFilter, priorityFilter, searchQuery]);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim()) return;

    try {
      await api.createCase({
        title: newTitle.trim(),
        description: newDescription.trim(),
        customer_name: newCustomerName.trim() || undefined,
        customer_phone: newCustomerPhone.trim() || undefined,
        priority: newPriority,
      });
      setShowAddModal(false);
      setNewTitle('');
      setNewDescription('');
      setNewCustomerName('');
      setNewCustomerPhone('');
      loadCases();
    } catch (err: any) {
      alert(`Error creating case: ${err.message}`);
    }
  };

  const handleUpdateStatus = async (caseId: string, newStatus: any) => {
    try {
      await api.updateCase(caseId, { status: newStatus });
      loadCases();
    } catch (err: any) {
      alert(`Error updating case: ${err.message}`);
    }
  };

  const handleResolveCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showResolveModal) return;

    try {
      await api.updateCase(showResolveModal, {
        status: 'resolved',
        resolution_notes: resolutionNotes.trim(),
      });
      setShowResolveModal(null);
      setResolutionNotes('');
      loadCases();
    } catch (err: any) {
      alert(`Error resolving case: ${err.message}`);
    }
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'critical':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">Critical</span>;
      case 'high':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">High</span>;
      case 'medium':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Medium</span>;
      default:
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30">Low</span>;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-indigo-400" />
            Support Cases & Resolution Tracker
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Track customer escalations, troubleshoot tickets, and record resolutions linked to customer CRM profiles.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Open Support Case</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search case title, customer name, or details..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2"
          >
            <option value="All">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2"
          >
            <option value="All">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Cases List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cases.map((cs) => (
          <div
            key={cs._id}
            className="bg-slate-900 border border-slate-800 hover:border-slate-700 p-5 rounded-2xl space-y-3.5 shadow-md transition-all flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                {getPriorityBadge(cs.priority)}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold capitalize ${
                  cs.status === 'resolved'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                }`}>
                  {cs.status.replace('_', ' ')}
                </span>
              </div>

              <h3 className="font-bold text-white text-sm line-clamp-1">{cs.title}</h3>
              <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{cs.description}</p>

              <div className="pt-2 text-[11px] text-slate-500 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <User className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{cs.customer_name}</span>
                </div>
                {cs.customer_phone && (
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-slate-400">{cs.customer_phone}</span>
                    {onSelectForCall && (
                      <button
                        onClick={() => onSelectForCall(cs.customer_phone!)}
                        className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
                      >
                        <Phone className="w-3 h-3" />
                        <span>Call</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {cs.resolution_notes && (
                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 text-[11px] text-emerald-300">
                  <span className="font-bold text-emerald-400">Resolution: </span>
                  {cs.resolution_notes}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
              <span className="text-[10px] text-slate-500">
                Agent: {cs.assigned_agent_name || 'Unassigned'}
              </span>

              {cs.status !== 'resolved' ? (
                <button
                  onClick={() => setShowResolveModal(cs._id)}
                  className="bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30 text-xs font-semibold px-3 py-1 rounded-xl transition-all cursor-pointer"
                >
                  Mark Resolved
                </button>
              ) : (
                <span className="text-emerald-400 text-[11px] font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Resolved
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Resolve Support Case
            </h2>
            <form onSubmit={handleResolveCase} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-400">Resolution Summary *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Describe how this customer issue was resolved..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(null)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2 rounded-xl"
                >
                  Save Resolution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-indigo-400" />
                Open New Support Case
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCase} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-400">Case Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Account Provisioning Bug"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Customer Name</label>
                <input
                  type="text"
                  placeholder="e.g. Alex Rivera"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Customer Telephone</label>
                <input
                  type="text"
                  placeholder="+1 555-432-8899"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Priority</label>
                <select
                  value={newPriority}
                  onChange={(e: any) => setNewPriority(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Description *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Detailed customer inquiry or technical complaint..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
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
                  Create Case
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
