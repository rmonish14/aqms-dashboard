import { useState, useEffect } from "react";
import { API_URL } from "./lib/config";
import { io } from "socket.io-client";
import Dashboard from "./components/Dashboard";
import InfoPage from "./components/InfoPage";
import DiagnosticsPage from "./components/DiagnosticsPage";
import SettingsPage from "./components/SettingsPage";
import AnalyticsPage from "./components/AnalyticsPage";
import MapPage from "./components/MapPage";
import NotificationsPanel from "./components/NotificationsPanel";
import WorkersPage from "./components/WorkersPage";
import DatabasePage from "./components/DatabasePage";
import PredictivePage from "./components/PredictivePage";
import MaintenanceModal, { downloadMaintenanceCSV } from "./components/MaintenanceModal";
import AuthPage from "./components/AuthPage";
import type { SessionPayload } from "./components/AuthPage";
import AIChatBot from "./components/AIChatBot";
import type { MaintenanceTask } from "./components/MaintenanceModal";
import type { SystemAlert } from "./components/AlertFeed";
import type { DashboardContext, AIAction } from "./components/AIChatBot";
import {
  LayoutDashboard, Settings, Info, Activity,
  Sun, Moon, Map, BarChart3, Wind, Bell, Download, Users, LogOut, Database, BrainCircuit
} from "lucide-react";
import { cn } from "./lib/utils";

const NAV_ITEMS = [
  { id: "dashboard",   label: "Overview",    icon: LayoutDashboard },
  { id: "map",         label: "Live Topology", icon: Map             },
  { id: "workers",     label: "Maintenance & Repairs",icon: Users    },
  { id: "analytics",  label: "Data Warehouse", icon: BarChart3       },
  { id: "predictive",  label: "Predictive AI", icon: BrainCircuit    },
  { id: "database",    label: "Database",      icon: Database        },
  { id: "diagnostics",label: "Diagnostics",    icon: Activity        },
  { id: "info",        label: "System Matrix", icon: Info            },
  { id: "settings",   label: "Configuration",  icon: Settings        },
];

