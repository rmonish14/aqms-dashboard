import { useState, useEffect } from 'react';
import { API_URL } from '../lib/config';
import { io, Socket } from 'socket.io-client';
import { MapPin, Power, Activity, Share2, Send, X, Loader2 } from 'lucide-react';
import LiveChart from './LiveChart';
import GaugeWidget from './GaugeWidget';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

// Lazy singleton — one shared socket for ALL NodeCard instances, created on first use
let _sharedSocket: Socket | null = null;
function getSharedSocket(): Socket {
  if (!_sharedSocket || !_sharedSocket.connected) {
    _sharedSocket = io(API_URL, {
      autoConnect:        true,
      reconnectionAttempts: 5,
      timeout:            3000,
    });
  }
  return _sharedSocket;
}

interface NodeCardProps {
  data: any;
  status: any;
  history: any[];
}

export default function NodeCard({ data, status, history }: NodeCardProps) {
  const [relayActive, setRelayActive] = useState(false);
  const [relayLoading, setRelayLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const AUTO_TEMP_THRESHOLD = 30; // °C — matches ESP firmware
  const [showShare, setShowShare] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const isOffline = status?.status === 'offline';
  const lastSeen  = data.timestamp
    ? Math.floor((Date.now() - new Date(data.timestamp).getTime()) / 1000)
    : 0;

  // ── Sync relay state from live ESP telemetry ──────────────────────────────
  // ESP includes "relay":"ON"/"OFF" and "mode":"AUTO"/"MANUAL" in every packet
  useEffect(() => {
    if (data.relay === 'ON') setRelayActive(true);
    else if (data.relay === 'OFF') setRelayActive(false);
    if (data.mode === 'AUTO') setAutoMode(true);
    else if (data.mode === 'MANUAL') setAutoMode(false);
  }, [data.relay, data.mode]);

  // ── Sync relay state from server relay_ack events ─────────────────────────
  useEffect(() => {
    const socket = getSharedSocket();
    const handler = (ack: { nodeId: string; state: string }) => {
      if (ack.nodeId === data.nodeId) {
        setRelayActive(ack.state === 'ON');
        setRelayLoading(false);
      }
    };
    socket.on('relay_ack', handler);
    return () => { socket.off('relay_ack', handler); };
  }, [data.nodeId]);

  // Zero-out metrics if hardware is disconnected
  const vib = isOffline ? 0 : data.vib;
  const temp  = isOffline ? 0 : data.temp;
  const hum   = isOffline ? 0 : data.hum;
  const current = isOffline ? 0 : data.current;

  const vibMeta = vib <= 2  ? { label: 'Healthy',      color: 'text-primary',    bg: 'bg-primary/10',    border: 'border-primary/20'    }
               :  vib <= 5 ? { label: 'Normal',   color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' }
               :  vib <= 8 ? { label: 'Warning',  color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' }
               :               { label: 'Critical',  color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' };

  const handleShare = async () => {
    setIsSharing(true);
    try {
      await fetch(`${API_URL}/api/email/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: shareEmail.trim() || undefined,
          message: shareMessage,
          nodeData: { id: data.nodeId, vib, status: status?.status }
        })
      });
      setShareSuccess(true);
      setTimeout(() => { setShowShare(false); setShareSuccess(false); setShareMessage(''); }, 2000);
    } catch (err) {
      console.error('Failed to share', err);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ scale: 1.015 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "glass-card rounded-xl flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-md",
        isOffline && "opacity-60"
      )}
    >

      {/* ── Card Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          {/* Live pulse indicator */}
          <div className="relative w-2 h-2">
            {!isOffline && (
              <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
            )}
            <span className={cn(
              "relative block w-2 h-2 rounded-full",
              isOffline ? 'bg-muted-foreground' : 'bg-primary'
            )} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground font-mono">{data.nodeId}</p>
            <p className="text-[10px] font-medium flex items-center gap-1 mt-0.5 rounded-full px-2 py-0.5 border w-fit" 
               style={{ 
                 backgroundColor: isOffline ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                 borderColor: isOffline ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                 color: isOffline ? 'rgb(239, 68, 68)' : 'var(--muted-foreground)'
               }}>
              <MapPin className="w-2.5 h-2.5" />
              Zone A · {isOffline ? 'MQTT Disconnected' : `Updated ${lastSeen}s ago`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* VIB Badge */}
          <div className={cn("status-badge", vibMeta.bg, vibMeta.border, vibMeta.color)}>
            VIB {vib} · {vibMeta.label}
          </div>
          {/* Share Button */}
          <button 
            onClick={() => setShowShare(true)}
            title="Dispatch Email Report"
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-secondary border border-border text-muted-foreground hover:text-primary transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-5 py-4 flex-1 flex flex-col gap-4">

        {/* Primary metrics table */}
        <div className="grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden border border-border">
          {[
            { label: 'Vibration', value: vib, unit: 'mm/s' },
            { label: 'Current',  value: current,  unit: 'A' },
            { label: 'Temp',     value: temp,    unit: '°C'   },
            { label: 'Humidity',    value: hum,   unit: '%'   },
          ].map(({ label, value, unit }) => (
            <div key={label} className="bg-card px-4 py-3">
              <p className="text-[10px] font-medium text-muted-foreground mb-1">{label}</p>
              <motion.p
                key={value}
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                className="text-base font-semibold text-foreground tabular-nums font-mono"
              >
                {value ?? '--'}
                <span className="text-[10px] font-normal text-muted-foreground ml-1">{unit}</span>
              </motion.p>
            </div>
          ))}
        </div>

        {/* Environmental gauges */}
        <div className="flex justify-around py-2">
          <GaugeWidget
            value={temp ?? 0} min={-10} max={50}
            label="Temperature" unit="°C"
            colorClass="stroke-orange-400" size={96}
          />
          <GaugeWidget
            value={hum ?? 0} min={0} max={100}
            label="Humidity" unit="%"
            colorClass="stroke-blue-400" size={96}
          />
        </div>

        {/* Trend sparkline */}
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">
              <Activity className="w-3 h-3" /> Vibration Trend
            </p>
            <span className="text-[10px] text-muted-foreground font-mono">2 min</span>
          </div>
          <LiveChart
            data={history}
            dataKey="vib"
            color={vib > 8 ? 'var(--color-destructive)' : 'var(--color-primary)'}
          />
        </div>
        {/* ── Relay Control Panel ── */}
        <div className="pt-3 border-t border-border space-y-2.5">

          {/* Mode toggle row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground">Exhaust Fan / Relay</p>
              <p className={cn(
                "text-[10px] mt-0.5 font-mono",
                relayActive ? 'text-primary font-semibold' : 'text-muted-foreground'
              )}>
                {relayLoading ? 'Sending...' : relayActive ? '● ON — Running' : '○ OFF — Standby'}
              </p>
            </div>

            {/* AUTO / MANUAL toggle */}
            <button
              onClick={() => {
                if (isOffline) return;
                const next = !autoMode;
                setAutoMode(next);
                setRelayLoading(true);
                getSharedSocket().emit('relay_control', {
                  nodeId: data.nodeId,
                  mode: next ? 'AUTO' : 'MANUAL',
                  state: next ? 'AUTO' : (relayActive ? 'ON' : 'OFF')
                });
                setTimeout(() => setRelayLoading(false), 1500);
              }}
              disabled={isOffline}
              title={autoMode ? 'Switch to Manual control' : 'Switch to Auto (temp > 30°C)'}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                autoMode
                  ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-600 dark:text-yellow-400'
                  : 'bg-secondary border-border text-muted-foreground hover:border-primary/30'
              )}
            >
              {autoMode ? '⚡ AUTO' : '🖱 MANUAL'}
            </button>
          </div>

          {/* Auto mode info bar */}
          {autoMode && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <span className="text-[10px] text-yellow-700 dark:text-yellow-300 font-medium">
                Auto: relay {relayActive ? 'ON' : 'OFF'} · Triggers when temp &gt; {AUTO_TEMP_THRESHOLD}°C
                {temp > 0 && <span className={cn("ml-1 font-bold", temp > AUTO_TEMP_THRESHOLD ? 'text-destructive' : 'text-primary')}>
                  (now {temp}°C)
                </span>}
              </span>
            </div>
          )}

          {/* Manual button — only active in MANUAL mode */}
          {!autoMode && (
            <button
              onClick={() => {
                if (isOffline || relayLoading) return;
                const next = !relayActive;
                setRelayLoading(true);
                getSharedSocket().emit('relay_control', { nodeId: data.nodeId, state: next ? 'ON' : 'OFF', mode: 'MANUAL' });
                setTimeout(() => {
                  setRelayActive(next);
                  setRelayLoading(false);
                }, 1500);
              }}
              disabled={isOffline || relayLoading}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-all",
                relayActive
                  ? 'bg-primary border-primary text-primary-foreground hover:opacity-90'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-primary/30',
                (isOffline || relayLoading) && 'opacity-40 cursor-not-allowed'
              )}
            >
              {relayLoading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                : <><Power className="w-3.5 h-3.5" /> {relayActive ? 'Turn OFF' : 'Turn ON'}</>
              }
            </button>
          )}
        </div>
      </div>

      {/* ── Share Modal Overlay ── */}
      {showShare && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full border border-border rounded-xl shadow-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/50">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Share2 className="w-3.5 h-3.5"/> Share Node Telemetry</p>
              <button disabled={isSharing} onClick={() => setShowShare(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            
            <div className="p-4 space-y-3">
              {shareSuccess ? (
                <div className="py-6 flex flex-col items-center justify-center text-center">
                  <div className="w-10 h-10 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-3">
                    <Send className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">Dispatched Successfully!</p>
                  <p className="text-[10px] text-muted-foreground mt-1">The report is on its way via NodeMailer.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground block mb-1.5">Recipient Override</label>
                    <input type="email" value={shareEmail} onChange={e => setShareEmail(e.target.value)}
                      placeholder="Leave blank to use Default Settings Config"
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground block mb-1.5">Custom Message</label>
                    <textarea value={shareMessage} onChange={e => setShareMessage(e.target.value)}
                      placeholder="Add an optional memo for the responder..."
                      rows={2}
                      className="w-full resize-none bg-secondary border border-border rounded-lg px-3 py-2 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <button 
                    onClick={handleShare} disabled={isSharing}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isSharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {isSharing ? 'Dispatching...' : 'Fire Dispatch Email'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
