import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, UserCog, ShieldAlert } from 'lucide-react';
import { StepUpPasswordDialog } from '../../../components/feedback/StepUpPasswordDialog';
import { usersApi, BACKEND_ROLE_KEY, ROLE_KEY_LABEL } from '../../../lib/api/users';
import { apiClient } from '../../../lib/api/client';
import { settingsApi, type RoleRecord } from '../../../lib/api/settings';
import { apiErrorMessage } from '../../../lib/api/insights';

const roles = [
  'Super Admin', 'Purchase', 'Inventory', 'Design', 'Production', 'Packing', 'Sales', 'Factory User', 'Artisan User',
];

/**
 * "Department Admin clearance" per department = the backend permission that unlocks that
 * department's amounts (permissions.catalogue.ts). Stored as a per-user override relative to
 * the role: ticked + role lacks it -> allow override; unticked + role has it -> deny override.
 */
const BACKEND_AMOUNT_PERMISSION_BY_ROLE: Record<string, string> = {
  Purchase: 'purchase.rates.view',
  Inventory: 'stock.value.view',
  Design: 'design.rate.view',
  Production: 'receipt.charges.edit',
  Sales: 'costing.view',
};
const AMOUNT_LABEL: Record<string, string> = {
  Purchase: 'purchase rates and amounts',
  Inventory: 'stock values',
  Design: 'design rates',
  Production: 'job charges and receipt amounts',
  Sales: 'cost and margin on sales',
};

interface Party { id: string; name: string; type: 'FACTORY' | 'ARTISAN' }

interface FormData {
  name: string;
  username: string;
  email: string;
  phone: string;
  role: string;
  partyId: string;
  status: 'Active' | 'Inactive';
  newPassword: string;
  confirmPassword: string;
  /** "Department Admin" clearance — sees/enters pricing & amounts for their own department only. */
  canViewAmounts: boolean;
}

