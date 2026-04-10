import { useState, useEffect } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis,
  BarChart, Bar, Cell
} from 'recharts';
import { AlertOctagon, Activity, FileDown, DatabaseBackup, Clock, ShieldAlert } from 'lucide-react';
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

export default function AnalyticsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/nodes/fleet/anomalies`)
      .then(r => r.json())
      .then(data => {
        const mappedData = (data || []).map((e: any) => ({
          id: e.id,
          node_id: e.device_id || e.node_id,
          event_category: e.status || e.event_category || 'UNKNOWN_ANOMALY',
          vib: e.vib || (e.pm25 ? e.pm25 / 10 : 0),
          temp: e.temp || e.temperature || 0,
          current: e.current || e.co2 || 0,
          timestamp: e.created_at || e.timestamp
        }));
        setEvents(mappedData);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch events from PostgreSQL', err);
        // Fallback UI data if PG is not reachable
        setEvents([{
          id: 'demo-1', node_id: 'machine-alpha', event_category: 'CRITICAL_VIBRATION', vib: 12.5, temp: 85, timestamp: new Date(Date.now() - 3600000).toISOString()
        }, {
          id: 'demo-2', node_id: 'machine-beta', event_category: 'OVERCURRENT_DETECTED', current: 45.2, temp: 65, timestamp: new Date(Date.now() - 7200000).toISOString()
        }]);
        setIsLoading(false);
      });
  }, []);

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)',
      borderRadius: '8px', fontSize: '11px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    },
    itemStyle: { color: 'var(--color-foreground)', fontWeight: 500 },
  };

  const axisProps = { stroke: 'var(--color-muted-foreground)', fontSize: 10, tickLine: false, axisLine: false };

  // Prepare scatter data
  const scatterData = events.map(e => ({
    x: new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' }),
    y: e.vib || e.temp / 10 || 10, // normalized y axis for visual spread
    z: e.vib ? e.vib * 20 : 100, // bubble size
    name: e.node_id,
    category: e.event_category,
    raw: e
  })).reverse();

  // Aggregate data for Bar Graph (Working Condition / Anomalies per Node)
  const barData = Object.values(
    events.reduce((acc, e) => {
       if (!acc[e.node_id]) acc[e.node_id] = { node: e.node_id, Count: 0 };
       acc[e.node_id].Count += 1;
       return acc;
    }, {})
  ).sort((a: any, b: any) => b.Count - a.Count);

  return (
    <div className="h-full overflow-y-auto">
      <motion.div initial="hidden" animate="visible" variants={containerVariants} className="max-w-7xl mx-auto px-8 py-6 space-y-6">

        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-3">
            <DatabaseBackup className="w-5 h-5 text-muted-foreground" />
            <div>
              <h1 className="text-base font-semibold text-foreground">Relational Anomaly Log</h1>
              <p className="text-xs text-muted-foreground mt-0.5">PostgreSQL Event-Driven Critical Threat Storage · 24h Window</p>
            </div>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
            <FileDown className="w-3.5 h-3.5" /> Export DB Ledger
          </button>
        </motion.div>

        {/* Summary KPIs */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card rounded-xl p-5 border-l-4 border-l-destructive/50">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2 flex flex-row items-center gap-1.5"><AlertOctagon className="w-3.5 h-3.5" /> High Vibration Alerts</p>
            <p className="text-2xl font-mono font-semibold text-red-500">{events.filter(e => String(e.event_category).includes('VIB')).length}</p>
          </div>
          <div className="glass-card rounded-xl p-5 border-l-4 border-l-orange-500/50">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2 flex flex-row items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Overcurrent Events</p>
            <p className="text-2xl font-mono font-semibold text-orange-500">{events.filter(e => String(e.event_category).includes('CURRENT') || String(e.event_category).includes('TEMP')).length}</p>
          </div>
          <div className="glass-card rounded-xl p-5 border-l-4 border-l-yellow-500/50">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2 flex flex-row items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Sensor Faults</p>
            <p className="text-2xl font-mono font-semibold text-yellow-500">{events.filter(e => String(e.event_category).includes('OFFLINE')).length}</p>
          </div>
        </motion.div>

        {/* Working Condition Bar Graph */}
        <motion.div variants={itemVariants} className="glass-card rounded-xl p-6">
           <div className="mb-5">
             <h3 className="text-sm font-semibold text-foreground">Node Condition Reliability</h3>
             <p className="text-[10px] text-muted-foreground mt-0.5">Absolute count of critical anomalies triggered per node (Higher = Worse Condition)</p>
           </div>
           
           <div className="h-48 mt-4">
             {barData.length === 0 && !isLoading ? (
                <div className="w-full h-full flex items-center justify-center text-xs font-mono text-muted-foreground border border-dashed border-border rounded-xl">
                  ALL NODES OPERATING NOMINALLY
                </div>
             ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="node" {...axisProps} tickFormatter={tick => String(tick).split('-').pop() || String(tick)} />
                    <YAxis dataKey="Count" {...axisProps} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'var(--color-secondary)', opacity: 0.4 }} {...tooltipStyle as any} />
                    <Bar dataKey="Count" radius={[4, 4, 0, 0]}>
                      {barData.map((entry: any, index: number) => (
                         <Cell key={`cell-${index}`} fill={entry.Count > 5 ? 'var(--color-destructive)' : entry.Count > 2 ? '#f97316' : 'var(--color-primary)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
             )}
           </div>
        </motion.div>

        {/* Scatter Event Map */}
        <motion.div variants={itemVariants} className="glass-card rounded-xl p-6">
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-foreground">Anomaly Constellation Map</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Visual mapping of intense pressure events across the 24h database threshold window</p>
          </div>
          <div className="h-64 mt-4">
            {isLoading ? (
               <div className="w-full h-full flex items-center justify-center">
                 <div className="flex flex-col items-center gap-3 text-muted-foreground">
                   <ShieldAlert className="w-8 h-8 animate-pulse text-primary/50" />
                   <p className="text-[10px] font-mono tracking-widest uppercase">Querying Relational Database...</p>
                 </div>
               </div>
            ) : scatterData.length === 0 ? (
               <div className="w-full h-full flex items-center justify-center text-xs font-mono text-muted-foreground border border-dashed border-border rounded-xl">
                 NO ANOMALIES DETECTED IN POSTGRES DB
               </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                 <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="x" name="Time" {...axisProps} />
                  <YAxis dataKey="y" name="Intensity" {...axisProps} />
                  <ZAxis dataKey="z" range={[50, 400]} name="Magnitude" />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }} 
                    {...tooltipStyle}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload.raw;
                        return (
                          <div className="bg-card border border-border p-3 rounded-lg shadow-xl text-xs max-w-[200px]">
                            <p className="font-bold text-foreground mb-1">{d.node_id}</p>
                            <p className={cn("text-[9px] font-mono tracking-wider px-1.5 py-0.5 inline-block rounded uppercase mb-2", 
                              (d.event_category || '').includes('VIB') ? 'bg-red-500/20 text-red-500' : 'bg-orange-500/20 text-orange-500'
                            )}>{d.event_category}</p>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                              <div><span className="text-muted-foreground block text-[9px]">Vibration</span> <span className="font-mono">{d.vib || '--'}</span></div>
                              <div><span className="text-muted-foreground block text-[9px]">Current</span> <span className="font-mono">{d.current || '--'}</span></div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter name="Anomalies" data={scatterData} fill="var(--color-primary)" opacity={0.6} activeShape={{ opacity: 1 }}/>
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Database Ledger Table */}
        <motion.div variants={itemVariants} className="glass-card rounded-xl p-0 overflow-hidden">
          <div className="p-5 border-b border-border">
             <h3 className="text-sm font-semibold text-foreground">PostgreSQL Active Ledger</h3>
             <p className="text-[10px] text-muted-foreground mt-0.5">Raw table output from `critical_sensor_events` selection</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/40 text-[10px] text-muted-foreground uppercase tracking-widest border-b border-border">
                <tr>
                  <th className="px-5 py-3 font-semibold">Timestamp</th>
                  <th className="px-5 py-3 font-semibold">Node Origin</th>
                  <th className="px-5 py-3 font-semibold">Anomaly Category</th>
                  <th className="px-5 py-3 font-semibold text-right">Vib (mm/s)</th>
                  <th className="px-5 py-3 font-semibold text-right">Current (A)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((e, idx) => (
                  <tr key={e.id || idx} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-5 py-4 font-mono text-muted-foreground whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                    <td className="px-5 py-4 font-medium text-foreground">{e.node_id}</td>
                    <td className="px-5 py-4 text-[10px]">
                        <span className={cn("px-2 py-0.5 rounded-full font-bold uppercase", 
                          (e.event_category || '').includes('NODE_OFFLINE') ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' : 
                          (e.event_category || '').includes('CRITICAL') ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                          'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                       )}>
                         {e.event_category}
                       </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-right font-medium">{e.vib || '—'}</td>
                    <td className="px-5 py-4 font-mono text-right text-muted-foreground">{e.current || '—'}</td>
                  </tr>
                ))}
                {events.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground italic">No anomalies stored in DB.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

      </motion.div>
    </div>
  );
}
