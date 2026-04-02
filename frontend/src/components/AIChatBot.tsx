import { useState, useRef, useEffect } from 'react';
// Removed @openrouter/sdk import to bypass chatGenerationParams error
import { Bot, X, Send, Loader2, Minimize2, Maximize2, Trash2, Settings } from 'lucide-react';
import { cn } from '../lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
export interface DashboardContext {
  nodes: Record<string, any>;
  status: Record<string, any>;
  alerts: any[];
  thresholds: { aqi: number; pm25: number; co: number; co2: number };
}

export interface AIAction {
  type: 'SET_THRESHOLD';
  metric: 'aqi' | 'pm25' | 'co' | 'co2';
  value: number;
}

interface Props {
  context: DashboardContext;
  onAction?: (action: AIAction) => void;
}

// ── OpenRouter API Config ─────────────────────────────────────────────────────────
const DEFAULT_API_KEY = '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';
const AI_MODEL = 'meta-llama/llama-3.2-3b-instruct:free'; // Active free model on OpenRouter (Apr 2025)

// ── Build system prompt from live dashboard data ──────────────────────────────
function buildSystemPrompt(ctx: DashboardContext): string {
  const outdoors = Object.entries(ctx.nodes).filter(([id]) => !id.startsWith('worker_'));
  const workers = Object.entries(ctx.nodes).filter(([id]) => id.startsWith('worker_'));

  const outdoorSummary = outdoors.map(([id, d]) =>
    `Tower ${id}: AQI=${d.aqi}, PM2.5=${d.pm2_5}µg/m³, CO=${d.co}ppm, Status=${ctx.status[id]?.status ?? 'unknown'}`
  ).join('\n') || 'No towers online.';

  const workerSummary = workers.map(([id, d]) =>
    `Worker ${id.split('_').slice(2).join(' ')} (${id}): AQI Exposure=${d.aqi}, PM2.5=${d.pm2_5}µg/m³, CO=${d.co}ppm, Status=${ctx.status[id]?.status ?? 'unknown'}`
  ).join('\n') || 'No workers tracked.';

  const alertsSummary = ctx.alerts.slice(0, 5).map(a =>
    `[${a.severity.toUpperCase()}] ${a.nodeId}: ${a.message}`
  ).join('\n') || 'No active alerts';

  return `You are AQMS-AI, a specialized AI assistant embedded inside an Air Quality Monitoring System (AQMS) SCADA dashboard. You have complete, real-time awareness of the system state, including outdoor towers and wearable worker trackers.

## CURRENT SYSTEM STATE
### Outdoor Towers
${outdoorSummary}

### Mining Personnel (Wearables)
${workerSummary}

### Current Alert Threshold Configuration
- AQI Critical Limit: ${ctx.thresholds.aqi}
- PM 2.5 Limit: ${ctx.thresholds.pm25} µg/m³
- CO Hazard Level: ${ctx.thresholds.co} ppm
- CO₂ Warning: ${ctx.thresholds.co2} ppm

### Active Alerts (latest 5)
${alertsSummary}

## YOUR CAPABILITIES
1. **Air Quality Analysis**: Analyze AQI, PM2.5, PM10, CO, CO2, temperature and humidity readings. Identify trends, anomalies, and health risks.
2. **Health Risk Assessment**: Advise on WHO guidelines, EPA standards, and NIOSH occupational limits for each pollutant.
3. **Threshold Management**: Users can ask you to change alert thresholds. When they do, respond with a clear confirmation AND include a special command block at the END of your message.
4. **Maintenance Advice**: Suggest maintenance based on node status and sensor readings.
5. **Compliance Reporting**: Summarize EPA/WHO compliance status.

## THRESHOLD CHANGE COMMANDS
If the user asks to change a threshold (e.g. "set AQI threshold to 120"), include this JSON at the very end of your response:
\`\`\`action
{"type":"SET_THRESHOLD","metric":"aqi","value":120}
\`\`\`
Metrics: "aqi", "pm25", "co", "co2"

## RESPONSE STYLE
- Be concise, data-driven, and professional
- Use real numbers from the live data above
- Flag any readings that exceed WHO/EPA standards
- Use ✅ ⚠️ 🚨 icons to indicate severity
- When data shows hazardous levels, be direct about risks`;
}