export function UserForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [saveError, setSaveError] = useState('');

  const [form, setForm] = useState<FormData>({
    name: '',
    username: '',
    email: '',
    phone: '',
    role: 'Production',
    partyId: '',
    status: 'Active',
    newPassword: '',
    confirmPassword: '',
    canViewAmounts: false,
  });
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [parties, setParties] = useState<Party[]>([]);
  const [roleDefs, setRoleDefs] = useState<RoleRecord[]>([]);
  const [overrides, setOverrides] = useState<{ allow: string[]; deny: string[] }>({ allow: [], deny: [] });

  useEffect(() => {
    apiClient.get<Array<{ _id: string; name: string; type: 'FACTORY' | 'ARTISAN'; isActive: boolean }>>('/job-workers')
      .then(r => setParties(r.data.filter(p => p.isActive).map(p => ({ id: p._id, name: p.name, type: p.type }))))
      .catch(() => setParties([]));
    settingsApi.listRoles().then(setRoleDefs).catch(() => setRoleDefs([]));
  }, []);

  const roleGrants = (roleLabel: string, perm: string) =>
    roleDefs.find(r => r.key === BACKEND_ROLE_KEY[roleLabel])?.permissions.includes(perm) ?? false;

  useEffect(() => {
    if (isEditing && id) {
      usersApi.get(id)
        .then(u => {
          const ov = u.permissionOverrides ?? { allow: [], deny: [] };
          setOverrides({ allow: ov.allow ?? [], deny: ov.deny ?? [] });
          setForm({
            name: u.displayName ?? '',
            username: u.username,
            email: u.email ?? '',
            phone: u.mobile ?? '',
            role: ROLE_KEY_LABEL[u.roleKeys[0]] ?? 'Production',
            partyId: u.jobWorkerId ?? '',
            status: u.isActive ? 'Active' : 'Inactive',
            newPassword: '',
            confirmPassword: '',
            canViewAmounts: false,
          });
        })
        .catch(err => setSaveError(apiErrorMessage(err, 'Could not load this user.')))
        .finally(() => setIsLoading(false));
    }
  }, [isEditing, id]);

  useEffect(() => {
    if (!isEditing || isLoading || roleDefs.length === 0) return;
    const perm = BACKEND_AMOUNT_PERMISSION_BY_ROLE[form.role];
    if (!perm) return;
    const effective = (roleGrants(form.role, perm) || overrides.allow.includes(perm)) && !overrides.deny.includes(perm);
    setForm(f => ({ ...f, canViewAmounts: effective }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, isLoading, roleDefs, overrides]);

  const isExternal = form.role === 'Factory User' || form.role === 'Artisan User';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const requiresStepUp = form.role === 'Super Admin' || form.canViewAmounts;

  /** New allow/deny lists: keep unrelated overrides, set the department-amount one relative to the role. */
  const nextOverrides = () => {
    const amountPerms = Object.values(BACKEND_AMOUNT_PERMISSION_BY_ROLE);
    const allow = overrides.allow.filter(p => !amountPerms.includes(p));
    const deny = overrides.deny.filter(p => !amountPerms.includes(p));
    const perm = BACKEND_AMOUNT_PERMISSION_BY_ROLE[form.role];
    if (perm) {
      const roleHas = roleGrants(form.role, perm);
      if (form.canViewAmounts && !roleHas) allow.push(perm);
      if (!form.canViewAmounts && roleHas) deny.push(perm);
    }
    return { allow, deny };
  };

  const performSave = async () => {
    setIsSaving(true);
    setSaveError('');
    try {
      if (isExternal && !form.partyId) {
        setSaveError('Select the factory / artisan this login belongs to.');
        return;
      }
      const ov = nextOverrides();
      if (isEditing && id) {
        await usersApi.update(id, {
          displayName: form.name || undefined,
          email: form.email || undefined,
          mobile: form.phone || undefined,
        });
        await usersApi.setRoles(id, [BACKEND_ROLE_KEY[form.role]]);
        await usersApi.setActive(id, form.status === 'Active');
        if (form.newPassword) {
          await usersApi.resetPassword(id, form.newPassword);
        }
        await usersApi.setPermissionOverrides(id, ov.allow, ov.deny);
      } else {
        const created = await usersApi.create({
          username: form.username,
          displayName: form.name || undefined,
          email: form.email || undefined,
          mobile: form.phone || undefined,
          password: form.newPassword,
          principal: isExternal ? 'party' : 'internal',
          jobWorkerId: isExternal ? form.partyId : undefined,
          roleKeys: [BACKEND_ROLE_KEY[form.role]],
        });
        if (ov.allow.length || ov.deny.length) {
          await usersApi.setPermissionOverrides(created._id, ov.allow, ov.deny);
        }
        if (form.status === 'Inactive') await usersApi.setActive(created._id, false);
      }
      navigate('/admin/users');
    } catch (err) {
      setSaveError(apiErrorMessage(err, 'Could not save this user.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // On create the password is required; on edit it's optional ("leave blank to keep
    // current") but must still be validated whenever the admin actually typed one in.
    const touchingPassword = !isEditing || form.newPassword.length > 0 || form.confirmPassword.length > 0;
    if (touchingPassword && form.newPassword !== form.confirmPassword) {
      setPwError('Passwords do not match');
      return;
    }
    if (touchingPassword && form.newPassword.length < 8) {
      setPwError('Password must be at least 8 characters');
      return;
    }
    setPwError('');
    if (requiresStepUp) {
      setStepUpOpen(true);
      return;
    }
    performSave();
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-2 md:gap-3">
        <button onClick={() => navigate('/admin/users')} className="shrink-0 flex items-center justify-center w-10 h-10 -ml-2 rounded-lg text-slate-400 hover:text-slate-600" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold">{isEditing ? 'Edit User' : 'New User'}</h1>
          <p className="text-sm text-slate-500">Create internal staff or link an external factory / artisan account</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Identity */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <UserCog size={15} className="text-[#E40043]" /> User Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name <span className="text-red-500">*</span></label>
              <input type="text" name="name" value={form.name} onChange={handleChange} required
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username / Mobile <span className="text-red-500">*</span></label>
              <input type="text" name="username" value={form.username} onChange={handleChange} required readOnly={isEditing}
                placeholder="e.g. rpatel or 9876543210"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#E40043]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" name="email" value={form.email} onChange={handleChange}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input type="text" name="phone" value={form.phone} onChange={handleChange}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043]" />
            </div>
          </div>
        </div>

        {/* Role & Party */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Role & Access</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Role <span className="text-red-500">*</span></label>
              <select name="role" value={form.role} onChange={handleChange} required
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043]">
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {isExternal && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Factory / Artisan Party <span className="text-red-500">*</span></label>
                <select name="partyId" value={form.partyId} onChange={handleChange} required={isExternal}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043]">
                  <option value="">Select party</option>
                  {parties
                    .filter(p => (form.role === 'Artisan User' ? p.type === 'ARTISAN' : p.type === 'FACTORY'))
                    .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select name="status" value={form.status} onChange={handleChange}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043]">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive (deactivate — never delete)</option>
              </select>
            </div>
          </div>
          {isExternal && (
            <p className="text-xs text-slate-400 mt-3">
              External users are party-scoped (AUTH-06). They can only see their own party's jobs and material.
            </p>
          )}
          {BACKEND_AMOUNT_PERMISSION_BY_ROLE[form.role] && (
            <label className="flex items-start gap-2 mt-4 pt-4 border-t border-slate-100 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5" checked={form.canViewAmounts}
                onChange={e => setForm(f => ({ ...f, canViewAmounts: e.target.checked }))} />
              <span>
                <span className="font-medium">Department Admin clearance</span> — can see {AMOUNT_LABEL[form.role]}
                {roleGrants(form.role, BACKEND_AMOUNT_PERMISSION_BY_ROLE[form.role]) ? ' (included in the role by default; untick to withhold it from this user)' : ' (not in the role by default; tick to grant it to this user)'}.
              </span>
            </label>
          )}
          {requiresStepUp && (
            <div className="flex items-start gap-2 mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" />
              This grants elevated access — you'll be asked to confirm your own password before it's saved.
            </div>
          )}
        </div>

        {/* Password */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">
            {isEditing ? 'Reset Password (leave blank to keep current)' : 'Set Password'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {isEditing ? 'New Password' : 'Password'} {!isEditing && <span className="text-red-500">*</span>}
              </label>
              <input type="password" name="newPassword" value={form.newPassword} onChange={handleChange}
                required={!isEditing} minLength={8} placeholder="Min 8 characters"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Confirm Password {!isEditing && <span className="text-red-500">*</span>}
              </label>
              <input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange}
                required={!isEditing}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043]" />
            </div>
          </div>
          {pwError && <p className="text-xs text-red-600 mt-2">{pwError}</p>}
        </div>

        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{saveError}</div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
          <button type="submit" disabled={isSaving}
            className="w-full sm:w-auto px-6 py-2.5 md:py-2 bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] text-sm font-medium disabled:opacity-60">
            {isSaving ? 'Saving…' : isEditing ? 'Update User' : 'Create User'}
          </button>
          <button type="button" onClick={() => navigate('/admin/users')}
            className="w-full sm:w-auto px-6 py-2.5 md:py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm">
            Cancel
          </button>
        </div>
      </form>

      <StepUpPasswordDialog
        open={stepUpOpen}
        title="Confirm Elevated Access"
        message={
          form.role === 'Super Admin'
            ? `You're about to make "${form.name || 'this user'}" a Super Admin, with full access to every department and all financial data.`
            : `You're about to grant "${form.name || 'this user'}" Department Admin clearance to view and enter ${form.role} pricing and amounts.`
        }
        onCancel={() => setStepUpOpen(false)}
        onConfirm={() => { setStepUpOpen(false); performSave(); }}
      />
    </div>
  );
}
