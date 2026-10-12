import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  UserCheck,
  Tag,
  Trash2,
  Sparkles,
  ExternalLink,
  ChevronRight,
  X
} from 'lucide-react';
import { api } from '../../services/api';
import { Contact, FollowUp, CallRecord } from '../../types';

interface ContactManagerProps {
  onSelectForCall?: (phoneNumber: string, contact: Contact) => void;
  onOpenAgentAssist?: (contact: Contact) => void;
}

export const ContactManager: React.FC<ContactManagerProps> = ({
  onSelectForCall,
  onOpenAgentAssist,
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Modals & Drawers
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactHistory, setContactHistory] = useState<{
    calls: CallRecord[];
    follow_ups: FollowUp[];
  } | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // New Contact form
  const [newContact, setNewContact] = useState({
    name: '',
    phone_number: '',
    email: '',
    notes: '',
    tags: '',
    status: 'new',
  });

  // Follow-up sub-form
  const [showAddFollowUp, setShowAddFollowUp] = useState(false);
  const [newFollowUpDesc, setNewFollowUpDesc] = useState('');
  const [newFollowUpDue, setNewFollowUpDue] = useState('');

  useEffect(() => {
    loadContacts();
  }, [searchQuery, statusFilter, assignedToMe]);

  const loadContacts = async () => {
    setIsLoading(true);
    try {
      const data = await api.getContacts(searchQuery, statusFilter, assignedToMe);
      setContacts(data);
    } catch (e) {
      console.error('Failed to load contacts:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContact.name.trim() || !newContact.phone_number.trim()) return;

    try {
      const tagsArray = newContact.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const created = await api.createContact({
        name: newContact.name.trim(),
        phone_number: newContact.phone_number.trim(),
        email: newContact.email.trim() || undefined,
        notes: newContact.notes.trim() || undefined,
        tags: tagsArray,
        status: newContact.status as any,
      });

      setShowAddModal(false);
      setNewContact({ name: '', phone_number: '', email: '', notes: '', tags: '', status: 'new' });
      loadContacts();
      openContactDrawer(created);
    } catch (err: any) {
      alert(err.message || 'Error creating contact');
    }
  };

  const openContactDrawer = async (contact: Contact) => {
    setSelectedContact(contact);
    setIsLoadingHistory(true);
    try {
      const history = await api.getContactHistory(contact._id);
      setContactHistory({
        calls: history.calls || [],
        follow_ups: history.follow_ups || [],
      });
    } catch (err) {
      console.error('Error loading history:', err);
      setContactHistory({ calls: [], follow_ups: [] });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleCreateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContact || !newFollowUpDesc.trim()) return;

    try {
      const due = newFollowUpDue || new Date(Date.now() + 86400000 * 2).toISOString();
      await api.createContactFollowUp(selectedContact._id, {
        description: newFollowUpDesc.trim(),
        due_at: due,
      });

      setNewFollowUpDesc('');
      setNewFollowUpDue('');
      setShowAddFollowUp(false);
      // Reload history
      openContactDrawer(selectedContact);
    } catch (err: any) {
      alert(err.message || 'Error creating follow-up task');
    }
  };

  const handleToggleFollowUp = async (taskId: string, currentStatus: string) => {
    try {
      const nextStatus = currentStatus === 'completed' ? 'pending' : 'completed';
      await api.updateFollowUp(taskId, { status: nextStatus as any });
      if (selectedContact) {
        openContactDrawer(selectedContact);
      }
    } catch (e: any) {
      alert(e.message || 'Failed to update follow-up');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">New</span>;
      case 'contacted':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">Contacted</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">In Progress</span>;
      case 'closed':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Closed</span>;
      case 'do_not_call':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">DNC</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Search Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Users className="w-6 h-6 text-indigo-400" />
            Customer CRM & Phone Directory
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Search customers by phone number or name, trigger Click-to-Call, and track interaction history
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-950 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Customer</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
        <div className="md:col-span-5 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, telephone number (+1...), or email..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="md:col-span-4 flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Customer Statuses</option>
            <option value="new">New Lead</option>
            <option value="contacted">Contacted</option>
            <option value="in_progress">In Progress</option>
            <option value="closed">Closed / Won</option>
            <option value="do_not_call">Do Not Call</option>
          </select>
        </div>

        <div className="md:col-span-3 flex items-center gap-2">
          <button
            onClick={() => setAssignedToMe(!assignedToMe)}
            className={`w-full py-2 px-3 rounded-lg text-xs font-medium border transition-colors flex items-center justify-center gap-2 ${
              assignedToMe
                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>My Assigned Only</span>
          </button>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-950/60 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Customer Name</th>
                <th className="py-3 px-4">Telephone Number</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Assigned Agent</th>
                <th className="py-3 px-4">Last Interaction</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    Loading customer directory...
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 space-y-1">
                    <p className="font-medium text-slate-400">No matching contacts found.</p>
                    <p className="text-[11px]">Add a contact or adjust your search filter above.</p>
                  </td>
                </tr>
              ) : (
                contacts.map((c) => (
                  <tr
                    key={c._id}
                    onClick={() => openContactDrawer(c)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
                  >
                    <td className="py-3 px-4 font-semibold text-white group-hover:text-indigo-300 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-600/20 text-indigo-400 font-bold flex items-center justify-center text-xs">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div>{c.name}</div>
                        {c.email && <div className="text-[10px] text-slate-500 font-normal">{c.email}</div>}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {c.phone_number}
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(c.status)}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {c.assigned_agent_name || 'Unassigned'}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {c.last_interaction_at
                        ? new Date(c.last_interaction_at).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {onSelectForCall && (
                          <button
                            onClick={() => onSelectForCall(c.phone_number, c)}
                            className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-emerald-500/30"
                            title="Click to Call with Softphone"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Call</span>
                          </button>
                        )}
                        <button
                          onClick={() => openContactDrawer(c)}
                          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                          title="View Profile"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Detail Drawer / Modal */}
      {selectedContact && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full overflow-y-auto p-6 space-y-6 shadow-2xl flex flex-col justify-between">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-300 font-bold text-lg flex items-center justify-center border border-indigo-500/30">
                    {selectedContact.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedContact.name}</h2>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedContact.phone_number}</p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedContact(null)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                {onSelectForCall && (
                  <button
                    onClick={() => {
                      onSelectForCall(selectedContact.phone_number, selectedContact);
                      setSelectedContact(null);
                    }}
                    className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition-all"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Dial Softphone</span>
                  </button>
                )}

                {onOpenAgentAssist && (
                  <button
                    onClick={() => {
                      onOpenAgentAssist(selectedContact);
                      setSelectedContact(null);
                    }}
                    className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-950 transition-all"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Launch Agent Assist</span>
                  </button>
                )}
              </div>

              {/* CRM Profile Overview */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Customer Status</span>
                  {getStatusBadge(selectedContact.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Assigned Agent</span>
                  <span className="text-slate-300 font-medium">{selectedContact.assigned_agent_name || 'Unassigned'}</span>
                </div>
                {selectedContact.email && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Email</span>
                    <span className="text-slate-300">{selectedContact.email}</span>
                  </div>
                )}
                {selectedContact.notes && (
                  <div className="pt-2 border-t border-slate-800/60">
                    <span className="text-slate-500 block mb-1">Account Notes:</span>
                    <p className="text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      {selectedContact.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Follow-up Tasks */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-indigo-400" />
                    Follow-Up Tasks
                  </h3>
                  <button
                    onClick={() => setShowAddFollowUp(!showAddFollowUp)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    {showAddFollowUp ? 'Cancel' : '+ New Task'}
                  </button>
                </div>

                {showAddFollowUp && (
                  <form onSubmit={handleCreateFollowUp} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
                    <input
                      type="text"
                      placeholder="Task description (e.g. Call regarding SLA contract)..."
                      value={newFollowUpDesc}
                      onChange={(e) => setNewFollowUpDesc(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="datetime-local"
                      value={newFollowUpDue}
                      onChange={(e) => setNewFollowUpDue(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
                    >
                      Schedule Task
                    </button>
                  </form>
                )}

                {contactHistory?.follow_ups && contactHistory.follow_ups.length > 0 ? (
                  <div className="space-y-2">
                    {contactHistory.follow_ups.map((fu) => (
                      <div
                        key={fu._id}
                        className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs transition-colors ${
                          fu.status === 'completed'
                            ? 'bg-slate-950/40 border-slate-800/40 text-slate-500 line-through'
                            : 'bg-slate-950/80 border-slate-800 text-slate-200'
                        }`}
                      >
                        <div className="space-y-1">
                          <p className="font-medium">{fu.description}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            <Clock className="w-3 h-3" />
                            <span>Due: {new Date(fu.due_at).toLocaleDateString()}</span>
                            <span>• Agent: {fu.assigned_agent_name}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleToggleFollowUp(fu._id, fu.status)}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            fu.status === 'completed'
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/40">
                    No pending follow-ups for this customer.
                  </div>
                )}
              </div>

              {/* Call History & Past Transcripts */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  Past Call History & Intelligence
                </h3>

                {isLoadingHistory ? (
                  <div className="text-center py-6 text-xs text-slate-500">Loading interactions...</div>
                ) : contactHistory?.calls && contactHistory.calls.length > 0 ? (
                  <div className="space-y-2.5">
                    {contactHistory.calls.map((call) => (
                      <div
                        key={call._id}
                        className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white capitalize">{call.direction || 'Outbound'} Call</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                              {call.duration_seconds}s
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {new Date(call.started_at).toLocaleDateString()}
                          </span>
                        </div>

                        {call.outcome && (
                          <div className="flex items-center gap-1.5 text-[11px] text-indigo-300">
                            <span className="text-slate-500">Outcome:</span>
                            <span className="font-medium capitalize">{call.outcome.replace('_', ' ')}</span>
                          </div>
                        )}

                        {call.notes && (
                          <div className="text-[11px] text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-800/60">
                            {call.notes}
                          </div>
                        )}

                        {call.ai_summary && (
                          <div className="text-[11px] text-emerald-300/90 bg-emerald-950/20 p-2 rounded border border-emerald-900/40 flex items-start gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 shrink-0 text-emerald-400 mt-0.5" />
                            <span>{call.ai_summary}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/40">
                    No recorded calls for this customer yet.
                  </div>
                )}
              </div>
            </div>

            {/* Bottom info */}
            <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-500 flex justify-between items-center">
              <span>Customer ID: {selectedContact._id.slice(0, 8)}...</span>
              <span className="text-indigo-400">OnGround AI CRM</span>
            </div>
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                Add New Customer
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateContact} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jane Doe"
                  value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Telephone Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. +1 (555) 234-5678"
                  value={newContact.phone_number}
                  onChange={(e) => setNewContact({ ...newContact, phone_number: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Email (Optional)</label>
                  <input
                    type="email"
                    placeholder="customer@domain.com"
                    value={newContact.email}
                    onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Initial Status</label>
                  <select
                    value={newContact.status}
                    onChange={(e) => setNewContact({ ...newContact, status: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="new">New Lead</option>
                    <option value="contacted">Contacted</option>
                    <option value="in_progress">In Progress</option>
                    <option value="closed">Closed / Won</option>
                    <option value="do_not_call">Do Not Call</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Tags (Comma-separated)</label>
                <input
                  type="text"
                  placeholder="vip, enterprise, inbound"
                  value={newContact.tags}
                  onChange={(e) => setNewContact({ ...newContact, tags: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Account Notes</label>
                <textarea
                  rows={2}
                  placeholder="Customer requirements, company info, preferences..."
                  value={newContact.notes}
                  onChange={(e) => setNewContact({ ...newContact, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
