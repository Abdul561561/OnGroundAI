import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { KnowledgeBaseArticle } from '../../types';
import {
  BookOpen,
  Search,
  Plus,
  Tag,
  ShieldCheck,
  CheckCircle2,
  Trash2,
  X,
  FileText,
  Sparkles,
  HelpCircle,
  ExternalLink
} from 'lucide-react';

const CATEGORIES = ['All', 'Policies', 'Pricing', 'Technical', 'Operations', 'Compliance'];

export const KnowledgeBaseView: React.FC = () => {
  const [articles, setArticles] = useState<KnowledgeBaseArticle[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeBaseArticle | null>(null);

  // New Article modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Policies');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');

  const loadArticles = async () => {
    setIsLoading(true);
    try {
      const data = await api.getKnowledgeBase(
        selectedCategory === 'All' ? undefined : selectedCategory,
        searchQuery || undefined
      );
      setArticles(data);
    } catch (e) {
      console.error('Error loading knowledge base:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadArticles();
  }, [selectedCategory, searchQuery]);

  const handleCreateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    try {
      const tagsList = newTags.split(',').map((t) => t.trim()).filter(Boolean);
      await api.createKnowledgeBaseArticle({
        title: newTitle.trim(),
        category: newCategory,
        content: newContent.trim(),
        tags: tagsList,
      });
      setShowAddModal(false);
      setNewTitle('');
      setNewContent('');
      setNewTags('');
      loadArticles();
    } catch (err: any) {
      alert(`Failed to save article: ${err.message}`);
    }
  };

  const handleDeleteArticle = async (id: string) => {
    if (!window.confirm('Delete this knowledge base article from MongoDB Atlas?')) return;
    try {
      await api.deleteKnowledgeBaseArticle(id);
      if (selectedArticle?._id === id) setSelectedArticle(null);
      loadArticles();
    } catch (err: any) {
      alert(`Error deleting article: ${err.message}`);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-indigo-400" />
              Company Knowledge Base & Grounding
            </h1>
            <span className="px-2.5 py-0.5 text-[11px] font-semibold rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> AI Grounding Active
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            Authoritative company documentation, refund policies, SLA rules, and technical guides automatically injected into OpenRouter system prompts for Voice AI, Text AI, and Agent Assist.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Article</span>
        </button>
      </div>

      {/* Category Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search knowledge base..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Articles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {articles.map((art) => (
          <div
            key={art._id}
            onClick={() => setSelectedArticle(art)}
            className="bg-slate-900 border border-slate-800 hover:border-indigo-500/40 p-5 rounded-2xl space-y-3 shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  {art.category}
                </span>
                <span className="text-[10px] text-slate-500">
                  Updated: {new Date(art.updated_at).toLocaleDateString()}
                </span>
              </div>
              <h3 className="font-bold text-white text-sm line-clamp-1">{art.title}</h3>
              <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{art.content}</p>
            </div>

            {art.tags && art.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800/60">
                {art.tags.slice(0, 3).map((tag, i) => (
                  <span key={i} className="text-[9px] bg-slate-950 px-2 py-0.5 rounded-md text-slate-400 border border-slate-800 flex items-center gap-1">
                    <Tag className="w-2.5 h-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Article Detail Drawer / Modal */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  {selectedArticle.category}
                </span>
                <h2 className="text-lg font-bold text-white mt-1">{selectedArticle.title}</h2>
              </div>
              <button
                onClick={() => setSelectedArticle(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 text-xs text-slate-300 leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap">
              {selectedArticle.content}
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex flex-wrap gap-1.5">
                {selectedArticle.tags?.map((tag, i) => (
                  <span key={i} className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-md text-slate-300">
                    #{tag}
                  </span>
                ))}
              </div>

              <button
                onClick={() => handleDeleteArticle(selectedArticle._id)}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 px-3 py-1.5 rounded-xl hover:bg-rose-500/10 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Article Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                Publish Knowledge Base Article
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateArticle} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-400">Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Enterprise Service Level Agreement (SLA)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Category *</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                >
                  {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Article Content *</label>
                <textarea
                  required
                  rows={5}
                  placeholder="Full policy details, troubleshooting steps, or product specifications..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Tags (comma separated)</label>
                <input
                  type="text"
                  placeholder="sla, enterprise, uptime, priority"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
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
                  Publish Article
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
