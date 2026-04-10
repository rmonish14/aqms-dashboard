import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../lib/config';
import { Wrench, UserCircle, Settings, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

export default function MaintenancePage() {
  const [nodesData, setNodesData] = useState<Record<string, any>>({});
  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  useEffect(() => {
    const socket = io(API_URL, { reconnectionAttempts: 3, timeout: 2000 });

    socket.on('node_data', (data) => {
      // Filter only spares simulators for maintenance logs
      if (!data.nodeId.startsWith('spares_')) return;
      setNodesData(prev => ({ ...prev, [data.nodeId]: data }));
    });


    let mockInterval: ReturnType<typeof setInterval>;

    socket.on('connect_error', () => {
      if (Object.keys(nodesData).length === 0) {
        const workers = ['spares_01_bearing', 'spares_02_motor'];
        const bases = {
          'spares_01_bearing': { vib: 1.2, current: 8.5, temperature: 45.5, humidity: 45, relay: 'ON', mode: 'AUTO' },
          'spares_02_motor': { vib: 4.8, current: 28.2, temperature: 68.8, humidity: 55, relay: 'OFF', mode: 'MANUAL' },
        };

        const ts = () => new Date().toISOString();

        mockInterval = setInterval(() => {
          workers.forEach(w => {
            const b: any = bases[w as keyof typeof bases];
            b.vib = Math.max(0, b.vib + (Math.random() * 0.4 - 0.2));
            setNodesData(prev => ({ ...prev, [w]: { nodeId: w, timestamp: ts(), ...b } }));
          });
        }, 3000);
      }
    });

    return () => { socket.disconnect(); if (mockInterval) clearInterval(mockInterval); };
  }, []);

  const tasks = [
    { id: 'task_001', machineId: 'machine-alpha-001', mechanic: 'John Doe', status: 'In Progress', priority: 'High', issue: 'Bearing wear detected. Vibration > 5 mm/s', assigned: '2 hours ago' },
    { id: 'task_002', machineId: 'machine-beta-002', mechanic: 'Sarah Jane', status: 'Pending', priority: 'Medium', issue: 'Motor housing overheating (> 60C)', assigned: '5 hours ago' },
  ];

  const repairLogs = [
    { id: 'log_882', machineId: 'machine-gamma-003', mechanic: 'Mike Smith', date: '2026-04-01 14:30', description: 'Replaced stator winding. Motor balanced.', cost: '$450' },
    { id: 'log_881', machineId: 'machine-alpha-001', mechanic: 'John Doe', date: '2026-03-29 09:15', description: 'Calibrated cooling fan relay.', cost: '$120' },
    { id: 'log_880', machineId: 'machine-delta-004', mechanic: 'Sarah Jane', date: '2026-03-25 16:45', description: 'Lubricated central axis bearing.', cost: '$85' },
  ];

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      <div className="shrink-0 px-8 pt-6 pb-4">
        <motion.div initial="hidden" animate="visible" variants={containerVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard label="Active Maintenance Tasks" value={tasks.filter(t=>t.status === 'In Progress').length.toString()} sub="Mechanics currently deployed" icon={<Wrench className="w-4 h-4" />} accent="warning" />
          <KpiCard label="Unresolved Anomalies" value={tasks.filter(t=>t.status === 'Pending').length.toString()} icon={<AlertTriangle className="w-4 h-4" />} accent="destructive" />
          <KpiCard label="Repairs Completed (30d)" value={repairLogs.length.toString()} icon={<CheckCircle className="w-4 h-4" />} accent="primary" />
        </motion.div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8 flex flex-col gap-8">
        
        {/* Active Schedule */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-4">Maintenance Schedule</h3>
          <motion.div initial="hidden" animate="visible" variants={containerVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-5">
            {tasks.map(task => (
              <motion.button
                key={task.id}
                variants={itemVariants}
                whileHover={{ scale: 1.015 }}
                onClick={() => setSelectedTask(task.id)}
                className="glass-card rounded-xl p-5 hover:shadow-md transition-all text-left flex flex-col items-start gap-4 border border-border"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground">
                      <UserCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold capitalize text-foreground">{task.mechanic}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{task.machineId}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <div className={cn("status-badge uppercase font-bold", task.priority === 'High' ? 'bg-destructive/10 border-destructive/20 text-destructive' : 'bg-warning/10 border-warning/20 text-warning')}>
                      {task.priority} Priority
                    </div>
                    <div className={cn("text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider", task.status === 'In Progress' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" : "bg-secondary text-muted-foreground border-border")}>
                      {task.status}
                    </div>
                  </div>
                </div>
                
                <div className="w-full bg-secondary/30 p-3 rounded-lg border border-border/50 text-xs">
                   <strong className="text-primary font-semibold">Diagnosis:</strong> {task.issue}
                </div>
              </motion.button>
            ))}
          </motion.div>
        </div>

        {/* Repair Logs */}
        <div>
           <h3 className="text-sm font-semibold text-foreground mb-4">Historical Repair Logs</h3>
           <div className="glass-card rounded-xl border border-border overflow-hidden">
             <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-secondary text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 font-semibold border-b border-border">Log ID</th>
                    <th className="px-4 py-3 font-semibold border-b border-border">Date</th>
                    <th className="px-4 py-3 font-semibold border-b border-border">Machine ID</th>
                    <th className="px-4 py-3 font-semibold border-b border-border">Mechanic</th>
                    <th className="px-4 py-3 font-semibold border-b border-border">Resolution</th>
                    <th className="px-4 py-3 font-semibold border-b border-border text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 bg-card/30">
                  {repairLogs.map(log => (
                    <tr key={log.id} className="hover:bg-secondary/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{log.id}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{log.date}</td>
                      <td className="px-4 py-3 font-medium text-xs">{log.machineId}</td>
                      <td className="px-4 py-3 text-xs">{log.mechanic}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{log.description}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold">{log.cost}</td>
                    </tr>
                  ))}
                </tbody>
             </table>
           </div>
        </div>

      </div>

      <AnimatePresence>
        {selectedTask && (
          <TaskDetailModal 
            task={tasks.find(t => t.id === selectedTask)}
            onClose={() => setSelectedTask(null)} 
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

function TaskDetailModal({ task, onClose }: any) {
  if (!task) return null;
  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="glass-panel w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-border"
      >
        <div className="flex items-center justify-between p-5 border-b border-border bg-card">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-secondary text-foreground flex items-center justify-center">
                <Settings className="w-5 h-5 animate-[spin_4s_linear_infinite]" />
             </div>
             <div>
                <h2 className="text-base font-bold text-foreground">Maintenance Order</h2>
                <p className="text-xs text-muted-foreground font-mono">{task.id}</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground">
             <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 bg-secondary/10 flex flex-col gap-6">
           <div>
             <p className="text-xs text-muted-foreground mb-1 uppercase font-bold tracking-wider">Assigned Mechanic</p>
             <p className="text-base font-medium">{task.mechanic}</p>
           </div>
           
           <div className="grid grid-cols-2 gap-4">
              <div>
                 <p className="text-xs text-muted-foreground mb-1 uppercase font-bold tracking-wider">Machine Target</p>
                 <p className="text-sm font-mono font-bold bg-card p-2 rounded border border-border inline-block">{task.machineId}</p>
              </div>
              <div>
                 <p className="text-xs text-muted-foreground mb-1 uppercase font-bold tracking-wider">Status</p>
                 <p className="text-sm font-semibold text-blue-500">{task.status}</p>
              </div>
           </div>

           <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-xl">
             <p className="text-xs text-destructive mb-1 uppercase font-bold tracking-wider flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Diagnostic Issue</p>
             <p className="text-sm text-foreground/90 font-medium">{task.issue}</p>
           </div>
           
           <button onClick={onClose} className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl shadow-lg hover:bg-primary/90 transition-all flex justify-center items-center gap-2">
              <CheckCircle className="w-4 h-4" /> Resolve & Create Repair Log
           </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