export default function App() {
  const [activeTab,  setActiveTab]  = useState("dashboard");
  const [isDarkMode, setIsDarkMode] = useState(true);

  // ── Session state ─────────────────────────────────────────────────────────
  const [session, setSession] = useState<SessionPayload | null>(() => {
    try {
      const stored = localStorage.getItem("aqms_session");
      if (stored) return JSON.parse(stored);
    } catch {}
    return null;
  });

  useEffect(() => {
    if (session) {
      localStorage.setItem("aqms_session", JSON.stringify(session));
    } else {
      localStorage.removeItem("aqms_session");
    }
  }, [session]);

  // ── Global alert state ────────────────────────────────────────────────────
  const [alerts,  setAlerts]  = useState<SystemAlert[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // ── Live nodes data (lifted for AI context) ───────────────────────────────
  const [liveNodes,  setLiveNodes]  = useState<Record<string, any>>({});
  const [liveStatus, setLiveStatus] = useState<Record<string, any>>({});

  // ── Alert thresholds (shared with AI + SettingsPage) ─────────────────────
  const [thresholds, setThresholds] = useState({ vib: 5.0, temp: 60, hum: 50, current: 20 });
  const [alertEmail, setAlertEmail] = useState('');

  // ── Sync Settings with Backend ────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/config`)
      .then(res => res.json())
      .then(data => {
        if (data.thresholds) {
          setThresholds(data.thresholds);
        }
        if (data.alertEmail) {
          setAlertEmail(data.alertEmail);
        }
      })
      .catch(err => console.error('Failed to load config', err));
  }, []);

  const handleConfigChange = async (updates: { thresholds?: any, alertEmail?: string }) => {
    if (updates.thresholds) setThresholds(updates.thresholds);
    if (updates.alertEmail !== undefined) setAlertEmail(updates.alertEmail);
    
    try {
      await fetch(`${API_URL}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (err) {
      console.error('Failed to save config', err);
    }
  };

  // ── Notification panel ────────────────────────────────────────────────────
  const [showNotif, setShowNotif] = useState(false);

  // ── Maintenance tasks (persisted to localStorage) ─────────────────────────
  const [maintenance, setMaintenance] = useState<MaintenanceTask[]>(() => {
    try { return JSON.parse(localStorage.getItem("aqms-maintenance") ?? "[]"); }
    catch { return []; }
  });
  const [scheduleAlert, setScheduleAlert] = useState<SystemAlert | null>(null);

  useEffect(() => {
    localStorage.setItem("aqms-maintenance", JSON.stringify(maintenance));
  }, [maintenance]);

  // ── Global socket (for bell badge & AI context) ───────────────────────────
  useEffect(() => {
    const socket = io(API_URL, {
      reconnectionAttempts: Infinity,  // never stop retrying
      timeout: 3000,
    });

    socket.on("node_data", (data: any) => {
      setLiveNodes(prev => {
        const isTransitioning = Object.keys(prev).some(k => k.startsWith('machine-'));
        const base = isTransitioning ? {} : prev;
        return {
          ...base,
          [data.nodeId]: {
          nodeId:      data.nodeId,
          vib:         data.vib         ?? 0,
          temp:        data.temp        ?? 0,
          hum:         data.hum         ?? 0,
          current:     data.current     ?? 0,
          lat:         data.lat,
          long:        data.long,
          relay:       data.relay,       // 'ON' | 'OFF' from ESP firmware
          ml_status:   data.ml_status,
          timestamp:   data.timestamp,
        }
      };
      });
      // Auto-mark node as online when data arrives
      setLiveStatus(prev => ({ ...prev, [data.nodeId]: { status: "online" } }));
    });

    socket.on("node_status", (data: any) => {
      setLiveStatus(prev => ({ ...prev, [data.nodeId]: data }));
    });

    socket.on("new_alert", (alert: SystemAlert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 100));
    });

    socket.on("connect_error", () => {
      // Seed mock data for AI context when backend is unreachable
      if (Object.keys(liveNodes).length === 0) {
        setLiveNodes({
          "machine-alpha": { nodeId: "machine-alpha", vib: 2.1, temp: 45, hum: 40, current: 15.2 },
          "machine-beta":  { nodeId: "machine-beta",  vib: 6.5, temp: 72, hum: 48, current: 22.4 },
          "machine-gamma": { nodeId: "machine-gamma", vib: 1.2, temp: 38, hum: 35, current: 12.1 },
          "spares-01":     { nodeId: "spares-01",     vib: 0.5, temp: 25, hum: 30, current: 0.5  },
          "spares-02":     { nodeId: "spares-02",     vib: 4.8, temp: 58, hum: 45, current: 19.8 },
        });
        setLiveStatus({
          "machine-alpha": { status: "online"  },
          "machine-beta":  { status: "online"  },
          "machine-gamma": { status: "offline" },
          "spares-01":     { status: "online" },
          "spares-02":     { status: "online" },
        });
        setAlerts(prev => prev.length === 0 ? [
          { id: "1", nodeId: "machine-beta", message: "Vibration elevated above 5 mm/s — predictive maintenance recommended.", severity: "warning",  timestamp: new Date().toISOString() },
          { id: "2", nodeId: "machine-gamma", message: "Node offline — no heartbeat received for >5 minutes.",          severity: "critical", timestamp: new Date(Date.now() - 300000).toISOString() },
          { id: "3", nodeId: "machine-alpha",  message: "Current draw within safe operational range.",                            severity: "info",     timestamp: new Date(Date.now() - 60000).toISOString() },
        ] : prev);
      }
    });

    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  // ── Build AI context object ───────────────────────────────────────────────
  const aiContext: DashboardContext = {
    nodes:      liveNodes,
    status:     liveStatus,
    alerts,
    thresholds,
  };

  // ── Handle AI-issued actions ──────────────────────────────────────────────
  const handleAIAction = (action: AIAction) => {
    if (action.type === "SET_THRESHOLD") {
      handleConfigChange({ thresholds: { ...thresholds, [action.metric]: action.value } });
    }
  };

  const unreadCount = alerts.filter(a => !readIds.has(a.id)).length;

  const handleSaveMaintenance = (task: MaintenanceTask) => {
    setMaintenance(prev => { const w = prev.filter(m => m.id !== task.id); return [...w, task]; });
  };

  const handleMarkRead = (ids: string[]) => {
    setReadIds(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
  };

  if (!session) {
    return <AuthPage onLogin={setSession} />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground antialiased">

      {/* ── Sidebar ── */}
      <aside className="flex flex-col w-64 shrink-0 border-r border-border bg-card transition-colors duration-300">
        <div className="flex items-center gap-3 px-6 h-16 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Wind className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="leading-none">
            <p className="text-sm font-semibold text-foreground tracking-tight">PLMS</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Predictive Life Monitoring</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-3 mt-1">Navigation</p>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                activeTab === item.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-border space-y-2">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {isDarkMode ? "Light Mode" : "Dark Mode"}
          </button>

          <div className="flex items-center justify-between px-3 py-2.5 group hover:bg-secondary/50 rounded-xl transition-all mb-1 mx-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-primary uppercase">{session.username.substring(0, 2)}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground leading-none truncate capitalize">{session.username}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 font-mono uppercase truncate">{session.role}</p>
              </div>
            </div>
            
            <button 
              onClick={() => setSession(null)}
              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background">

        {/* Top header bar */}
        <div className="h-16 shrink-0 border-b border-border flex items-center justify-between px-8 bg-card">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {NAV_ITEMS.find(n => n.id === activeTab)?.label}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Predictive Life Monitoring System · Machine Health Dashboard
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="status-badge bg-primary/10 text-primary border-primary/20">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              System Operational
            </div>

            {maintenance.length > 0 && (
              <button
                onClick={() => downloadMaintenanceCSV(maintenance)}
                title="Download maintenance schedule CSV"
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground bg-secondary hover:text-foreground border border-border rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Schedule ({maintenance.length})
              </button>
            )}

            {/* 🔔 Bell */}
            <button
              onClick={() => setShowNotif(true)}
              className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
              title="View notifications"
            >
              <Bell className={cn("w-5 h-5 transition-colors", unreadCount > 0 ? "text-foreground" : "text-muted-foreground")} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-destructive text-white text-[9px] font-bold rounded-full flex items-center justify-center tabular-nums">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Page */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "dashboard"   && (
            <Dashboard
              globalAlerts={alerts}
              onAlertsChange={setAlerts}
              onNodesChange={setLiveNodes}
              onStatusChange={setLiveStatus}
              thresholds={thresholds}
            />
          )}
          {activeTab === "map"         && <MapPage liveNodes={liveNodes} liveStatus={liveStatus} />}
          {activeTab === "workers"     && <WorkersPage />}
          {activeTab === "analytics"   && <AnalyticsPage />}
          {activeTab === "predictive"  && <PredictivePage />}
          {activeTab === "database"    && <DatabasePage />}
          {activeTab === "diagnostics" && <DiagnosticsPage />}
          {activeTab === "info"        && <InfoPage />}
          {activeTab === "settings"    && <SettingsPage thresholds={thresholds} alertEmail={alertEmail} onConfigChange={handleConfigChange} />}
        </div>
      </main>

      {/* ── Notification Panel ── */}
      {showNotif && (
        <NotificationsPanel
          alerts={alerts}
          maintenance={maintenance}
          onClose={() => { setShowNotif(false); handleMarkRead(alerts.map(a => a.id)); }}
          onSchedule={(alert) => { setShowNotif(false); setScheduleAlert(alert); }}
          onMarkRead={handleMarkRead}
        />
      )}

      {/* ── Maintenance Modal ── */}
      {scheduleAlert && (
        <MaintenanceModal
          alert={scheduleAlert}
          existing={maintenance.find(m => m.alertId === scheduleAlert.id)}
          onSave={handleSaveMaintenance}
          onClose={() => { setScheduleAlert(null); setShowNotif(true); }}
        />
      )}

      {/* ── 🤖 Floating AI Chatbot ── */}
      <AIChatBot context={aiContext} onAction={handleAIAction} />
    </div>
  );
}
