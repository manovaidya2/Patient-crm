import { useEffect, useState } from 'react';
import { BookOpen, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';

const emptyForm = { question: '', answer: '', category: '' };

const KnowledgeLibrary = () => {
  const [articles, setArticles] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadArticles = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/knowledge', { params: search ? { search } : {} });
      setArticles(data.articles || []);
    } catch (err) { setError(err.response?.data?.message || 'Could not load Knowledge Library.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { const timer = window.setTimeout(loadArticles, 250); return () => window.clearTimeout(timer); }, [search]);

  const saveArticle = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      if (editingId) await api.patch(`/knowledge/${editingId}`, form);
      else await api.post('/knowledge', form);
      setForm(emptyForm); setEditingId(null); await loadArticles();
    } catch (err) { setError(err.response?.data?.message || 'Knowledge article could not be saved.'); }
    finally { setSaving(false); }
  };
  const editArticle = (article) => { setEditingId(article.id); setForm({ question: article.question, answer: article.answer, category: article.category || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const deleteArticle = async (article) => {
    if (!window.confirm('Delete this knowledge entry?')) return;
    try { await api.delete(`/knowledge/${article.id}`); await loadArticles(); }
    catch (err) { setError(err.response?.data?.message || 'Knowledge article could not be deleted.'); }
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-5 border-b border-cardline pb-5">
        <p className="text-xs font-semibold uppercase text-charcoal/50">Shared Reference</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-charcoal">Knowledge Library</h1>
        <p className="mt-1 text-sm text-charcoal/55">Store common patient questions and approved answers for the Help Desk.</p>
      </div>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <Card>
        <div className="flex items-center gap-2"><Plus size={18} className="text-sage" /><h2 className="font-display text-lg font-bold">{editingId ? 'Edit Knowledge Entry' : 'Add Knowledge Entry'}</h2></div>
        <form onSubmit={saveArticle} className="mt-4 grid gap-4">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]"><label><span className="mb-1.5 block text-sm font-semibold">Question <span className="text-red-600">*</span></span><input required value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} placeholder="Patient question" className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm outline-none focus:border-sage" /></label><label><span className="mb-1.5 block text-sm font-semibold">Category</span><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Medicine, payment..." className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm outline-none focus:border-sage" /></label></div>
          <label><span className="mb-1.5 block text-sm font-semibold">Answer <span className="text-red-600">*</span></span><textarea required rows={4} value={form.answer} onChange={(event) => setForm({ ...form, answer: event.target.value })} placeholder="Approved answer or response" className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm outline-none focus:border-sage" /></label>
          <div className="flex gap-2"><Button type="submit" disabled={saving}><Plus size={16} /> {saving ? 'Saving...' : editingId ? 'Update Entry' : 'Add to Library'}</Button>{editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm); }}><X size={16} /> Cancel</Button>}</div>
        </form>
      </Card>
      <Card className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><BookOpen size={18} className="text-sage" /><h2 className="font-display text-lg font-bold">Knowledge Entries</h2></div><label className="flex items-center gap-2 rounded-lg border border-cardline bg-offwhite-200 px-3 py-2"><Search size={16} className="text-charcoal/50" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search questions or answers" className="w-56 bg-transparent text-sm outline-none" /></label></div>
        <div className="mt-4 divide-y divide-cardline">{loading ? <p className="py-10 text-center text-sm text-charcoal/50">Loading library...</p> : !articles.length ? <p className="rounded-lg bg-offwhite-200 px-4 py-10 text-center text-sm text-charcoal/50">No knowledge entries yet.</p> : articles.map((article) => <div key={article.id} className="py-4 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-charcoal">{article.question}</h3>{article.category && <span className="rounded-full bg-sage/10 px-2 py-0.5 text-xs font-semibold text-sage">{article.category}</span>}</div><p className="mt-2 whitespace-pre-line text-sm text-charcoal/75">{article.answer}</p><p className="mt-2 text-xs text-charcoal/45">Added by {article.createdByName || '-'}{article.updatedByName ? ` · Updated by ${article.updatedByName}` : ''}</p></div><div className="flex shrink-0 gap-1"><button onClick={() => editArticle(article)} className="p-2 text-sage" title="Edit"><Pencil size={16} /></button><button onClick={() => deleteArticle(article)} className="p-2 text-red-700" title="Delete"><Trash2 size={16} /></button></div></div></div>)}</div>
      </Card>
    </div>
  );
};

export default KnowledgeLibrary;
