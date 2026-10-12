import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { usersApi, roleLabel, type UserRecord } from '../../../lib/api/users';
import { STAGGER_CHILDREN, EmptyState } from '../../pageKit';

type UserRow = UserRecord & { id: string; name: string; role: string; status: 'Active' | 'Inactive' };

export function UserList() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    usersApi.list()
      .then(list => setUsers(list.map(u => ({
        ...u,
        id: u._id,
        name: u.displayName || u.username,
        role: roleLabel(u.roleKeys),
        status: u.isActive ? 'Active' : 'Inactive',
      }))))
      .catch(() => setLoadError('Could not load users from the server.'))
      .finally(() => setIsLoading(false));
  }, []);

  const roles = Array.from(new Set(users.map(u => u.role)));

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter ? u.role === roleFilter : true;
    const matchStatus = statusFilter ? u.status === statusFilter : true;
    return matchSearch && matchRole && matchStatus;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">User Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create and manage internal and external (factory/artisan) users</p>
        </div>
        <button
          onClick={() => navigate('/admin/users/new')}
          className="flex items-center justify-center gap-2 w-full sm:w-auto shrink-0 px-4 py-2.5 md:py-2 bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] text-sm font-medium"
        >
          <Plus size={16} /> New User
        </button>
      </div>

      {loadError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{loadError}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 p-3 md:p-4 border-b border-slate-100">
          <input
            type="text" placeholder="Search by name, username, or party…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043]"
          />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043]">
            <option value="">All Roles</option>
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043]">
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2 p-3">{[1, 2, 3].map(i => <div key={i} className="skeleton rounded-lg h-16" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} message="No users found." className="border-0" />
        ) : (
          <>
          <div className={`md:hidden flex flex-col gap-2 p-3 ${STAGGER_CHILDREN}`}>
            {filtered.map(u => (
              <div key={u.id} className="flex flex-col gap-2 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm break-words">{u.name}</p>
                    <p className="font-mono text-xs text-slate-600 break-all">{u.username}</p>
                  </div>
                  <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    u.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {u.status}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium transition-colors min-w-0 ${
                    u.role === 'Super Admin' ? 'bg-purple-100 text-purple-700' :
                    u.role.includes('User') ? 'bg-amber-100 text-amber-700' :
                    'bg-[#FFDCE5] text-[#B80037]'
                  }`}>
                    {u.role}
                  </span>
                  <button onClick={() => navigate(`/admin/users/${u.id}`)}
                    className="shrink-0 px-3 py-2 text-[#E40043] hover:underline text-sm font-medium">
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {['Name', 'Username', 'Role', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium">{u.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{u.username}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                        u.role === 'Super Admin' ? 'bg-purple-100 text-purple-700' :
                        u.role.includes('User') ? 'bg-amber-100 text-amber-700' :
                        'bg-[#FFDCE5] text-[#B80037]'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                        u.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => navigate(`/admin/users/${u.id}`)}
                        className="text-[#E40043] hover:underline text-xs">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
