import { AdminDashboard } from './dashboard/AdminDashboard';
import { PurchaseDashboard } from './dashboard/PurchaseDashboard';
import { RawMaterialDashboard } from './dashboard/RawMaterialDashboard';
import { DesignDashboard } from './dashboard/DesignDashboard';
import { ProductionDashboard } from './dashboard/ProductionDashboard';
import { PackingDashboardHome } from './dashboard/PackingDashboardHome';
import { SalesDashboard } from './dashboard/SalesDashboard';
import { SmartInsightsPanel } from './dashboard/SmartInsightsPanel';
import { useAuth } from '../lib/auth/AuthContext';
import { usePermission } from '../lib/permissions/usePermission';
import type { Role } from '../lib/permissions/permissions';

/** Each dashboard and the backend permission that opens its API (DSH-01). */
const DASHBOARDS: Array<{ role: Role; code: string; component: () => React.ReactElement }> = [
  { role: 'super_admin', code: 'dashboard.admin.view', component: AdminDashboard },
  { role: 'purchase', code: 'dashboard.purchase.view', component: PurchaseDashboard },
  { role: 'inventory', code: 'dashboard.raw_material.view', component: RawMaterialDashboard },
  { role: 'design', code: 'dashboard.design.view', component: DesignDashboard },
  { role: 'production', code: 'production.view', component: ProductionDashboard },
  { role: 'packing', code: 'dashboard.packing.view', component: PackingDashboardHome },
  { role: 'sales', code: 'dashboard.sales.view', component: SalesDashboard },
];

/**
 * DSH-01 — one dashboard per department (frontend.md §11). Picks the user's own department
 * dashboard when they hold its permission, otherwise the first dashboard they are allowed to
 * open, so a custom role never lands on a page whose API would refuse it.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const { hasCode } = usePermission();
  if (!user) return null;
  const own = DASHBOARDS.find(d => d.role === user.role && hasCode(d.code));
  const chosen = own ?? DASHBOARDS.find(d => hasCode(d.code));
  if (!chosen) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Welcome, {user.name}</h1>
          <p className="text-muted">Use the menu to open the sections you have access to.</p>
        </div>
        <SmartInsightsPanel />
      </div>
    );
  }
  const DashboardComponent = chosen.component;
  return <DashboardComponent />;
}
