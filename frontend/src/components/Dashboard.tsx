import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import NodeCard from './NodeCard';
import type { SystemAlert } from './AlertFeed';
import { Radio, AlertTriangle, MonitorPlay, TrendingUp, Thermometer, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';
import { API_URL } from '../lib/config';

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

export default function Dashboard({
  globalAlerts,
  onAlertsChange,
  onNodesChange,
  onStatusChange,
  thresholds: _thresholds,
}: {
  globalAlerts?: SystemAlert[];
  onAlertsChange?: (alerts: SystemAlert[]) => void;
  onNodesChange?: (nodes: Record<string, any>) => void;
  onStatusChange?: (status: Record<string, any>) => void;
  thresholds?: { vib: number; temp: number; hum: number; current: number };
}) {
  const [nodesData, setNodesData]       = useState<Record<string, any>>({});
  const [nodesStatus, setNodesStatus]   = useState<Record<string, any>>({});
  const [nodesHistory, setNodesHistory] = useState<Record<string, any[]>>({});
  const [alerts, setAlerts]             = useState<SystemAlert[]>([]);
  const [isMockMode, setIsMockMode]     = useState(false);

  useEffect(() => {
    const socket = io(API_URL, {
      reconnectionAttempts: Infinity,  // keep retrying — don't lock into mock mode permanently
      timeout:            3000,
    });

    socket.on('node_data', (data) => {
      setIsMockMode(false);

      // ── Stop the mock engine the moment real data arrives ──────────────────
      if (mockInterval) {
        clearInterval(mockInterval);
        (mockInterval as any) = null;
      }

      const formattedData = {
        nodeId:      data.nodeId,
        vib:         data.vib         ?? 0,
        temp:        data.temp        ?? 0,
        hum:         data.hum         ?? 0,
        current:     data.current     ?? 0,
        lat:         data.lat,
        long:        data.long,
        relay:       data.relay,        // 'ON' | 'OFF' — synced from ESP firmware
        mode:        data.mode,         // 'AUTO' | 'MANUAL' — synced from ESP firmware
        air_status:  data.air_status,   // ML classification label from ESP
        timestamp:   data.timestamp,
      };

      setNodesData(prev => {
        const isTransitioning = Object.keys(prev).some(k => k.startsWith('machine-'));
        const base = isTransitioning ? {} : prev;
        const next = { ...base, [formattedData.nodeId]: formattedData };
        return next;
      });
      setNodesStatus(prev => {
        const isTransitioning = Object.keys(prev).some(k => k.startsWith('machine-'));
        const base = isTransitioning ? {} : prev;
        const next = { ...base, [formattedData.nodeId]: { status: 'online' } };
        return next;
      });
      setNodesHistory(prev => {
        const isTransitioning = Object.keys(prev).some(k => k.startsWith('machine-'));
        const base = isTransitioning ? {} : prev;
        const hist = base[formattedData.nodeId] || [];
        return { ...base, [formattedData.nodeId]: [...hist.slice(-19), formattedData] };
      });
    });

    socket.on('node_status', (data) => {
      setNodesStatus(prev => {
        const next = { ...prev, [data.nodeId]: data };
        return next;
      });
    });

    socket.on('new_alert', (alert: SystemAlert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 50));
      onAlertsChange?.([alert, ...(globalAlerts || [])].slice(0, 100));
    });

    let mockInterval: ReturnType<typeof setInterval>;

    socket.on('connect_error', () => {
      if (Object.keys(nodesData).length === 0) startMockEngine();
    });

    const startMockEngine = () => {
      setIsMockMode(true);

      setNodesStatus({
        'alpha-001': { nodeId: 'alpha-001', status: 'online' },
        'beta-002':  { nodeId: 'beta-002',  status: 'online' },
        'gamma-003': { nodeId: 'gamma-003', status: 'offline' },
      });

      setAlerts([
        { id: '1', nodeId: 'machine-alpha', message: 'Vibration elevated above 5 mm/s — moderate health warning.', severity: 'warning', timestamp: new Date().toISOString() },
        { id: '2', nodeId: 'machine-gamma', message: 'Node offline — no heartbeat received for >5 minutes.', severity: 'critical', timestamp: new Date(Date.now() - 300000).toISOString() },
        { id: '3', nodeId: 'machine-beta', message: 'Current within safe operational range.', severity: 'info', timestamp: new Date(Date.now() - 60000).toISOString() },
      ]);

      let alpha = { vib: 2.1, temp: 45, hum: 40, current: 15.2 };
      let beta  = { vib: 6.5, temp: 72, hum: 48, current: 22.4 };
      const gamma = { vib: 1.2, temp: 38, hum: 35, current: 12.1 };

      const ts = () => new Date().toISOString();

      const pushHistory = (nodeId: string, d: any) =>
        setNodesHistory(prev => {
          const h = prev[nodeId] || [];
          return { ...prev, [nodeId]: [...h.slice(-19), { ...d, nodeId, timestamp: ts() }] };
        });

      // Prime history
      Array.from({ length: 20 }).forEach(() => { pushHistory('alpha-001', alpha); pushHistory('beta-002', beta); });

      mockInterval = setInterval(() => {
        alpha = {
          ...alpha,
          vib: Math.max(0, +(alpha.vib + (Math.random() * 0.4 - 0.2)).toFixed(1)),
          temp: Math.max(20, Math.min(100, alpha.temp + Math.floor(Math.random() * 4 - 2))),
          hum: Math.max(0, Math.min(100, alpha.hum + Math.floor(Math.random() * 4 - 2))),
          current: Math.max(0, +(alpha.current + (Math.random() * 2 - 1)).toFixed(1)),
        };
        beta = {
          ...beta,
          vib: Math.max(0, +(beta.vib + (Math.random() * 0.4 - 0.2)).toFixed(1)),
          current: Math.max(0, +(beta.current + (Math.random() * 2 - 1)).toFixed(1)),
        };

        const alphaNode = { nodeId: 'machine-alpha', timestamp: ts(), ...alpha };
        const betaNode  = { nodeId: 'machine-beta',  timestamp: ts(), ...beta  };
        const gammaNode = { nodeId: 'machine-gamma', timestamp: new Date(Date.now() - 360000).toISOString(), ...gamma };

        setNodesData({ 'machine-alpha': alphaNode, 'machine-beta': betaNode, 'machine-gamma': gammaNode });
        pushHistory('machine-alpha', alpha);
        pushHistory('machine-beta', beta);
      }, 3000);
    };

    return () => { socket.disconnect(); if (mockInterval) clearInterval(mockInterval); };
  }, []);

  const outdoorNodesData = Object.fromEntries(Object.entries(nodesData).filter(([id]) => !id.startsWith('worker_')));
  const nodeKeys        = Object.keys(outdoorNodesData);
  const connectedNodes  = Object.values(nodesStatus).filter(n => n.status !== 'offline' && !n.nodeId?.startsWith('worker_')).length;
  const totalNodes      = Math.max(connectedNodes, nodeKeys.length);
  const avgVib          = nodeKeys.length > 0
    ? (Object.values(outdoorNodesData).reduce((s, n) => s + (n.vib || 0), 0) / nodeKeys.length).toFixed(1)
    : '--';
  const avgTemp         = nodeKeys.length > 0
    ? (Object.values(outdoorNodesData).reduce((s, n) => s + (n.temp || 0), 0) / nodeKeys.length).toFixed(1)
    : '--';
  const criticalAlerts  = alerts.filter(a => a.severity === 'critical').length;

  const getHealthLabel = (v: number) =>
    v <= 2  ? 'Healthy'      :
    v <= 5  ? 'Normal'  :
    v <= 8  ? 'Warning' :
    v <= 15 ? 'Critical' : 'Failing';


  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* ── Main panel ── */}
      <div className="flex-1 flex flex-col overflow-y-auto bg-background/50">
        <div className="max-w-[1600px] w-full mx-auto flex flex-col min-h-full">

        {/* Mock mode banner */}
        {isMockMode && (
          <div className="shrink-0 bg-yellow-500/10 border-b border-yellow-500/20 px-8 py-2.5 flex items-center gap-2.5">
            <MonitorPlay className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <p className="text-xs font-medium text-yellow-700 dark:text-yellow-300">
              Demo Mode — Simulated sensor data. Connect the backend to receive live telemetry.
            </p>
          </div>
        )}

        {/* KPI Strip */}
        <div className="shrink-0 px-8 pt-6 pb-4">
          <motion.div 
            initial="hidden" animate="visible" variants={containerVariants}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          >

            <KpiCard
              label="Active Nodes"
              value={`${connectedNodes} / ${totalNodes}`}
              icon={<Radio className="w-4 h-4" />}
              accent="primary"
            />
            <KpiCard
              label="Fleet Avg Vibration"
              value={avgVib !== '--' ? `${avgVib} mm/s` : '--'}
              sub={avgVib !== '--' ? getHealthLabel(parseFloat(avgVib)) : undefined}
              icon={<Activity className="w-4 h-4" />}
              accent={parseFloat(avgVib as string) > 8 ? 'destructive' : 'primary'}
            />
            <KpiCard
              label="Avg Temperature"
              value={avgTemp !== '--' ? `${avgTemp} °C` : '--'}
              icon={<Thermometer className="w-4 h-4" />}
              accent="primary"
            />
            <KpiCard
              label="Active Alerts"
              value={criticalAlerts.toString()}
              sub={criticalAlerts > 0 ? 'Require attention' : 'All clear'}
              icon={<AlertTriangle className="w-4 h-4" />}
              accent={criticalAlerts > 0 ? 'destructive' : 'primary'}
            />
          </motion.div>
        </div>

        {/* Section header */}
        <div className="px-8 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Sensor Nodes</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{nodeKeys.length} device{nodeKeys.length !== 1 ? 's' : ''} detected on network</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="w-3.5 h-3.5" />
            Updates every 3s
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 px-8 pb-8">
          <motion.div
            initial="hidden" animate="visible" variants={containerVariants}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            
            {/* Real Nodes */}
            {Object.entries(outdoorNodesData).map(([nodeId, data]) => (
              <NodeCard
                key={nodeId}
                data={data}
                status={nodesStatus[nodeId] || { status: 'online' }}
                history={nodesHistory[nodeId] || []}
              />
            ))}

            {/* Dummy Padding (If NO real nodes connected) */}
            {nodeKeys.length === 0 && (
              <motion.div variants={itemVariants} className="relative group">
                <div className="absolute -top-3 left-4 z-10 bg-yellow-500 text-yellow-950 text-[10px] font-bold px-3 py-1 rounded-full shadow-md border border-yellow-600 uppercase tracking-wider flex items-center gap-1.5 opacity-90">
                  <MonitorPlay className="w-3.5 h-3.5" /> Dummy Data View
                </div>
                <div className="pointer-events-none opacity-80 ring-2 ring-yellow-500/50 rounded-xl relative">
                  <NodeCard
                    data={{
                      nodeId: 'virtual-demo-01',
                      vib: 1.5, temp: 35, hum: 40, current: 10.5,
                      timestamp: new Date().toISOString()
                    }}
                    status={{ status: 'online' }}
                    history={[]}
                  />
                  <div className="absolute inset-0 bg-background/10 backdrop-blur-[1px] rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="bg-card text-foreground text-xs font-semibold px-4 py-2 rounded-lg shadow-xl border border-border">Preview Only — Waiting for Hardware</p>
                  </div>
                </div>
              </motion.div>
            )}

            {nodeKeys.length === 0 && (
              <motion.div variants={itemVariants} className="relative group hidden md:block">
                <div className="absolute -top-3 left-4 z-10 bg-yellow-500 text-yellow-950 text-[10px] font-bold px-3 py-1 rounded-full shadow-md border border-yellow-600 uppercase tracking-wider flex items-center gap-1.5 opacity-90">
                  <MonitorPlay className="w-3.5 h-3.5" /> Dummy Data View
                </div>
                <div className="pointer-events-none opacity-80 ring-2 ring-yellow-500/50 rounded-xl relative">
                  <NodeCard
                    data={{
                      nodeId: 'virtual-demo-02',
                      vib: 4.8, temp: 65, hum: 55, current: 18.2,
                      timestamp: new Date().toISOString()
                    }}
                    status={{ status: 'online' }}
                    history={[]}
                  />
                  <div className="absolute inset-0 bg-background/10 backdrop-blur-[1px] rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="bg-card text-foreground text-xs font-semibold px-4 py-2 rounded-lg shadow-xl border border-border">Preview Only — Waiting for Hardware</p>
                  </div>
                </div>
              </motion.div>
            )}

            {nodeKeys.length === 0 && (
              <motion.div variants={itemVariants} className="relative group hidden xl:block">
                <div className="absolute -top-3 left-4 z-10 bg-yellow-500 text-yellow-950 text-[10px] font-bold px-3 py-1 rounded-full shadow-md border border-yellow-600 uppercase tracking-wider flex items-center gap-1.5 opacity-90">
                  <MonitorPlay className="w-3.5 h-3.5" /> Dummy Data View
                </div>
                <div className="pointer-events-none opacity-80 ring-2 ring-yellow-500/50 rounded-xl relative">
                  <NodeCard
                    data={{
                      nodeId: 'virtual-demo-03',
                      vib: 0.8, temp: 28, hum: 45, current: 8.5,
                      timestamp: new Date().toISOString()
                    }}
                    status={{ status: 'online' }}
                    history={[]}
                  />
                  <div className="absolute inset-0 bg-background/10 backdrop-blur-[1px] rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="bg-card text-foreground text-xs font-semibold px-4 py-2 rounded-lg shadow-xl border border-border">Preview Only — Waiting for Hardware</p>
                  </div>
                </div>
              </motion.div>
            )}

          </motion.div>
        </div>
        </div>
      </div>
    </div>
  );
}

/* ── KPI Card ── */
function KpiCard({ label, value, sub, icon, accent }: {
  label: string; value: string; sub?: string;
  icon: import('react').ReactNode; accent: 'primary' | 'destructive';
}) {
  return (
    <motion.div 
      variants={itemVariants}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
      className="glass-card rounded-xl p-5"
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className={cn(
          "p-1.5 rounded-md",
          accent === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
        )}>
          {icon}
        </div>
      </div>
      <p className={cn(
        "text-2xl font-semibold tracking-tight tabular-nums",
        accent === 'destructive' ? 'text-destructive' : 'text-foreground'
      )}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </motion.div>
  );
}
