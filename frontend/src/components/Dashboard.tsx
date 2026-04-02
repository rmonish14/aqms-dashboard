import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import NodeCard from './NodeCard';
import type { SystemAlert } from './AlertFeed';
import { Radio, AlertTriangle, MonitorPlay, TrendingUp, Wind, Thermometer } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';

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
  thresholds?: { aqi: number; pm25: number; co: number; co2: number };
}) {
  const [nodesData, setNodesData]       = useState<Record<string, any>>({});
  const [nodesStatus, setNodesStatus]   = useState<Record<string, any>>({});
  const [nodesHistory, setNodesHistory] = useState<Record<string, any[]>>({});
  const [alerts, setAlerts]             = useState<SystemAlert[]>([]);
  const [isMockMode, setIsMockMode]     = useState(false);

  useEffect(() => {
    const socket = io('http://localhost:5000', {
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
        aqi:         Math.round((data.pm25 ?? 0) * 2.5),
        pm2_5:       data.pm25        ?? 0,
        pm10:        data.pm10        ?? 0,
        co:          data.co          ?? 0,
        co2:         data.co2         ?? 0,
        temperature: data.temperature ?? 0,
        humidity:    data.humidity    ?? 0,
        lat:         data.lat,
        long:        data.long,
        relay:       data.relay,        // 'ON' | 'OFF' — synced from ESP firmware
        mode:        data.mode,         // 'AUTO' | 'MANUAL' — synced from ESP firmware
        air_status:  data.air_status,   // ML classification label from ESP
        timestamp:   data.timestamp,
      };

      setNodesData(prev => {
        const next = { ...prev, [formattedData.nodeId]: formattedData };
        onNodesChange?.(next);
        return next;
      });
      setNodesStatus(prev => {
        const next = { ...prev, [formattedData.nodeId]: { status: 'online' } };
        onStatusChange?.(next);
        return next;
      });
      setNodesHistory(prev => {
        const hist = prev[formattedData.nodeId] || [];
        return { ...prev, [formattedData.nodeId]: [...hist.slice(-19), formattedData] };
      });
    });

    socket.on('node_status', (data) => {
      setNodesStatus(prev => {
        const next = { ...prev, [data.nodeId]: data };
        onStatusChange?.(next);
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
        { id: '1', nodeId: 'alpha-001', message: 'PM2.5 elevated above 35 µg/m³ — moderate air quality warning.', severity: 'warning', timestamp: new Date().toISOString() },
        { id: '2', nodeId: 'gamma-003', message: 'Node offline — no heartbeat received for >5 minutes.', severity: 'critical', timestamp: new Date(Date.now() - 300000).toISOString() },
        { id: '3', nodeId: 'beta-002', message: 'CO₂ within safe operational range.', severity: 'info', timestamp: new Date(Date.now() - 60000).toISOString() },
      ]);

      let alpha = { aqi: 108, pm2_5: 38, pm10: 55, co: 1.8, co2: 820, temperature: 24, humidity: 48 };
      let beta  = { aqi:  42, pm2_5: 11, pm10: 18, co: 0.4, co2: 415, temperature: 21, humidity: 55 };
      const gamma = { aqi: 185, pm2_5: 88, pm10: 115, co: 4.9, co2: 1180, temperature: 29, humidity: 31 };

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
          aqi:   Math.min(300, Math.max(0, alpha.aqi   + Math.floor(Math.random() * 12 - 5))),
          pm2_5: Math.max(5,   alpha.pm2_5 + Math.floor(Math.random() * 6  - 2)),
          pm10:  Math.max(10,  alpha.pm10  + Math.floor(Math.random() * 8  - 3)),
          co:    Math.max(0,   +(alpha.co  + (Math.random() * 0.4 - 0.2)).toFixed(1)),
          co2:   Math.max(400, alpha.co2   + Math.floor(Math.random() * 20 - 8)),
        };
        beta = {
          ...beta,
          aqi:   Math.max(20, beta.aqi + Math.floor(Math.random() * 6 - 2)),
          pm2_5: Math.max(5,  beta.pm2_5 + Math.floor(Math.random() * 4 - 1)),
        };

        const alphaNode = { nodeId: 'alpha-001', timestamp: ts(), ...alpha };
        const betaNode  = { nodeId: 'beta-002',  timestamp: ts(), ...beta  };
        const gammaNode = { nodeId: 'gamma-003', timestamp: new Date(Date.now() - 360000).toISOString(), ...gamma };

        setNodesData({ 'alpha-001': alphaNode, 'beta-002': betaNode, 'gamma-003': gammaNode });
        pushHistory('alpha-001', alpha);
        pushHistory('beta-002', beta);
      }, 3000);
    };

    return () => { socket.disconnect(); if (mockInterval) clearInterval(mockInterval); };
  }, []);

  const outdoorNodesData = Object.fromEntries(Object.entries(nodesData).filter(([id]) => !id.startsWith('worker_')));
  const nodeKeys        = Object.keys(outdoorNodesData);
  const connectedNodes  = Object.values(nodesStatus).filter(n => n.status !== 'offline' && !n.nodeId?.startsWith('worker_')).length;
  const totalNodes      = Math.max(connectedNodes, nodeKeys.length);
  const avgAqi          = nodeKeys.length > 0
    ? Math.round(Object.values(outdoorNodesData).reduce((s, n) => s + n.aqi, 0) / nodeKeys.length)
    : 0;
  const avgTemp         = nodeKeys.length > 0
    ? (Object.values(outdoorNodesData).reduce((s, n) => s + (n.temperature || 0), 0) / nodeKeys.length).toFixed(1)
    : '--';
  const criticalAlerts  = alerts.filter(a => a.severity === 'critical').length;

  const getAqiLabel = (v: number) =>
    v <= 50  ? 'Good'      :
    v <= 100 ? 'Moderate'  :
    v <= 150 ? 'Sensitive' :
    v <= 200 ? 'Unhealthy' : 'Hazardous';


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
              label="Fleet Avg AQI"
              value={avgAqi > 0 ? avgAqi.toString() : '--'}
              sub={avgAqi > 0 ? getAqiLabel(avgAqi) : undefined}
              icon={<Wind className="w-4 h-4" />}
              accent={avgAqi > 100 ? 'destructive' : 'primary'}
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

            {/* Dummy Padding (If < 2 real nodes connected) */}
            {nodeKeys.length < 2 && (
              <motion.div variants={itemVariants} className="relative group">
                <div className="absolute -top-3 left-4 z-10 bg-yellow-500 text-yellow-950 text-[10px] font-bold px-3 py-1 rounded-full shadow-md border border-yellow-600 uppercase tracking-wider flex items-center gap-1.5 opacity-90">
                  <MonitorPlay className="w-3.5 h-3.5" /> Dummy Data View
                </div>
                <div className="pointer-events-none opacity-80 ring-2 ring-yellow-500/50 rounded-xl relative">
                  <NodeCard
                    data={{
                      nodeId: 'virtual-demo-01',
                      aqi: 72, pm2_5: 22, pm10: 38, co: 0.8, co2: 450, temperature: 24, humidity: 45,
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
                      aqi: 145, pm2_5: 55, pm10: 82, co: 2.1, co2: 850, temperature: 28, humidity: 32,
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
                      aqi: 22, pm2_5: 5, pm10: 12, co: 0.1, co2: 380, temperature: 21, humidity: 40,
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
