import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Users, UserCircle, Activity, Wind, AlertTriangle, X } from 'lucide-react';
import { cn } from '../lib/utils';
import LiveChart from './LiveChart';
import { motion, AnimatePresence } from 'framer-motion';

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

export default function WorkersPage() {
  const [nodesData, setNodesData]       = useState<Record<string, any>>({});
  const [nodesStatus, setNodesStatus]   = useState<Record<string, any>>({});
  const [nodesHistory, setNodesHistory] = useState<Record<string, any[]>>({});
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);

  useEffect(() => {
    const socket = io('http://localhost:5000', { reconnectionAttempts: 3, timeout: 2000 });

    socket.on('sensor_data', (data) => {
      if (!data.nodeId.startsWith('worker_')) return;
      setNodesData(prev => ({ ...prev, [data.nodeId]: data }));
      setNodesHistory(prev => ({ ...prev, [data.nodeId]: [...(prev[data.nodeId] || []).slice(-19), data] }));
    });

    socket.on('node_status', (data) => {
      if (!data.nodeId.startsWith('worker_')) return;
      setNodesStatus(prev => ({ ...prev, [data.nodeId]: data }));
    });

    let mockInterval: ReturnType<typeof setInterval>;

    socket.on('connect_error', () => {
      if (Object.keys(nodesData).length === 0) {
        setNodesStatus({
          'worker_01_john': { nodeId: 'worker_01_john', status: 'online' },
          'worker_02_sarah': { nodeId: 'worker_02_sarah', status: 'online' },
          'worker_03_mike': { nodeId: 'worker_03_mike', status: 'offline' },
        });

        const workers = ['worker_01_john', 'worker_02_sarah', 'worker_03_mike'];
        const bases = {
          'worker_01_john': { aqi: 45, pm2_5: 12, pm10: 20, co: 1.1, co2: 600, temperature: 36.5, humidity: 45 },
          'worker_02_sarah': { aqi: 135, pm2_5: 45, pm10: 60, co: 3.2, co2: 850, temperature: 36.8, humidity: 55 },
          'worker_03_mike': { aqi: 15, pm2_5: 5, pm10: 10, co: 0.1, co2: 400, temperature: 36.1, humidity: 40 },
        };

        const ts = () => new Date().toISOString();
        const pushHistory = (id: string, d: any) => setNodesHistory(prev => {
          const h = prev[id] || [];
          return { ...prev, [id]: [...h.slice(-19), { ...d, nodeId: id, timestamp: ts() }] };
        });

        // Prime history
        Array.from({ length: 20 }).forEach(() => { pushHistory('worker_01_john', bases['worker_01_john']); pushHistory('worker_02_sarah', bases['worker_02_sarah']); });

        mockInterval = setInterval(() => {
          workers.forEach(w => {
            if (w === 'worker_03_mike') return; // offline
            const b: any = bases[w as keyof typeof bases];
            b.aqi = Math.max(0, b.aqi + Math.floor(Math.random() * 6 - 3));
            b.pm2_5 = Math.max(5, b.pm2_5 + Math.floor(Math.random() * 4 - 2));
            setNodesData(prev => ({ ...prev, [w]: { nodeId: w, timestamp: ts(), ...b } }));
            pushHistory(w, b);
          });
        }, 3000);
      }
    });

    return () => { socket.disconnect(); if (mockInterval) clearInterval(mockInterval); };
  }, []);

  const workerKeys = Object.keys(nodesData);
  const activeCount = Object.values(nodesStatus).filter(s => s.status === 'online').length;
  const avgAqi = workerKeys.length ? Math.round(Object.values(nodesData).reduce((s, n) => s + n.aqi, 0) / workerKeys.length) : 0;
  
  const getSeverity = (aqi: number) => aqi > 100 ? 'destructive' : aqi > 50 ? 'warning' : 'primary';

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      <div className="shrink-0 px-8 pt-6 pb-4">
        <motion.div initial="hidden" animate="visible" variants={containerVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard label="Active Wearables" value={activeCount.toString()} sub={`${workerKeys.length} total trackers`} icon={<Users className="w-4 h-4" />} accent="primary" />
          <KpiCard label="Avg Worker Exposure" value={avgAqi.toString() + ' AQI'} icon={<Wind className="w-4 h-4" />} accent={getSeverity(avgAqi)} />
          <KpiCard label="Critical Risk Warning" value={Object.values(nodesData).filter(n => n.aqi > 150).length.toString()} icon={<AlertTriangle className="w-4 h-4" />} accent="destructive" />
        </motion.div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <h3 className="text-sm font-semibold text-foreground mb-4">Personnel Roster</h3>
        {workerKeys.length === 0 ? (
          <motion.div initial="hidden" animate="visible" variants={containerVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { id: 'worker_demo_john', name: 'John Doe', status: 'online', data: { aqi: 45, pm2_5: 12, pm10: 20, co: 1.1, co2: 600 } },
              { id: 'worker_demo_sarah', name: 'Sarah Jane', status: 'online', data: { aqi: 135, pm2_5: 45, pm10: 60, co: 3.2, co2: 850 } },
              { id: 'worker_demo_mike', name: 'Mike Smith', status: 'offline', data: { aqi: 0, pm2_5: 0, pm10: 0, co: 0, co2: 0 } }
            ].map(dummy => (
              <div key={dummy.id} className="relative group">
                <div className="absolute -top-3 left-4 z-10 bg-yellow-500 text-yellow-950 text-[10px] font-bold px-3 py-1 rounded-full shadow-md border border-yellow-600 uppercase tracking-wider flex items-center gap-1.5 opacity-90">
                  <Activity className="w-3.5 h-3.5" /> Dummy Personnel
                </div>
                <div className="pointer-events-none opacity-80 ring-2 ring-yellow-500/50 rounded-xl relative">
                  <div className="glass-card rounded-xl p-5 text-left flex flex-col items-start gap-4">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground">
                          <UserCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold capitalize text-foreground">{dummy.name}</p>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <span className={cn("w-1.5 h-1.5 rounded-full inline-block", dummy.status === 'online' ? 'bg-green-500' : 'bg-red-500')} />
                            {dummy.status === 'online' ? 'Connected' : 'Signal Lost'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <div className={cn("status-badge uppercase font-bold", dummy.data.aqi > 100 ? 'bg-destructive/10 border-destructive/20 text-destructive' : dummy.data.aqi > 50 ? 'bg-warning/10 border-warning/20 text-warning' : 'bg-primary/10 border-primary/20 text-primary')}>
                          AQI {dummy.data.aqi}
                        </div>
                        <div className={cn("text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider", dummy.data.aqi > 100 ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20")}>
                          {dummy.data.aqi > 100 ? 'At Risk' : 'Safe'}
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-4 w-full gap-2 border-t border-border pt-4 mt-1">
                      <div><p className="text-[9px] text-muted-foreground">PM2.5</p><p className="text-xs font-mono font-medium">{dummy.data.pm2_5}</p></div>
                      <div><p className="text-[9px] text-muted-foreground">PM10</p><p className="text-xs font-mono font-medium">{dummy.data.pm10}</p></div>
                      <div><p className="text-[9px] text-muted-foreground">CO</p><p className="text-xs font-mono font-medium">{dummy.data.co}</p></div>
                      <div><p className="text-[9px] text-muted-foreground">CO₂</p><p className="text-xs font-mono font-medium">{dummy.data.co2}</p></div>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-background/10 backdrop-blur-[1px] rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="bg-card text-foreground text-xs font-semibold px-4 py-2 rounded-lg shadow-xl border border-border">Preview Only</p>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div initial="hidden" animate="visible" variants={containerVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {workerKeys.map(id => {
              const data = nodesData[id];
              const stat = nodesStatus[id]?.status || 'unknown';
              const name = id.split('_').slice(2).join(' ') || id;
              const aqi = data.aqi ?? 0;
              const bg = aqi > 100 ? 'bg-destructive/10 border-destructive/20 text-destructive' : aqi > 50 ? 'bg-warning/10 border-warning/20 text-warning' : 'bg-primary/10 border-primary/20 text-primary';

              return (
                <motion.button
                  key={id}
                  variants={itemVariants}
                  whileHover={{ scale: 1.015 }}
                  onClick={() => setSelectedWorker(id)}
                  className="glass-card rounded-xl p-5 hover:shadow-md transition-all text-left flex flex-col items-start gap-4"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground">
                        <UserCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold capitalize text-foreground">{name}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <span className={cn("w-1.5 h-1.5 rounded-full inline-block", stat === 'online' ? 'bg-green-500' : 'bg-red-500')} />
                          {stat === 'online' ? 'Connected' : 'Signal Lost'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <div className={cn("status-badge uppercase font-bold", bg)}>AQI {aqi}</div>
                      <div className={cn("text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider", aqi > 100 ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20")}>
                        {aqi > 100 ? 'At Risk' : 'Safe'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 w-full gap-2 border-t border-border pt-4 mt-1">
                    <div><p className="text-[9px] text-muted-foreground">PM2.5</p><p className="text-xs font-mono font-medium">{data.pm2_5}</p></div>
                    <div><p className="text-[9px] text-muted-foreground">PM10</p><p className="text-xs font-mono font-medium">{data.pm10}</p></div>
                    <div><p className="text-[9px] text-muted-foreground">CO</p><p className="text-xs font-mono font-medium">{data.co}</p></div>
                    <div><p className="text-[9px] text-muted-foreground">CO₂</p><p className="text-xs font-mono font-medium">{data.co2}</p></div>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {selectedWorker && (
          <WorkerDetailModal 
            workerId={selectedWorker} 
            data={nodesData[selectedWorker]} 
            status={nodesStatus[selectedWorker]} 
            history={nodesHistory[selectedWorker] || []}
            onClose={() => setSelectedWorker(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function KpiCard({ label, value, sub, icon, accent }: any) {
  return (
    <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} className="glass-card rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className={cn("p-1.5 rounded-md", accent === 'destructive' ? 'bg-destructive/10 text-destructive' : accent === 'warning' ? 'bg-yellow-500/10 text-yellow-600' : 'bg-primary/10 text-primary')}>
          {icon}
        </div>
      </div>
      <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", accent === 'destructive' ? 'text-destructive' : 'text-foreground')}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
    </motion.div>
  );
}

function WorkerDetailModal({ workerId, data, status, history, onClose }: any) {
  const name = workerId.split('_').slice(2).join(' ') || workerId;
  const isSafe = (data?.aqi || 0) < 100;
  
  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="glass-panel w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        
        <div className="flex items-center justify-between p-5 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary border border-border flex items-center justify-center text-foreground">
              <UserCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold capitalize text-foreground">{name}</h2>
              <p className="text-xs text-muted-foreground font-mono">{workerId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
             <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 bg-secondary/20 flex flex-col gap-6">
          <div className="flex justify-between items-center glass-card p-4 rounded-xl">
             <div>
                <p className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider mb-0.5">Safety Status</p>
                <p className={cn("text-lg font-semibold", isSafe ? 'text-green-500' : 'text-destructive')}>
                  {status?.status === 'offline' ? 'CONNECTION LOST' : isSafe ? 'CLEARED FOR DUTY' : 'EVACUATION WARNING'}
                </p>
             </div>
             <div className="text-right">
                <p className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider mb-0.5">Current AQI</p>
                <p className="text-xl font-mono font-bold text-foreground">{data?.aqi || '--'}</p>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-px border border-border bg-border rounded-xl overflow-hidden">
            <MetricBlock label="PM 2.5" val={data?.pm2_5} unit="µg/m³" />
            <MetricBlock label="PM 10" val={data?.pm10} unit="µg/m³" />
            <MetricBlock label="CO Gas" val={data?.co} unit="ppm" />
            <MetricBlock label="CO₂ Level" val={data?.co2} unit="ppm" />
          </div>

          <div>
             <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2"><Activity className="w-3.5 h-3.5 text-primary" /> Exposure Trend (Last 2 Min)</p>
             <div className="h-24 bg-card border border-border rounded-xl overflow-hidden pt-2 pb-1">
                <LiveChart data={history} dataKey="aqi" color="var(--color-primary)" />
             </div>
          </div>
        </div>

      </motion.div>
    </motion.div>
  );
}

function MetricBlock({ label, val, unit }: any) {
  return (
    <div className="p-4 bg-card flex flex-col items-center justify-center text-center">
       <p className="text-[10px] text-muted-foreground font-medium mb-1">{label}</p>
       <p className="text-sm font-semibold text-foreground font-mono">{val ?? '--'} <span className="text-[9px] font-normal text-muted-foreground">{unit}</span></p>
    </div>
  );
}
