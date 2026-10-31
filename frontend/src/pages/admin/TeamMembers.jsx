import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, UserX2, Inbox, AlertTriangle, ShieldCheck } from 'lucide-react';
import api from '../../api/axios.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { useToast } from '../../components/useToast.js';
import { CREATABLE_ROLES, RETIRED_ROLES, ROLE_LABELS } from '../../constants/roles.js';
import { Users as PageTitleIcon } from 'lucide-react';

const emptyForm = { name: '', email: '', password: '', role: '', phone: '' };

const TeamMembers = () => {
  const { toasts, showToast, dismissToast } = useToast();
  const { user, refreshUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [adminPasswordForm, setAdminPasswordForm] = useState({ email: '', currentPassword: '', newPassword: '', confirmPassword: '' });
  useEffect(() => { if (user?.email) setAdminPasswordForm((f) => (f.email ? f : { ...f, email: user.email })); }, [user?.email]);
  const [adminPasswordErrors, setAdminPasswordErrors] = useState({});
  const [changingAdminPassword, setChangingAdminPassword] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  // Deactivate: a confirm box saying what happens and what is still linked to the person (to hand it over).
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [links, setLinks] = useState(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const loadLinks = async (u) => { setLinks(null); try { const { data } = await api.get(`/users/${u.id}/links`); setLinks(data.links); } catch { setLinks({ total: 0, error: true }); } };
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get('/users');
      setUsers(data.users);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Could not load team members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter ? u.role === roleFilter : true;
      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  const openAddModal = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setForm({ name: user.name, email: user.email, password: '', role: user.role, phone: user.phone || '' });
    setFormErrors({});
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    if (!form.email.trim()) errors.email = 'Email is required';
    if (!editingUser && !form.password.trim()) errors.password = 'Password is required';
    if (form.password && form.password.length < 6)
      errors.password = 'Password must be at least 6 characters';
    if (!form.role) errors.role = 'Select a role';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    try {
      if (editingUser) {
        const payload = {
          name: form.name,
          email: form.email,
          role: form.role,
          phone: form.phone,
        };
        if (form.password.trim()) payload.password = form.password;
        await api.patch(`/users/${editingUser.id}`, payload);
        const emailChanged = form.email.trim().toLowerCase() !== String(editingUser.email || '').toLowerCase();
        if (form.password.trim()) showToast(`${form.name} is logged out on every device and must log in with the new password.`);
        showToast([emailChanged && 'login email', form.password.trim() && 'password'].filter(Boolean).length
          ? `Team member updated (${[emailChanged && 'login email', form.password.trim() && 'password'].filter(Boolean).join(' and ')} changed)`
          : 'Team member updated');
      } else {
        await api.post('/users', form);
        showToast('Login created successfully');
      }
      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Something went wrong', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user) => {
    // Turning a login off asks first; turning it back on is immediate.
    if (user.isActive) { setDeactivateTarget(user); loadLinks(user); return; }
    try {
      await api.patch(`/users/${user.id}`, { isActive: true });
      showToast(`${user.name} is active again`);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not update status', 'error');
    }
  };
  const confirmDeactivate = async () => {
    setStatusSaving(true);
    try {
      await api.patch(`/users/${deactivateTarget.id}`, { isActive: false });
      showToast(`${deactivateTarget.name} deactivated: logged out and hidden from every list`);
      setDeactivateTarget(null); setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not deactivate', 'error');
    } finally { setStatusSaving(false); }
  };
  const LINK_ROWS = [['phasePatients', 'patients have them as the phase Post Counselor', 'their name stays there'], ['pccPatients', 'patients have them as PCC', 'assign another PCC on those patients'], ['psyPatients', 'patients have them as psychologist', ''], ['pendingSent', 'patients sent to them for post counselling, not finished', 'these wait for them: Admin can still open and finish them'], ['openEnquiries', 'open enquiries assigned to them', 'forward them to someone else'], ['openQueries', 'open team chat queries sent to them', 'forward them to someone else'], ['pnb', 'package-not-bought records added by them', '']];

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      showToast('Team member removed');
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not delete user', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleAdminPasswordChange = async (e) => {
    e.preventDefault();
    const errors = {};
    const nextEmail = adminPasswordForm.email.trim().toLowerCase();
    const emailChanged = nextEmail && nextEmail !== String(user?.email || '').toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(nextEmail)) errors.email = 'Enter a valid email';
    if (!adminPasswordForm.currentPassword) errors.currentPassword = 'Current password is required';
    if (!emailChanged && !adminPasswordForm.newPassword) errors.newPassword = 'Enter a new password or a new email';
    if (adminPasswordForm.newPassword && adminPasswordForm.newPassword.length < 6) {
      errors.newPassword = 'Password must be at least 6 characters';
    }
    if (adminPasswordForm.newPassword !== adminPasswordForm.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    setAdminPasswordErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setChangingAdminPassword(true);
    try {
      const { data } = await api.patch('/auth/account', {
        currentPassword: adminPasswordForm.currentPassword,
        email: nextEmail,
        ...(adminPasswordForm.newPassword ? { newPassword: adminPasswordForm.newPassword } : {}),
      });
      // A new password logs out the other devices; this one continues with the new token.
      if (data.token) localStorage.setItem('crm_token', data.token);
      refreshUser(data.user);
      setAdminPasswordForm({ email: data.user?.email || nextEmail, currentPassword: '', newPassword: '', confirmPassword: '' });
      setAdminPasswordErrors({});
      showToast(`Admin ${(data.changed || []).join(' and ') || 'login'} changed${data.token ? '. Logged out on your other devices.' : ''}`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not change password', 'error');
    } finally {
      setChangingAdminPassword(false);
    }
  };

  return (
    <div>
      <Toast toasts={toasts} onDismiss={dismissToast} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 font-display text-2xl font-bold text-charcoal"><PageTitleIcon size={20} aria-hidden="true" />Team Members</h1>
          <p className="mt-1 text-sm text-charcoal/60">Create and manage logins for your departments.</p>
        </div>
        <Button onClick={openAddModal} className="shrink-0">
          <Plus size={16} /> Add Team Member
        </Button>
      </div>

      <Card className="mt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sage-muted/35 text-sage">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide font-semibold text-charcoal/55">Admin Security</p>
              <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Your admin login</h2>
              <p className="mt-1 text-sm text-charcoal/55">Signed in as {user?.email}. Change the email, the password, or both; your current password confirms it.</p>
            </div>
          </div>
          <form onSubmit={handleAdminPasswordChange} className="grid w-full gap-3 lg:max-w-3xl lg:grid-cols-2">
            <Input
              id="admin-email"
              type="email"
              label="Login email"
              value={adminPasswordForm.email}
              onChange={(e) => setAdminPasswordForm({ ...adminPasswordForm, email: e.target.value })}
              error={adminPasswordErrors.email}
              autoComplete="username"
            />
            <Input
              id="admin-current-password"
              type="password"
              label="Current password"
              value={adminPasswordForm.currentPassword}
              onChange={(e) => setAdminPasswordForm({ ...adminPasswordForm, currentPassword: e.target.value })}
              error={adminPasswordErrors.currentPassword}
              autoComplete="current-password"
            />
            <Input
              id="admin-new-password"
              type="password"
              label="New password (optional)"
              placeholder="Leave blank to keep it"
              value={adminPasswordForm.newPassword}
              onChange={(e) => setAdminPasswordForm({ ...adminPasswordForm, newPassword: e.target.value })}
              error={adminPasswordErrors.newPassword}
              autoComplete="new-password"
            />
            <div className="space-y-3">
              <Input
                id="admin-confirm-password"
                type="password"
                label="Confirm password"
                value={adminPasswordForm.confirmPassword}
                onChange={(e) => setAdminPasswordForm({ ...adminPasswordForm, confirmPassword: e.target.value })}
                error={adminPasswordErrors.confirmPassword}
                autoComplete="new-password"
              />
              <Button type="submit" className="w-full" disabled={changingAdminPassword}>
                {changingAdminPassword ? 'Saving...' : 'Save login'}
              </Button>
            </div>
          </form>
        </div>
      </Card>

      <Card className="mt-6" padded={false}>
        <div className="p-4 flex flex-col sm:flex-row gap-3 border-b border-cardline-soft">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
            <input
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-cardline bg-offwhite-200 pl-9 pr-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition sm:w-56"
          >
            <option value="">All roles</option>
            {[...CREATABLE_ROLES, ...RETIRED_ROLES].map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-charcoal/55">Loading team members…</div>
        ) : loadError ? (
          <div className="p-10 flex flex-col items-center text-center gap-2">
            <AlertTriangle size={22} className="text-[#8C3B2E]" />
            <p className="text-sm text-charcoal font-medium">{loadError}</p>
            <Button variant="outline" size="sm" onClick={fetchUsers} className="mt-1">
              Try again
            </Button>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-10 flex flex-col items-center text-center gap-2">
            <Inbox size={22} className="text-charcoal/35" />
            <p className="text-sm text-charcoal font-medium">No team members found</p>
            <p className="text-xs text-charcoal/55">
              {users.length === 0 ? 'Add your first team member to get started.' : 'Try a different search or filter.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-charcoal/55 border-b border-cardline-soft">
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="border-b border-cardline-soft last:border-0 hover:bg-offwhite-300/25">
                    <td className="px-5 py-3.5 font-medium text-charcoal">{u.name}</td>
                    <td className="px-5 py-3.5 text-charcoal/70">{u.email}</td>
                    <td className="px-5 py-3.5">
                      <Badge tone="teal">{u.roleLabel}</Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={u.isActive ? 'active' : 'inactive'}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      {!u.isActive && u.deactivatedAt && <span className="mt-0.5 block text-[11px] text-charcoal/50">since {new Date(u.deactivatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}{u.deactivatedByName ? ` by ${u.deactivatedByName}` : ''}</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(u)}
                          aria-label={`Edit ${u.name}`}
                          className="p-2 rounded-md text-sage hover:bg-sage-muted/25"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => toggleActive(u)}
                          aria-label={u.isActive ? `Deactivate ${u.name}` : `Activate ${u.name}`}
                          className="p-2 rounded-md text-sage hover:bg-sage-muted/25"
                        >
                          <UserX2 size={15} />
                        </button>
                        <button
                          onClick={() => { setDeleteTarget(u); loadLinks(u); }}
                          aria-label={`Delete ${u.name}`}
                          className="p-2 rounded-md text-[#8C3B2E] hover:bg-[#8C3B2E]/10"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingUser ? 'Edit Team Member' : 'Add Team Member'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="name"
            label="Full name"
            placeholder="e.g. Priya Sharma"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={formErrors.name}
          />
          <Input
            id="email"
            type="email"
            label="Email"
            placeholder="name@company.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            error={formErrors.email}
          />
          {editingUser && <p className="-mt-2 text-xs text-charcoal/55">This is the login email. If you change it, the member signs in with the new email from now on.</p>}
          <Input
            id="password"
            type="password"
            label={editingUser ? 'New password (optional)' : 'Password'}
            placeholder={editingUser ? 'Leave blank to keep current password' : 'Minimum 6 characters'}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            error={formErrors.password}
            autoComplete={editingUser ? 'new-password' : 'new-password'}
          />
          <Select
            id="role"
            label="Role"
            placeholder="Select a role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            error={formErrors.role}
            options={[...CREATABLE_ROLES, ...(RETIRED_ROLES.includes(form.role) ? [form.role] : [])].map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          />
          <Input
            id="phone"
            label="Phone (optional)"
            placeholder="e.g. 98765 43210"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : editingUser ? 'Save changes' : 'Create login'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove team member">
        {!links ? <p className="text-sm text-charcoal/60">Checking what is linked to {deleteTarget?.name}…</p> : links.total > 0 ? (
          <div className="space-y-3 text-sm">
            <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span><b>{deleteTarget?.name}</b> cannot be deleted: patients and work are linked to them. Deleting would leave those records pointing at nobody.</span></p>
            <ul className="space-y-1 text-charcoal/75">{LINK_ROWS.filter(([k]) => links[k]).map(([k, label]) => <li key={k}><b className="text-charcoal">{links[k]}</b> {label}</li>)}</ul>
            <p className="text-charcoal/70"><b>Deactivate</b> them instead: they are logged out, hidden from every list (reception, Team Chat, Enquiries, assignments) and their name stays on the patients they handled.</p>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>{deleteTarget?.isActive && <Button onClick={() => { setDeactivateTarget(deleteTarget); setDeleteTarget(null); }}><UserX2 size={15} />Deactivate instead</Button>}</div>
          </div>
        ) : (<>
        <p className="text-sm text-charcoal/70">
          Are you sure you want to remove <span className="font-semibold text-charcoal">{deleteTarget?.name}</span>?
          Nothing in the CRM is linked to them. Their login will stop working immediately. This cannot be undone.
        </p>
        <div className="flex items-center justify-end gap-2 pt-5">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? 'Removing…' : 'Remove'}
          </Button>
        </div>
        </>)}
      </Modal>

      <Modal open={!!deactivateTarget} onClose={() => !statusSaving && setDeactivateTarget(null)} title={`Deactivate ${deactivateTarget?.name || ''}`}>
        {deactivateTarget && <div className="space-y-3 text-sm">
          <p className="text-charcoal/75">For someone who has left. Their account is kept, but:</p>
          <ul className="list-disc space-y-1 pl-5 text-charcoal/75">
            <li>they are <b>logged out at once</b> on every device and cannot log in;</li>
            <li>they are <b>hidden everywhere</b>: reception cannot send patients to them, and they are not in Team Chat, Enquiries or any assignment list;</li>
            <li>their <b>name stays</b> on the patients and records they handled (e.g. the phase Post Counselor in Patient Details).</li>
          </ul>
          {!links ? <p className="text-charcoal/55">Checking what is linked to them…</p> : links.total > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="mb-1 font-semibold text-amber-900">Still linked to them</p>
              <ul className="space-y-1 text-amber-900/90">{LINK_ROWS.filter(([k]) => links[k]).map(([k, label, hint]) => <li key={k}><b>{links[k]}</b> {label}{hint ? <span className="block text-xs text-amber-900/70">{hint}</span> : null}</li>)}</ul>
            </div>
          )}
          <p className="text-xs text-charcoal/55">You can activate them again any time from this page.</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" disabled={statusSaving} onClick={() => setDeactivateTarget(null)}>Cancel</Button><Button variant="danger" disabled={statusSaving} onClick={confirmDeactivate}><UserX2 size={15} />{statusSaving ? 'Deactivating…' : 'Deactivate'}</Button></div>
        </div>}
      </Modal>
    </div>
  );
};

export default TeamMembers;
