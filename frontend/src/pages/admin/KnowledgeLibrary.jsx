import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronDown, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';

const emptyForm = { question: '', answer: '', categoryId: '' };

const KnowledgeLibrary = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { categoryId } = useParams();
  const isAdmin = user?.role === ROLES.ADMIN;
  const isCategoryPage = Boolean(categoryId);
  const [categories, setCategories] = useState([]);
  const [articles, setArticles] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [openQuestions, setOpenQuestions] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [questionModal, setQuestionModal] = useState(false);

  const loadCategories = async () => {
    const { data } = await api.get('/knowledge/categories', { skipCache: true });
    setCategories(data.categories || []);
  };
  const loadArticles = async () => {
    if (!isCategoryPage) { setArticles([]); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const params = { categoryId };
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get('/knowledge', { params, skipCache: true });
      setArticles(data.articles || []);
    } catch (err) { setError(err.response?.data?.message || 'Could not load questions.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadCategories().catch(() => setError('Could not load categories.')); }, []);
  useEffect(() => { const timer = window.setTimeout(loadArticles, 250); return () => window.clearTimeout(timer); }, [categoryId, search]);

  const category = categories.find((item) => item.id === categoryId);
  const closeQuestionModal = () => { setQuestionModal(false); setEditingId(null); setForm(emptyForm); };
  const openAdd = () => { setEditingId(null); setForm({ ...emptyForm, categoryId }); setError(''); setQuestionModal(true); };
  const editArticle = (article) => { setEditingId(article.id); setForm({ question: article.question, answer: article.answer, categoryId: article.categoryId || categoryId }); setError(''); setQuestionModal(true); };
  const saveArticle = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      if (editingId) await api.patch(`/knowledge/${editingId}`, form);
      else await api.post('/knowledge', form);
      closeQuestionModal(); await Promise.all([loadCategories(), loadArticles()]);
    } catch (err) { setError(err.response?.data?.message || 'Knowledge question could not be saved.'); }
    finally { setSaving(false); }
  };
  const deleteArticle = async (article) => {
    if (!window.confirm('Delete this knowledge question?')) return;
    try { await api.delete(`/knowledge/${article.id}`); await Promise.all([loadCategories(), loadArticles()]); }
    catch (err) { setError(err.response?.data?.message || 'Knowledge question could not be deleted.'); }
  };
  const addCategory = async (event) => {
    event.preventDefault(); if (!categoryName.trim()) return;
    try { const { data } = await api.post('/knowledge/categories', { name: categoryName }); setCategoryName(''); await loadCategories(); navigate(`/admin/knowledge-library/${data.category.id}`); }
    catch (err) { setError(err.response?.data?.message || 'Category could not be created.'); }
  };
  const deleteCategory = async (item) => {
    if (!window.confirm(`Delete the ${item.name} category?`)) return;
    try { await api.delete(`/knowledge/categories/${item.id}`); await loadCategories(); }
    catch (err) { setError(err.response?.data?.message || 'Category cannot be deleted while it has questions.'); }
  };
  const toggleQuestion = (id) => setOpenQuestions((current) => ({ ...current, [id]: !current[id] }));

  if (!isCategoryPage) return <div className="mx-auto max-w-[1200px]">
    <div className="mb-5 border-b border-cardline pb-5"><p className="text-xs font-semibold uppercase tracking-wide text-charcoal/60">Shared reference</p><h1 className="mt-1 font-display text-2xl font-bold text-charcoal">Knowledge Library</h1><p className="mt-1 text-sm text-charcoal/70">Choose a category to view its questions and approved answers.</p></div>
    {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    <Card padded={false}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-cardline px-5 py-4"><div className="flex items-center gap-2"><BookOpen size={19} className="text-sage" /><div><h2 className="font-display text-lg font-bold text-charcoal">Categories</h2><p className="text-xs text-charcoal/65">Select a topic to open its knowledge page.</p></div></div>{isAdmin && <form onSubmit={addCategory} className="flex gap-2"><input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="New category" className="w-36 rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm outline-none focus:border-sage" /><Button type="submit" size="sm"><Plus size={15} /> Add category</Button></form>}</div><div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">{!categories.length ? <div className="col-span-full rounded-lg border border-dashed border-cardline px-5 py-14 text-center text-sm text-charcoal/65">No categories created yet.</div> : categories.map((item) => <div key={item.id} className="group flex items-center justify-between rounded-lg border border-cardline bg-offwhite-200/35 p-4 transition hover:border-sage hover:bg-sage-muted/10"><button type="button" onClick={() => navigate(`/admin/knowledge-library/${item.id}`)} className="min-w-0 flex-1 text-left"><span className="block truncate font-display text-lg font-bold text-charcoal">{item.name}</span><span className="mt-1 block text-sm text-charcoal/70">{item.count} question{item.count === 1 ? '' : 's'}</span></button><div className="flex items-center gap-1"><button type="button" onClick={() => navigate(`/admin/knowledge-library/${item.id}`)} title="Open category" className="rounded p-2 text-sage hover:bg-sage-muted/15"><BookOpen size={18} /></button>{isAdmin && <button type="button" onClick={() => deleteCategory(item)} title="Delete category" className="rounded p-2 text-red-700 hover:bg-red-50"><Trash2 size={16} /></button>}</div></div>)}</div></Card>
  </div>;

  return <div className="mx-auto max-w-[1200px]">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-cardline pb-5"><div><button type="button" onClick={() => navigate('/admin/knowledge-library')} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-sage hover:text-charcoal"><ArrowLeft size={16} /> All categories</button><p className="text-xs font-semibold uppercase tracking-wide text-charcoal/60">Knowledge category</p><h1 className="mt-1 font-display text-2xl font-bold text-charcoal">{category?.name || 'Category'}</h1><p className="mt-1 text-sm text-charcoal/70">{articles.length} question{articles.length === 1 ? '' : 's'} in this category.</p></div><div className="flex w-full items-center gap-2 sm:w-auto"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 sm:w-64"><Search size={16} className="shrink-0 text-charcoal/55" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search questions" className="min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-charcoal/55" /></label><Button size="sm" onClick={openAdd}><Plus size={15} /> Add question</Button></div></div>
    {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    <Card padded={false}>{loading ? <p className="px-5 py-14 text-center text-sm text-charcoal/70">Loading questions...</p> : !articles.length ? <div className="px-5 py-16 text-center"><BookOpen size={28} className="mx-auto text-charcoal/45" /><p className="mt-2 font-semibold text-charcoal">No questions in this category</p><p className="mt-1 text-sm text-charcoal/65">Add the first question for this topic.</p></div> : <div className="divide-y divide-cardline-soft">{articles.map((article) => <div key={article.id}><div className="flex items-center gap-3 px-5 py-4"><button type="button" onClick={() => toggleQuestion(article.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><ChevronDown size={17} className={`shrink-0 text-sage transition-transform ${openQuestions[article.id] ? 'rotate-180' : ''}`} /><span className="font-semibold text-charcoal">{article.question}</span></button>{isAdmin && <div className="flex shrink-0 gap-1"><button type="button" onClick={() => editArticle(article)} title="Edit question" className="rounded p-2 text-sage hover:bg-sage-muted/15"><Pencil size={15} /></button><button type="button" onClick={() => deleteArticle(article)} title="Delete question" className="rounded p-2 text-red-700 hover:bg-red-50"><Trash2 size={15} /></button></div>}</div>{openQuestions[article.id] && <div className="border-t border-cardline-soft bg-cream/45 px-12 py-4"><p className="whitespace-pre-line text-sm leading-6 text-charcoal/85">{article.answer}</p><p className="mt-3 text-xs text-charcoal/65">Added by {article.createdByName || '-'}{article.updatedByName ? ` | Updated by ${article.updatedByName}` : ''}</p></div>}</div>)}</div>}</Card>
    <Modal open={questionModal} onClose={closeQuestionModal} title={editingId ? 'Edit knowledge question' : 'Add knowledge question'} className="max-w-2xl"><form onSubmit={saveArticle} className="space-y-4"><label className="block"><span className="mb-1.5 block text-sm font-semibold">Category</span><input value={category?.name || ''} readOnly className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm text-charcoal/70" /></label><label className="block"><span className="mb-1.5 block text-sm font-semibold">Question <span className="text-red-600">*</span></span><input required value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} placeholder="Patient question" className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm outline-none focus:border-sage" /></label><label className="block"><span className="mb-1.5 block text-sm font-semibold">Answer <span className="text-red-600">*</span></span><textarea required rows={5} value={form.answer} onChange={(event) => setForm({ ...form, answer: event.target.value })} placeholder="Approved answer or response" className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm outline-none focus:border-sage" /></label><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={closeQuestionModal}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update question' : 'Add question'}</Button></div></form></Modal>
  </div>;
};

export default KnowledgeLibrary;
