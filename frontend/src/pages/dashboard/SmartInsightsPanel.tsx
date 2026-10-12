import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, TrendingUp, AlertTriangle, Users, Factory, Package } from 'lucide-react';
import { alertsApi, apiErrorMessage, type InsightItem } from '../../lib/api/insights';

const ICONS: Record<InsightItem['icon'], React.ReactNode> = {
  trend: <TrendingUp size={15} className="text-green-600" />,
  alert: <AlertTriangle size={15} className="text-amber-500" />,
  users: <Users size={15} className="text-[#E40043]" />,
  factory: <Factory size={15} className="text-amber-600" />,
  stock: <Package size={15} className="text-slate-500" />,
};

/**
 * Rule-based insights computed by the backend (GET /insights) from this business's own data
 * on every load — no external AI model, and nothing here is hard-coded: an insight only shows
 * when the data supports it, and only for data the signed-in user is allowed to see.
 */
export function SmartInsightsPanel() {
  const navigate = useNavigate();
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    alertsApi.insights()
      .then(items => { if (active) setInsights(items); })
      .catch(err => { if (active) setError(apiErrorMessage(err, 'Could not load insights.')); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  if (!isLoading && !error && insights.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles size={16} className="text-[#E40043]" />
        <h3 className="text-sm font-semibold text-slate-700">Smart Insights</h3>
        <span className="text-[10px] text-slate-400 ml-auto">Generated from your live data</span>
      </div>
      {isLoading ? (
        <div className="flex flex-col gap-2 animate-pulse">
          {[1, 2].map(i => <div key={i} className="h-9 rounded-lg bg-slate-100" />)}
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {insights.map(ins => (
            <button
              key={ins.id}
              type="button"
              onClick={() => ins.link && navigate(ins.link)}
              className={`text-left flex items-start gap-2 text-sm px-3 py-2 rounded-lg ${
                ins.tone === 'warning' ? 'bg-amber-50 text-amber-800' : ins.tone === 'positive' ? 'bg-green-50 text-green-800' : 'bg-slate-50 text-slate-700'
              }`}
            >
              <span className="mt-0.5 shrink-0">{ICONS[ins.icon]}</span>
              <span className="break-words">{ins.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
