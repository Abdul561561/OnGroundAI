import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { CallRecord, Transcript } from '../../types';
import {
  History,
  PhoneCall,
  Clock,
  Sparkles,
  FileText,
  Loader2,
  RefreshCw,
  Plus,
  X,
  Bot,
  User,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export const CallHistory: React.FC = () => {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loadingTranscripts, setLoadingTranscripts] = useState(false);
  const [summarizingCallId, setSummarizingCallId] = useState<string | null>(null);

  // New transcript entry modal
  const [isAddingTranscript, setIsAddingTranscript] = useState(false);
  const [transcriptSpeaker, setTranscriptSpeaker] = useState('Agent');
  const [transcriptContent, setTranscriptContent] = useState('');

  const fetchCalls = async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await api.getCalls();
      setCalls(records);
    } catch (e: any) {
      console.error('Error fetching call records:', e);
      setError(e.message || 'Failed to load call history records from MongoDB Atlas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, []);

  const openTranscripts = async (call: CallRecord) => {
    setSelectedCall(call);
    setLoadingTranscripts(true);
    try {
      const list = await api.getTranscripts(call._id);
      setTranscripts(list);
    } catch (e) {
      console.error('Error fetching transcripts:', e);
    } finally {
      setLoadingTranscripts(false);
    }
  };

  const handleGenerateSummary = async (callId: string) => {
    setSummarizingCallId(callId);
    try {
      const res = await api.generateCallSummary(callId);
      setCalls((prev) =>
        prev.map((c) => (c._id === callId ? { ...c, ai_summary: res.summary } : c))
      );
      if (selectedCall && selectedCall._id === callId) {
        setSelectedCall((prev) => (prev ? { ...prev, ai_summary: res.summary } : null));
      }
    } catch (e: any) {
      alert(`Summary generation failed: ${e.message}`);
    } finally {
      setSummarizingCallId(null);
    }
  };

  const handleAddTranscript = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCall || !transcriptContent.trim()) return;

    try {
      const newEntry = await api.addTranscript(
        selectedCall._id,
        transcriptSpeaker,
        transcriptContent.trim()
      );
      setTranscripts((prev) => [...prev, newEntry]);
      setTranscriptContent('');
      setIsAddingTranscript(false);
    } catch (e: any) {
      alert(`Failed to add transcript: ${e.message}`);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Call History & Intelligence
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> AI Summaries
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Persisted call sessions with actual durations, transcripts, and OpenRouter AI executive summaries.
          </p>
        </div>

        <button
          onClick={fetchCalls}
          disabled={loading}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl transition-all border border-slate-700/60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Records</span>
        </button>
      </div>

      {/* Calls Table Card */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            <span>Loading records from MongoDB Atlas...</span>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-rose-400 text-xs space-y-2">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="font-semibold text-white">Error Loading Call History</p>
            <p className="max-w-md mx-auto text-rose-400/80">{error}</p>
            <button
              onClick={fetchCalls}
              className="mt-2 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : calls.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-2">
            <History className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="font-semibold text-slate-400">No Call Records Found</p>
            <p className="max-w-md mx-auto text-slate-500">
              When authenticated users initiate and complete WebRTC calls, session metadata, duration,
              and connection states are automatically stored in the MongoDB Atlas <code>calls</code> collection.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/40 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Caller & Recipient</th>
                  <th className="py-3 px-4 font-semibold">Duration</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Timestamp</th>
                  <th className="py-3 px-4 font-semibold">Intelligence & Transcripts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {calls.map((c) => (
                  <tr key={c._id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">
                        {c.caller_name || 'Caller'} → {c.recipient_name || 'Recipient'}
                      </div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                        {c.call_type} session
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 font-mono">
                      {c.duration_seconds ? formatDuration(c.duration_seconds) : '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                          c.status === 'connected'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : c.status === 'ended'
                            ? 'bg-slate-800 text-slate-300 border border-slate-700'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      {new Date(c.started_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openTranscripts(c)}
                          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-400" />
                          <span>Transcripts</span>
                        </button>

                        <button
                          onClick={() => handleGenerateSummary(c._id)}
                          disabled={summarizingCallId === c._id}
                          className="flex items-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs px-2.5 py-1.5 rounded-lg border border-indigo-500/30 transition-colors disabled:opacity-50"
                        >
                          {summarizingCallId === c._id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          )}
                          <span>{c.ai_summary ? 'Regenerate Summary' : 'AI Summary'}</span>
                        </button>
                      </div>

                      {/* Display AI Summary Snippet if present */}
                      {c.ai_summary && (
                        <div className="mt-2 p-2.5 bg-indigo-950/30 border border-indigo-900/40 rounded-xl text-[11px] text-indigo-200 line-clamp-2">
                          {c.ai_summary}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transcripts and Summary Modal */}
      {selectedCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col space-y-4">
            <button
              onClick={() => setSelectedCall(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white">Call Details & Transcripts</h2>
              <p className="text-xs text-slate-400">
                Call ID: <code className="text-blue-400">{selectedCall._id}</code> | Participants:{' '}
                {selectedCall.caller_name} & {selectedCall.recipient_name}
              </p>
            </div>

            {/* AI Summary Section */}
            {selectedCall.ai_summary ? (
              <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-100 space-y-2">
                <div className="flex items-center gap-2 font-bold text-indigo-300">
                  <Sparkles className="w-4 h-4" />
                  <span>OpenRouter AI Call Intelligence Summary</span>
                </div>
                <div className="whitespace-pre-wrap leading-relaxed text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-indigo-950">
                  {selectedCall.ai_summary}
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">No AI summary generated for this call yet.</span>
                <button
                  onClick={() => handleGenerateSummary(selectedCall._id)}
                  disabled={summarizingCallId === selectedCall._id}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {summarizingCallId === selectedCall._id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>Generate AI Summary</span>
                </button>
              </div>
            )}

            {/* Transcripts List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 max-h-60 pr-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Recorded Transcripts</span>
                <button
                  onClick={() => setIsAddingTranscript(!isAddingTranscript)}
                  className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Log Consented Dialogue</span>
                </button>
              </div>

              {isAddingTranscript && (
                <form
                  onSubmit={handleAddTranscript}
                  className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-2"
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={transcriptSpeaker}
                      onChange={(e) => setTranscriptSpeaker(e.target.value)}
                      placeholder="Speaker (e.g. Agent, Customer)"
                      className="w-1/3 bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-200"
                    />
                    <input
                      type="text"
                      required
                      value={transcriptContent}
                      onChange={(e) => setTranscriptContent(e.target.value)}
                      placeholder="Spoken dialogue content..."
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-200"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingTranscript(false)}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-lg"
                    >
                      Save Transcript
                    </button>
                  </div>
                </form>
              )}

              {loadingTranscripts ? (
                <div className="text-center py-6 text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading transcripts...</span>
                </div>
              ) : transcripts.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500">
                  No transcripts recorded for this session. Use "Log Consented Dialogue" to add spoken notes.
                </div>
              ) : (
                transcripts.map((t) => (
                  <div
                    key={t._id}
                    className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="font-semibold text-slate-300">{t.speaker}</span>
                      <span className="text-[10px]">
                        {new Date(t.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-slate-200">{t.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
