import { useState } from 'react';
import { Sliders, ShieldCheck, Server, Save, CheckCircle2, Bell, Mail, MessageSquare, Smartphone, Lock } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const pageVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};
const tabVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

const TABS = [
  { id: 'thresholds',    label: 'Alert Thresholds', icon: Sliders       },
  { id: 'notifications', label: 'Notifications',    icon: Bell          },
  { id: 'security',      label: 'Admin Security',   icon: ShieldCheck   },
  { id: 'network',       label: 'MQTT / Network',   icon: Server        },
];

export default function SettingsPage({
  thresholds: ext,
  alertEmail: extEmail,
  onConfigChange,
}: {
  thresholds?: { aqi: number; pm25: number; co: number; co2: number };
  alertEmail?: string;
  onConfigChange?: (updates: { thresholds?: any, alertEmail?: string }) => void;
} = {}) {
  const [activeTab,  setActiveTab]  = useState('network');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState(false);
  const REQUIRED_PIN = '1234';
  const LOCKED_TABS = ['thresholds', 'notifications', 'security'];
  const [aqiLimit,   setAqiLimit]   = useState(ext?.aqi  ?? 150);
  const [coLimit,    setCoLimit]    = useState(ext?.co   ?? 9);
  const [co2Limit,   setCo2Limit]   = useState(ext?.co2  ?? 1000);
  const [pm25Limit,  setPm25Limit]  = useState(ext?.pm25 ?? 35);
  const [muteAlerts,  setMuteAlerts]  = useState(false);
  const [saved,       setSaved]       = useState(false);

  // Notification state
  const [emailEnabled,    setEmailEnabled]    = useState(!!extEmail);
  const [emailAddr,       setEmailAddr]       = useState(extEmail || '');
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramToken,   setTelegramToken]   = useState('');
  const [telegramChatId,  setTelegramChatId]  = useState('');
  const [smsEnabled,      setSmsEnabled]      = useState(false);
  const [smsNumber,       setSmsNumber]       = useState('');
  const [notifyOnWarn,    setNotifyOnWarn]    = useState(true);
  const [notifyOnCrit,    setNotifyOnCrit]    = useState(true);

  // MQTT Cloud config
  const [mqttHost, setMqttHost]   = useState('localhost');
  const [mqttPort, setMqttPort]   = useState('1883');
  const [mqttUser, setMqttUser]   = useState('');
  const [mqttPass, setMqttPass]   = useState('');
  const [mqttTls,  setMqttTls]    = useState(false);

  const save = () => {
    onConfigChange?.({ 
       thresholds: { aqi: aqiLimit, pm25: pm25Limit, co: coLimit, co2: co2Limit },
       alertEmail: emailEnabled ? emailAddr : '' 
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="h-full overflow-y-auto">
      <motion.div initial="hidden" animate="visible" variants={pageVariants} className="max-w-5xl mx-auto px-8 py-6 space-y-6">

        {/* Page header */}
        <motion.div variants={itemVariants} className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-3">
            <Sliders className="w-5 h-5 text-muted-foreground" />
            <div>
              <h1 className="text-base font-semibold text-foreground">Configuration</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Alarm thresholds, notification channels, MQTT broker and security</p>
            </div>
          </div>
          <button
            onClick={save}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-all',
              saved
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-primary text-primary-foreground border-transparent hover:opacity-90'
            )}
          >
            {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? 'Saved' : 'Save Changes'}
          </button>
        </motion.div>

        <div className="flex gap-6">
          {/* Tab nav */}
          <aside className="w-48 shrink-0 space-y-0.5">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-left transition-all',
                  activeTab === t.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <t.icon className="w-3.5 h-3.5 shrink-0" />
                {t.label}
                {LOCKED_TABS.includes(t.id) && !isUnlocked && <Lock className="w-3.5 h-3.5 ml-auto opacity-50 text-muted-foreground group-hover:text-foreground group-focus:text-foreground" />}
              </button>
            ))}
          </aside>

          {/* Panel */}
          <motion.div variants={itemVariants} className="flex-1 glass-card rounded-xl p-6 min-h-[520px]">
            <AnimatePresence mode="wait">

            {LOCKED_TABS.includes(activeTab) && !isUnlocked ? (
              <motion.div key="lock-screen" variants={tabVariants} initial="hidden" animate="visible" exit="exit" className="flex flex-col items-center justify-center h-[420px]">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 border border-primary/20 shadow-inner">
                  <ShieldCheck className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-xl font-bold text-foreground tracking-tight">Restricted Access</h2>
                <p className="text-sm text-muted-foreground mt-2 mb-8 text-center max-w-sm">
                  Enter the 4-digit master PIN to view and modify system thresholds, notifications, and API security tokens.
                </p>
                <div className="space-y-4 flex flex-col items-center">
                  <input
                    autoFocus
                    type="password"
                    maxLength={4}
                    value={pinEntry}
                    onChange={(e) => {
                      setPinEntry(e.target.value.replace(/\D/g, ''));
                      setPinError(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (pinEntry === REQUIRED_PIN) {
                          setIsUnlocked(true);
                          setPinEntry('');
                        } else {
                          setPinError(true);
                          setPinEntry('');
                        }
                      }
                    }}
                    className={cn(
                      "w-36 bg-secondary border rounded-xl px-4 py-4 text-center text-3xl font-mono tracking-[0.5em] text-foreground focus:outline-none focus:ring-2 focus:border-transparent transition-all placeholder:text-muted-foreground/30",
                      pinError ? "border-destructive focus:ring-destructive/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]" : "border-border focus:ring-primary/50"
                    )}
                    placeholder="••••"
                  />
                  {pinError && <p className="text-xs font-semibold text-destructive animate-pulse">Incorrect PIN. Please try again.</p>}
                  <button 
                    onClick={() => {
                      if (pinEntry === REQUIRED_PIN) {
                        setIsUnlocked(true);
                        setPinEntry('');
                      } else {
                        setPinError(true);
                        setPinEntry('');
                      }
                    }}
                    className="w-full relative overflow-hidden flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm rounded-xl transition-all group active:scale-[0.98]"
                  >
                    Unlock Panel
                  </button>
                </div>
              </motion.div>
            ) : (
              <>
            {/* ── THRESHOLDS ── */}
            {activeTab === 'thresholds' && (
              <motion.div key="thresholds" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-semibold text-foreground mb-1">Alert Thresholds</h2>
                  <p className="text-xs text-muted-foreground">Values exceeding these limits trigger alerts across all configured notification channels.</p>
                </div>
                <ThresholdRow label="Critical AQI"     description="High-priority alert when AQI exceeds this level."              value={aqiLimit}  min={50}  max={300}  step={5}  unit=""       color="text-destructive"                       onChange={setAqiLimit}  />
                <ThresholdRow label="PM 2.5 Limit"     description="WHO guideline: 15 µg/m³ per 24h average (indoor)."            value={pm25Limit} min={10}  max={150}  step={5}  unit="µg/m³" color="text-orange-500"                        onChange={setPm25Limit} />
                <ThresholdRow label="CO Hazard Level"  description="Carbon monoxide safety limit. NIOSH ceiling: 35 ppm."          value={coLimit}   min={1}   max={50}   step={1}  unit="ppm"   color="text-yellow-600 dark:text-yellow-400"  onChange={setCoLimit}   />
                <ThresholdRow label="CO₂ Warning"      description="Indoor air quality degradation boundary."                      value={co2Limit}  min={400} max={2000} step={50} unit="ppm"   color="text-blue-500"                         onChange={setCo2Limit}  />

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Suppress Visual Alerts</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Mutes UI indicators while maintaining full database logging.</p>
                  </div>
                  <Toggle value={muteAlerts} onChange={setMuteAlerts} />
                </div>
              </div>
              </motion.div>
            )}

            {/* ── NOTIFICATIONS ── */}
            {activeTab === 'notifications' && (
              <motion.div key="notifications" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-semibold text-foreground mb-1">Notification Channels</h2>
                  <p className="text-xs text-muted-foreground">Configure email, Telegram, and SMS alerts. Triggered when sensor readings exceed your defined thresholds.</p>
                </div>

                {/* Trigger conditions */}
                <div className="grid grid-cols-2 gap-3 p-4 bg-secondary/40 rounded-lg border border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-foreground">On Warning</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Moderate threshold breach</p>
                    </div>
                    <Toggle value={notifyOnWarn} onChange={setNotifyOnWarn} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-foreground">On Critical</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Severe threshold breach</p>
                    </div>
                    <Toggle value={notifyOnCrit} onChange={setNotifyOnCrit} />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-3 pb-5 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">Email Alerts</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">SMTP-based alert emails for threshold breaches</p>
                      </div>
                    </div>
                    <Toggle value={emailEnabled} onChange={setEmailEnabled} />
                  </div>
                  {emailEnabled && (
                    <input
                      type="email"
                      placeholder="recipient@example.com"
                      value={emailAddr}
                      onChange={e => setEmailAddr(e.target.value)}
                      className="w-full max-w-sm bg-secondary border border-border rounded-lg px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  )}
                </div>

                {/* Telegram */}
                <div className="space-y-3 pb-5 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">Telegram Bot</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Push alerts via Telegram Bot API to any chat or group</p>
                      </div>
                    </div>
                    <Toggle value={telegramEnabled} onChange={setTelegramEnabled} />
                  </div>
                  {telegramEnabled && (
                    <div className="grid grid-cols-2 gap-3 max-w-lg">
                      <div>
                        <label className="text-[10px] font-medium text-muted-foreground block mb-1.5">Bot Token</label>
                        <input type="password" placeholder="123456:ABCDef..." value={telegramToken} onChange={e => setTelegramToken(e.target.value)}
                          className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-muted-foreground block mb-1.5">Chat ID</label>
                        <input type="text" placeholder="-1001234567890" value={telegramChatId} onChange={e => setTelegramChatId(e.target.value)}
                          className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                      </div>
                    </div>
                  )}
                </div>

                {/* SMS */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">SMS Alerts</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Send SMS via Twilio or similar provider integration</p>
                      </div>
                    </div>
                    <Toggle value={smsEnabled} onChange={setSmsEnabled} />
                  </div>
                  {smsEnabled && (
                    <input type="tel" placeholder="+1234567890" value={smsNumber} onChange={e => setSmsNumber(e.target.value)}
                      className="w-full max-w-xs bg-secondary border border-border rounded-lg px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  )}
                </div>
              </div>
              </motion.div>
            )}

            {/* ── SECURITY ── */}
            {activeTab === 'security' && (
              <motion.div key="security" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-semibold text-foreground mb-1">Admin Security</h2>
                  <p className="text-xs text-muted-foreground">Manage authentication tokens and access control for AQMS operations.</p>
                </div>
                <div className="space-y-4 max-w-sm">
                  <div>
                    <label className="text-xs font-medium text-foreground block mb-2">Master API Token</label>
                    <div className="flex gap-2">
                      <input type="password" disabled value="xxxxxxxxxxxxxxxxxxxxxxxx"
                        className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2.5 text-xs font-mono text-muted-foreground" />
                      <button className="px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-secondary transition-colors text-foreground">Rotate</button>
                    </div>
                    <p className="text-[10px] text-destructive mt-2">⚠ Rotation disconnects all active IoT nodes and requires firmware re-pairing.</p>
                  </div>
                  <div className="pt-4 border-t border-border">
                    <p className="text-xs font-medium text-foreground mb-2">Active Sessions</p>
                    <div className="glass-card rounded-lg divide-y divide-border">
                      {['admin@10.0.0.1 · Chrome / Windows', 'api-service@localhost · CLI / v2.1'].map(s => (
                        <div key={s} className="flex items-center justify-between px-4 py-3">
                          <span className="text-[10px] font-mono text-muted-foreground">{s}</span>
                          <button className="text-[10px] text-destructive font-medium hover:underline">Revoke</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              </motion.div>
            )}

            {/* ── MQTT / NETWORK ── */}
            {activeTab === 'network' && (
              <motion.div key="network" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-semibold text-foreground mb-1">MQTT Broker Configuration</h2>
                  <p className="text-xs text-muted-foreground">Connect to a local or cloud-hosted MQTT broker (e.g. HiveMQ, EMQX, Mosquitto).</p>
                </div>

                <div className="grid grid-cols-2 gap-4 max-w-lg">
                  <div className="col-span-2">
                    <label className="text-[10px] font-medium text-muted-foreground block mb-1.5">Broker Host / URL</label>
                    <input value={mqttHost} onChange={e => setMqttHost(e.target.value)}
                      placeholder="broker.hivemq.com"
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground block mb-1.5">Port</label>
                    <input value={mqttPort} onChange={e => setMqttPort(e.target.value)}
                      placeholder="1883"
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div className="flex items-end pb-0.5">
                    <div className="flex items-center justify-between w-full px-3 py-2.5 bg-secondary border border-border rounded-lg">
                      <span className="text-xs font-medium text-foreground">TLS / SSL</span>
                      <Toggle value={mqttTls} onChange={setMqttTls} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground block mb-1.5">Username (optional)</label>
                    <input value={mqttUser} onChange={e => setMqttUser(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground block mb-1.5">Password (optional)</label>
                    <input type="password" value={mqttPass} onChange={e => setMqttPass(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <p className="text-xs font-semibold text-foreground mb-3">Current Broker Status</p>
                  <div className="grid grid-cols-2 gap-3 max-w-lg">
                    {[
                      { label: 'Connected to',  value: `${mqttHost}:${mqttPort}` },
                      { label: 'Protocol',      value: mqttTls ? 'MQTTS (TLS)' : 'MQTT (TCP)' },
                      { label: 'WebSocket API', value: 'localhost:5000' },
                      { label: 'Database',      value: 'mongodb://localhost:27017' },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-secondary/50 border border-border rounded-lg px-4 py-3">
                        <p className="text-[10px] font-medium text-muted-foreground mb-1">{label}</p>
                        <p className="text-xs font-mono font-medium text-foreground truncate">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </motion.div>
            )}

              </>
            )}

            </AnimatePresence>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

function ThresholdRow({ label, description, value, min, max, step, unit, color, onChange }: {
  label: string; description: string; value: number;
  min: number; max: number; step: number;
  unit: string; color: string; onChange: (v: number) => void;
}) {
  return (
    <motion.div whileHover={{ x: 2 }} transition={{ duration: 0.15 }} className="space-y-2 pb-5 border-b border-border last:border-0">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
        </div>
        <span className={cn('font-mono font-semibold text-sm tabular-nums ml-4 shrink-0', color)}>
          {value}{unit && <span className="text-muted-foreground text-[10px] font-normal ml-1">{unit}</span>}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 rounded-full bg-secondary appearance-none cursor-pointer accent-primary" />
    </motion.div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={cn(
        'relative w-9 h-5 rounded-full transition-colors border shrink-0',
        value ? 'bg-primary border-primary' : 'bg-secondary border-border'
      )}
    >
      <span className={cn(
        'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
        value ? 'left-4' : 'left-0.5'
      )} />
    </button>
  );
}