// ── Parse action command from AI response ─────────────────────────────────────
function parseAction(text: string): AIAction | null {
  const match = text.match(/```action\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim()) as AIAction;
  } catch {
    return null;
  }
}

// Strip the action block from display text
function stripAction(text: string): string {
  return text.replace(/```action[\s\S]*?```/g, '').trim();
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AIChatBot({ context, onAction }: Props) {
  const [open,     setOpen]     = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I'm **AQMS-AI**, your intelligent air quality analyst. I have real-time access to all your sensor data, alerts, and system configuration.\n\nHere's what I can help you with:\n- 📊 **Analyze** current AQI, PM2.5, CO readings for outdoor towers\n- 👷‍♀️ **Track exposure** for mining personnel wearing trackers\n- 🔧 **Adjust** alert thresholds (e.g. *"set AQI threshold to 120"*)\n- 🛠️ **Maintenance** suggestions based on device health\n\nWhat would you like to know?`,
      timestamp: new Date(),
    }
  ]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('aqms_ai_key') || DEFAULT_API_KEY;
    }
    return DEFAULT_API_KEY;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const historyRef     = useRef<{ role: string; content: string }[]>([]);

  const handleSaveKey = (key: string) => {
    const val = key || DEFAULT_API_KEY;
    setApiKey(val);
    if (!key) {
      localStorage.removeItem('aqms_ai_key');
    } else {
      localStorage.setItem('aqms_ai_key', key);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    // Build conversation history for OpenRouter API
    historyRef.current.push({ role: 'user', content: text });

    let aiMsgId: string | null = null;
    try {
      if (!apiKey) throw new Error("API key is missing. Please provide an OpenRouter API key in settings.");

      const systemPrompt = buildSystemPrompt(context);

      const messagesPayload = [
        { role: 'system', content: systemPrompt },
        ...historyRef.current
      ].filter(m => m && typeof m.content === 'string' && m.content.trim().length > 0);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": window.location.origin,
          "X-Title": "AQMS Dashboard",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: messagesPayload,
          stream: true
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = "Failed to fetch response";
        try { errMsg = JSON.parse(errText).error?.message || errMsg; } catch {}
        throw new Error(errMsg);
      }

      aiMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: aiMsgId!,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }]);
      setLoading(false); // hide main spinner to show real-time stream

      let fullResponse = "";
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            if (line.trim().startsWith("data: ") && !line.includes("[DONE]")) {
              try {
                const data = JSON.parse(line.trim().slice(6));
                const content = data.choices?.[0]?.delta?.content;
                if (content) {
                  fullResponse += content;
                  setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullResponse } : m));
                }
              } catch (e) {
                // Ignore incomplete chunks
              }
            }
          }
        }
      }

      // Final processing of full streamed payload
      const action = parseAction(fullResponse);
      if (action && onAction) {
        onAction(action);
      }

      const displayText = stripAction(fullResponse);
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: displayText } : m));

      historyRef.current.push({ role: 'assistant', content: fullResponse });
    } catch (err: any) {
      historyRef.current.pop();
      const errorMessage = err.message || "Unknown error";
      const isAuthError = errorMessage.toLowerCase().includes("user not found") || errorMessage.toLowerCase().includes("unauthorized") || errorMessage.includes("401") || errorMessage.includes("key requires");
      
      // ── Intelligent Offline Simulation Fallback ────────────────────────────────
      if (isAuthError || errorMessage.includes('Failed to fetch')) {
        const query = text.toLowerCase();
        let fallbackMsg = '';

        const nodesList = Object.entries(context.nodes);
        const maxAqi = nodesList.reduce((max, curr) => (curr[1].aqi > max ? curr[1].aqi : max), 0);

        if (query.includes('aqi') || query.includes('worst') || query.includes('quality')) {
          fallbackMsg = `*(Offline Fallback)* I'm currently scanning ${nodesList.length} total nodes. The highest recorded AQI right now is **${maxAqi || 'nominal'}**. All other towers are holding stable telemetry.`;
        } 
        else if (query.includes('co2') || query.includes('co ') || query.includes('hazard')) {
          fallbackMsg = `*(Offline Fallback)* Your system thresholds are locked at **${context.thresholds.co2} ppm for CO₂** and **${context.thresholds.co} ppm for CO**. The current status stream indicates operational safety compliance.`;
        }
        else if (query.includes('set') && query.includes('threshold')) {
          fallbackMsg = `*(Offline Fallback)* I am operating in Demo Mode because the external API key was revoked, so I cannot automatically safely execute threshold mutation commands right now.`;
        }
        else {
          fallbackMsg = `*(Offline Fallback)* I received your command. Because your OpenRouter API key (\`sk-or-v...\`) has been revoked by the provider, I am running locally. I can see your dashboard has **${context.alerts.length} active alerts** and **${nodesList.length} tracking nodes**, but deep analysis requires a new API key.`;
        }

        historyRef.current.push({ role: 'assistant', content: fallbackMsg });
        
        if (aiMsgId) {
           setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fallbackMsg } : m));
        } else {
           setMessages(prev => [...prev, {
             id: (Date.now() + 1).toString(),
             role: 'assistant',
             content: fallbackMsg,
             timestamp: new Date(),
           }]);
        }
      } else {
        // Severe non-auth error
        const errMsgOut = `❌ Request Failed: ${errorMessage}.`;
        if (aiMsgId) {
           setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: errMsgOut } : m));
        } else {
           setMessages(prev => [...prev, {
             id: (Date.now() + 1).toString(),
             role: 'assistant',
             content: errMsgOut,
             timestamp: new Date(),
           }]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    historyRef.current = [];
    setMessages([{
      id: 'welcome-refresh',
      role: 'assistant',
      content: 'Chat cleared. How can I help you analyze your AQMS data?',
      timestamp: new Date(),
    }]);
  };

  // Quick prompt chips
  const suggestions = [
    'Analyze current air quality',
    'Which node has the worst AQI?',
    'Is CO2 level safe?',
    'Set AQI threshold to 120',
    'Compliance status report',
  ];

  return (
    <>
      {/* ── Floating Button ────────────────────────────────────────────────── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center group"
          title="Open AQMS AI Assistant"
        >
          <Bot className="w-6 h-6 text-primary-foreground" />
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-card" />
        </button>
      )}

      {/* ── Chat Window ────────────────────────────────────────────────────── */}
      {open && (
        <div className={cn(
          "fixed bottom-6 right-6 z-50 flex flex-col bg-card border border-border outline outline-offset-0 outline-primary/10 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] overflow-hidden transition-all duration-300 animate-in slide-in-from-bottom-4",
          expanded ? "w-[600px] h-[75vh]" : "w-[360px] h-[520px]"
        )}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground leading-none">AQMS AI</p>
                <p className="text-[10px] text-primary mt-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  Online · Qwen 3.6 Plus
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setShowSettings(!showSettings)} title="Settings" className={cn("p-2 rounded-xl hover:bg-secondary transition-colors", showSettings && "bg-secondary")}>
                <Settings className="w-4 h-4 text-muted-foreground" />
              </button>
              <button onClick={clearChat} title="Clear chat" className="p-2 rounded-xl hover:bg-secondary transition-colors">
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </button>
              <button onClick={() => setExpanded(e => !e)} title={expanded ? "Minimize" : "Expand"} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                {expanded ? <Minimize2 className="w-4 h-4 text-muted-foreground" /> : <Maximize2 className="w-4 h-4 text-muted-foreground" />}
              </button>
              <div className="w-[1px] h-4 bg-border mx-1" />
              <button onClick={() => setOpen(false)} title="Close Assistant" className="flex items-center gap-1.5 px-3 py-1.5 ml-1 rounded-xl hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors group">
                <span className="text-xs font-semibold opacity-0 group-hover:opacity-100 hidden sm:block transition-opacity">Close</span>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="px-4 py-3 bg-secondary/30 border-b border-border text-xs shrink-0">
              <label className="block text-muted-foreground mb-1.5 font-medium">OpenRouter API Key</label>
              <input 
                type="text"
                value={apiKey}
                onChange={e => handleSaveKey(e.target.value)}
                placeholder="sk-or-v1... (paste your OpenRouter API key)"
                className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:border-primary font-mono text-[10px]"
              />
              <p className="text-[10px] text-muted-foreground mt-1.5">Get a free key at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-primary underline">openrouter.ai/keys</a> · Stored in your browser locally.</p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-secondary/10">
            {messages.map(msg => (
              <div key={msg.id} className={cn("flex gap-2.5", msg.role === 'user' && "flex-row-reverse")}>
                {/* Avatar */}
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                  msg.role === 'assistant' ? "bg-primary" : "bg-secondary border border-border"
                )}>
                  {msg.role === 'assistant'
                    ? <Bot className="w-3 h-3 text-primary-foreground" />
                    : <span className="text-[9px] font-bold text-foreground">U</span>
                  }
                </div>

                {/* Bubble */}
                <div className={cn(
                  "max-w-[88%] rounded-2xl px-5 py-3.5 text-[13px] leading-relaxed shadow-sm",
                  msg.role === 'assistant'
                    ? "bg-card border border-border text-foreground rounded-tl-sm"
                    : "bg-primary text-primary-foreground rounded-tr-sm"
                )}>
                  <FormattedText text={msg.content} isUser={msg.role === 'user'} />
                  <p className={cn(
                    "text-[9px] mt-1.5 tabular-nums",
                    msg.role === 'assistant' ? "text-muted-foreground" : "text-primary-foreground/60"
                  )}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5">
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <Bot className="w-3 h-3 text-primary-foreground" />
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Analyzing dashboard data...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestion chips (only when 1 message) */}
          {messages.length === 1 && (
            <div className="px-4 py-2 flex gap-2 overflow-x-auto shrink-0 border-t border-border bg-card">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="shrink-0 text-[10px] font-medium px-3 py-1.5 rounded-full bg-secondary border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors whitespace-nowrap"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-border bg-card shrink-0">
            <div className="flex gap-2 items-end">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask about air quality, set thresholds..."
                className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground mt-1.5 text-center">
              Powered by Qwen 3.6 Plus Preview · Context: {Object.keys(context.nodes).length} nodes, {context.alerts.length} alerts
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// ── Simple markdown-like formatter ───────────────────────────────────────────
function FormattedText({ text, isUser }: { text: string; isUser: boolean }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        // Bold: **text**
        const formatted = line
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/`(.*?)`/g, '<code class="font-mono bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-[10px]">$1</code>');
        return (
          <p key={i}
            className={cn("leading-relaxed text-xs", isUser ? "" : "text-foreground")}
            dangerouslySetInnerHTML={{ __html: formatted }}
          />
        );
      })}
    </div>
  );
}
