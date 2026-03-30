import { useEffect, useState, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { BrainCircuit, Activity, TrendingUp, Loader2, Target } from 'lucide-react';
import { io } from 'socket.io-client';
import { cn } from '../lib/utils';

const WINDOW_SIZE = 10; // Use last 10 points to predict the 11th
const EPOCHS = 50;
const MAX_HISTORY = 100;

export default function PredictivePage() {
  const [targetFeature, setTargetFeature] = useState<'pm2_5' | 'temperature' | 'aqi' | 'humidity' | 'co2'>('pm2_5');
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [availableNodes, setAvailableNodes] = useState<string[]>([]);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [loss, setLoss] = useState<number | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  
  const modelRef = useRef<tf.Sequential | null>(null);

  // 1. Initialise the TensorFlow.js Model & Socket Stream
  useEffect(() => {
    // Connect to global MQTT/Socket layer
    const socket = io("http://localhost:5000");
    
    socket.on("node_data", (data: any) => {
       setAvailableNodes(prev => prev.includes(data.nodeId) ? prev : [...prev, data.nodeId].sort());
       setHistory(prev => {
          const fresh = [...prev, data];
          if (fresh.length > MAX_HISTORY * 5) return fresh.slice(fresh.length - MAX_HISTORY * 5); // Keep a larger buffer to account for multiple nodes
          return fresh;
       });
    });

    const model = tf.sequential();
    
    // Simple deep learning model for time-series forecasting 
    model.add(tf.layers.dense({ units: 32, inputShape: [WINDOW_SIZE], activation: 'relu' }));
    model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1 })); // Single output predicting the next timestep

    model.compile({ optimizer: tf.train.adam(0.01), loss: 'meanSquaredError' });
    modelRef.current = model;
    setModelReady(true);

    return () => {
       socket.disconnect();
       model.dispose();
    };
  }, []);

  // 2. Train the model using a sliding window over the isolated 'history' stream
  useEffect(() => {
    // If we have nodes but no active node, select the first one
    if (availableNodes.length > 0 && !activeNode) {
       setActiveNode(availableNodes[0]);
       return;
    }

    const filteredHistory = history.filter(h => h.nodeId === activeNode);

    if (!modelReady || filteredHistory.length < WINDOW_SIZE + 2 || isTraining) return;

    const runTraining = async () => {
      setIsTraining(true);
      
      try {
        // Extract raw target series securely
        const series = filteredHistory.map(h => h[targetFeature] || 0);

        // Build sliding window pairs (X: past WINDOW_SIZE, Y: current)
        const X = [];
        const Y = [];
        
        for (let i = 0; i < series.length - WINDOW_SIZE; i++) {
          X.push(series.slice(i, i + WINDOW_SIZE));
          Y.push(series[i + WINDOW_SIZE]);
        }

        // Convert vanilla JS arrays to tensors
        const xs = tf.tensor2d(X);
        const ys = tf.tensor2d(Y, [Y.length, 1]);

        // Fit the model dynamically in the browser
        const h = await modelRef.current!.fit(xs, ys, {
          epochs: EPOCHS,
          batchSize: 16,
          shuffle: true,
          verbose: 0
        });

        // Record the final training error
        setLoss(h.history.loss[h.history.loss.length - 1] as number);

        // 3. Make predictions for historical overlay tracing + predict the absolute future (t+1)
        const predTensor = modelRef.current!.predict(xs) as tf.Tensor;
        const predValues = await predTensor.data();
        
        // Predict specifically the next unseen step right now
        const latestWindow = series.slice(-WINDOW_SIZE);
        const nextX = tf.tensor2d([latestWindow]);
        const nextPredTensor = modelRef.current!.predict(nextX) as tf.Tensor;
        const [nextPredictedValue] = await nextPredTensor.data();

        // 4. Map the aligned predictions against actual history for tracking
        const alignedPredictions = filteredHistory.map((entry, idx) => {
           if (idx < WINDOW_SIZE) return { ...entry, predicted: null }; // First W entries have no past to predict from
           return { ...entry, actual: entry[targetFeature], predicted: predValues[idx - WINDOW_SIZE] };
        });

        // Push the completely future t+1 into the graph
        alignedPredictions.push({
           timestamp: new Date(Date.now() + 5000).toISOString(), // Roughly 5s in the future
           actual: null,
           predicted: nextPredictedValue,
           isFuture: true
        });

        setPredictions(alignedPredictions);

        // Dump tensors to avoid WebGL memory leaks!
        xs.dispose();
        ys.dispose();
        predTensor.dispose();
        nextX.dispose();
        nextPredTensor.dispose();

      } catch (err) {
        console.error('TF Training Error:', err);
      } finally {
        setIsTraining(false);
      }
    };

    runTraining();
  }, [history, targetFeature, modelReady, activeNode, availableNodes]); // Re-trigger training as the sliding window history expands

  const filteredLen = history.filter(h => h.nodeId === activeNode).length;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background text-foreground p-6">
      <div className="flex items-center justify-between mb-4 shrink-0 z-10">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-primary" />
            AI Predictive Forecasting
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Real-time Sliding Window Analysis isolating discrete sensor clusters.</p>
        </div>
        
        {/* Metric Switcher */}
        <div className="flex bg-secondary p-1 rounded-xl">
           {[ { id: 'pm2_5', label: 'PM 2.5 Air Quality' }, { id: 'temperature', label: 'Temperature' }, { id: 'humidity', label: 'Humidity' }, { id: 'co2', label: 'CO₂' }, { id: 'aqi', label: 'Overall AQI' } ].map(metric => (
             <button
                key={metric.id}
                onClick={() => setTargetFeature(metric.id as any)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                  targetFeature === metric.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
             >
                {metric.label}
             </button>
           ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6 shrink-0 z-10 border-b border-border pb-4">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Target Node:</span>
        {availableNodes.length === 0 ? (
          <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground animate-pulse">Awaiting connection...</span>
        ) : (
          availableNodes.map(node => (
            <button
               key={node}
               onClick={() => setActiveNode(node)}
               className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-md transition-all border",
                  activeNode === node 
                    ? "bg-primary/20 border-primary/50 text-primary" 
                    : "bg-secondary border-border text-muted-foreground hover:bg-muted"
               )}
            >
               {node}
            </button>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 shrink-0 z-10">
        <div className="glass-card rounded-xl border border-border p-5">
           <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5"/> Model State</p>
           {isTraining ? (
             <p className="text-sm font-semibold text-orange-500 flex items-center gap-2 animate-pulse mt-1"><Loader2 className="w-4 h-4 animate-spin"/> Training via WebGL...</p>
           ) : (
             <p className="text-sm font-semibold text-green-500 mt-1">Standby — Inference Ready</p>
           )}
        </div>
        <div className="glass-card rounded-xl border border-border p-5">
           <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5"/> Forecast Horizon</p>
           <p className="text-2xl font-bold font-mono text-primary leading-none">
             t+1
             <span className="text-sm text-muted-foreground ml-2 font-sans font-normal">(Next Step)</span>
           </p>
        </div>
        <div className="glass-card rounded-xl border border-border p-5">
           <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5"><Target className="w-3.5 h-3.5"/> MSE Loss</p>
           <p className="text-2xl font-bold font-mono leading-none">
             {loss !== null ? loss.toFixed(4) : '--'}
           </p>
        </div>
      </div>

      <div className="flex-1 glass-card border border-border rounded-xl p-6 relative overflow-hidden z-10 flex flex-col">
        <h3 className="text-sm font-bold mb-4">Trajectory Overview: Actual vs Predicted [{targetFeature}] for {activeNode || '...'}</h3>
        
        {filteredLen < WINDOW_SIZE + 2 ? (
           <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
             <Loader2 className="w-8 h-8 animate-spin mb-3 text-primary/50" />
             <p className="text-sm font-medium">Accumulating initial sliding window data for {activeNode}...</p>
             <p className="text-xs mt-1">Waiting for {WINDOW_SIZE + 2 - filteredLen} more live event ticks from node.</p>
           </div>
        ) : (
           <ResponsiveContainer width="100%" height="90%">
             <LineChart data={predictions} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
               <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
               <XAxis 
                  dataKey="timestamp" 
                  stroke="#888888" 
                  fontSize={10} 
                  tickFormatter={tick => { try { return new Date(tick).toLocaleTimeString(); } catch { return ""; } }}
                  tickLine={false} 
                  axisLine={false} 
               />
               <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => Math.round(v).toString()}/>
               <Tooltip 
                  contentStyle={{ backgroundColor: 'black', borderColor: '#333', borderRadius: '8px', fontSize: '12px' }}
                  labelFormatter={l => new Date(l).toLocaleTimeString()}
                  formatter={(val: any) => [val ? Number(val).toFixed(2) : '--', '']}
               />
               <Legend wrapperStyle={{ fontSize: '12px' }} />
               <Line 
                  type="monotone" 
                  name="Ground Truth (Actual)"
                  dataKey="actual" 
                  stroke="#ffffff" 
                  strokeWidth={2} 
                  dot={{ r: 3, fill: '#ffffff', strokeWidth: 0 }} 
                  isAnimationActive={false}
               />
               <Line 
                  type="monotone" 
                  name="AI Prediction"
                  dataKey="predicted" 
                  stroke="var(--color-primary)" 
                  strokeWidth={2} 
                  strokeDasharray="5 5"
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    return payload.isFuture ? (
                       <circle cx={cx} cy={cy} r={6} fill="var(--color-primary)" className="animate-ping" key="future" />
                    ) : (
                       <circle cx={cx} cy={cy} r={2} fill="var(--color-primary)" strokeWidth={0} key={cx} />
                    )
                  }}
                  isAnimationActive={false}
               />
             </LineChart>
           </ResponsiveContainer>
        )}
      </div>

       {/* Decorative backdrop light matching TF signature color */}
       <div className="absolute inset-0 bg-orange-500/5 blur-[120px] pointer-events-none" />
    </div>
  );
}
