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
import { CREATABLE_ROLES, ROLE_LABELS } from '../../constants/roles.js';

const emptyForm = { name: '', email: '', password: '', role: '', phone: '' };

const TeamMembers = () => {
  const { toasts, showToast, dismissToast } = useToast();
  const { user } = useAuth();

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
  const [adminPasswordForm, setAdminPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [adminPasswordErrors, setAdminPasswordErrors] = useState({});
  const [changingAdminPassword, setChangingAdminPassword] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
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
          role: form.role,
          phone: form.phone,
        };
        if (form.password.trim()) payload.password = form.password;
        await api.patch(`/users/${editingUser.id}`, payload);
        showToast(form.password.trim() ? 'Team member and password updated' : 'Team member updated');
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
    try {
      await api.patch(`/users/${user.id}`, { isActive: !user.isActive });
      showToast(user.isActive ? 'Login deactivated' : 'Login activated');
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not update status', 'error');
    }
  };

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
    if (!adminPasswordForm.currentPassword) errors.currentPassword = 'Current password is required';
    if (!adminPasswordForm.newPassword) errors.newPassword = 'New password is required';
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
      await api.patch('/auth/password', {
        currentPassword: adminPasswordForm.currentPassword,
        newPassword: adminPasswordForm.newPassword,
      });
      setAdminPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setAdminPasswordErrors({});
      showToast('Admin password changed');
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
          <h1 className="font-display text-2xl font-bold text-charcoal">Team Members</h1>
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
              <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Change your admin password</h2>
              <p className="mt-1 text-sm text-charcoal/55">{user?.email}</p>
            </div>
          </div>
          <form onSubmit={handleAdminPasswordChange} className="grid w-full gap-3 lg:max-w-3xl lg:grid-cols-3">
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
              label="New password"
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
                {changingAdminPassword ? 'Changing...' : 'Change password'}
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
            {CREATABLE_ROLES.map((r) => (
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
                          onClick={() => setDeleteTarget(u)}
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
            disabled={!!editingUser}
          />
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
            options={CREATABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
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
        <p className="text-sm text-charcoal/70">
          Are you sure you want to remove <span className="font-semibold text-charcoal">{deleteTarget?.name}</span>?
          Their login will stop working immediately. This cannot be undone.
        </p>
        <div className="flex items-center justify-end gap-2 pt-5">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default TeamMembers;
