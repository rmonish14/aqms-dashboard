import { useState, useMemo } from 'react';
import GoogleMapReact from 'google-map-react';
import { AlertTriangle, Map, Wifi, WifiOff, Navigation } from 'lucide-react';
import { cn } from '../lib/utils';

// ── Default map center = ESP device real location (Coimbatore) ─────────────
const DEFAULT_CENTER = { lat: 11.0168, lng: 77.9558 };
const DEFAULT_ZOOM = 15;

// ── Dummy/fallback static nodes (shown only if no live GPS data) ───────────
const DUMMY_NODES: NodeItem[] = [
  { id: 'virtual-demo-01', lat: 11.0172, lng: 77.9562, status: 'offline', aqi: 0, zone: 'Demo Zone A', isLive: false },
  { id: 'virtual-demo-02', lat: 11.0160, lng: 77.9551, status: 'offline', aqi: 0, zone: 'Demo Zone B', isLive: false },
];

interface NodeItem {
  id: string;
  lat: number;
  lng: number;
  status: string;
  aqi: number;
  zone: string;
  isLive: boolean;
  pm2_5?: number;
  co?: number;
  co2?: number;
  temperature?: number;
  humidity?: number;
}

const aqiLabel = (v: number) =>
  v <= 50 ? 'Good' : v <= 100 ? 'Moderate' : v <= 150 ? 'Sensitive' : v <= 200 ? 'Unhealthy' : 'Hazardous';

const aqiColor = (v: number) =>
  v <= 50 ? 'text-primary' : v <= 100 ? 'text-yellow-500' : v <= 150 ? 'text-orange-500' : 'text-destructive';

const dotColor = (s: string) =>
  s === 'online' ? 'bg-primary' : s === 'offline' ? 'bg-muted-foreground' : 'bg-destructive';

// ── Map Marker Component ───────────────────────────────────────────────────
const MapMarker = ({ node, activeId, onClick }: { node: NodeItem; activeId: string; lat: number; lng: number; onClick: (n: NodeItem) => void }) => (
  <button
    onClick={() => onClick(node)}
    className="absolute transform -translate-x-1/2 -translate-y-1/2 group z-10 w-8 h-8 flex items-center justify-center"
  >
    {node.status === 'online' && (
      <span className={cn(
        'absolute inset-0 rounded-full opacity-50 animate-ping',
        node.isLive ? 'bg-primary' : 'bg-muted-foreground'
      )} />
    )}
    <span className={cn(
      'relative flex w-4 h-4 rounded-full border-2 border-card shadow-lg transition-transform group-hover:scale-125',
      dotColor(node.status),
      node.isLive && 'ring-2 ring-primary/40 ring-offset-1 ring-offset-background',
      activeId === node.id && 'ring-2 ring-offset-1 ring-primary ring-offset-background scale-125'
    )} />
    <span className="absolute top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-card border border-border text-foreground text-[9px] font-mono font-semibold px-2 py-1 rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
      {node.id}{node.isLive ? ' 🟢 LIVE' : ''}
    </span>
  </button>
);

// ── Props ──────────────────────────────────────────────────────────────────
interface MapPageProps {
  liveNodes?: Record<string, any>;
  liveStatus?: Record<string, any>;
}

export default function MapPage({ liveNodes = {}, liveStatus = {} }: MapPageProps) {

  // Build node list: real live nodes with GPS coords
  const allNodes = useMemo((): NodeItem[] => {
    const live: NodeItem[] = Object.entries(liveNodes)
      .filter(([id]) => !id.startsWith('worker_'))
      .filter(([, d]) => d.lat != null && d.long != null)
      .map(([id, d]) => ({
        id,
        lat:         parseFloat(d.lat),
        lng:         parseFloat(d.long),
        status:      liveStatus[id]?.status ?? 'online',
        aqi:         d.aqi         ?? 0,
        zone:        `Live Node · ${id}`,
        isLive:      true,
        pm2_5:       d.pm2_5       ?? 0,
        co:          d.co          ?? 0,
        co2:         d.co2         ?? 0,
        temperature: d.temperature ?? 0,
        humidity:    d.humidity    ?? 0,
      }));

    return live.length > 0 ? live : DUMMY_NODES;
  }, [liveNodes, liveStatus]);

  // Center map on first live node, else default ESP location
  const mapCenter = useMemo(() => {
    const first = allNodes.find(n => n.isLive);
    return first ? { lat: first.lat, lng: first.lng } : DEFAULT_CENTER;
  }, [allNodes]);

  const [active, setActive] = useState<NodeItem | null>(null);
  const activeNode: NodeItem = allNodes.find(n => n.id === active?.id) ?? allNodes[0] ?? DUMMY_NODES[0];

  const liveCount = allNodes.filter(n => n.isLive && n.status === 'online').length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-3">
            <Map className="w-5 h-5 text-muted-foreground" />
            <div>
              <h1 className="text-base font-semibold text-foreground">Live Topology</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Geospatial satellite positioning and sensor tracking</p>
            </div>
          </div>
          <div className={cn(
            "flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border",
            liveCount > 0
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-secondary text-muted-foreground border-border"
          )}>
            {liveCount > 0
              ? <><Wifi className="w-3.5 h-3.5" /> {liveCount} Live Node{liveCount > 1 ? 's' : ''}</>
              : <><WifiOff className="w-3.5 h-3.5" /> Awaiting Live Data</>
            }
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ minHeight: 600 }}>

          {/* Map */}
          <div className="lg:col-span-2 rounded-xl relative overflow-hidden border border-border shadow-sm bg-black/20" style={{ height: '600px' }}>
            <GoogleMapReact
              bootstrapURLKeys={{ key: 'AIzaSyBBHfnFcwAl1JiDbog7u0Eu1cQd0omobjg' }}
              center={mapCenter}
              defaultZoom={DEFAULT_ZOOM}
            >
              {allNodes.map(node => (
                <MapMarker
                  key={node.id}
                  lat={node.lat}
                  lng={node.lng}
                  node={node}
                  activeId={activeNode.id}
                  onClick={setActive}
                />
              ))}
            </GoogleMapReact>

            {/* HUD */}
            <div className="absolute top-5 left-5 pointer-events-none z-10 flex flex-col gap-2">
              <div className="bg-background/80 backdrop-blur-md border border-border px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-bold text-foreground tracking-wider uppercase">SAT-LINK ACTIVE</span>
              </div>
              {liveCount > 0 && (
                <div className="bg-primary/90 backdrop-blur-md border border-primary/30 px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2">
                  <Navigation className="w-3 h-3 text-primary-foreground" />
                  <span className="text-[10px] font-bold text-primary-foreground tracking-wider">LIVE GPS ACTIVE</span>
                </div>
              )}
            </div>
          </div>

          {/* Inspector */}
          <div className="flex flex-col gap-4">
            <div className="glass-card rounded-xl flex-1 p-5 overflow-hidden">
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border">
                <div className={cn('w-2 h-2 rounded-full shrink-0', dotColor(activeNode.status))} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground font-mono truncate">{activeNode.id}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{activeNode.zone}</p>
                </div>
                <span className={cn(
                  'ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize shrink-0',
                  activeNode.status === 'online'
                    ? 'bg-primary/10 text-primary border-primary/20'
                    : 'bg-secondary text-muted-foreground border-border'
                )}>
                  {activeNode.isLive ? '🟢 Live' : activeNode.status}
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">Current AQI</p>
                  <p className={cn('text-4xl font-semibold tabular-nums',
                    !activeNode.isLive ? 'text-muted-foreground' : aqiColor(activeNode.aqi)
                  )}>
                    {!activeNode.isLive ? '—' : activeNode.aqi}
                  </p>
                  {activeNode.isLive && (
                    <p className="text-xs text-muted-foreground mt-1">{aqiLabel(activeNode.aqi)}</p>
                  )}
                </div>

                {activeNode.isLive && (
                  <div className="grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden border border-border">
                    {[
                      { label: 'PM2.5',  value: `${activeNode.pm2_5} µg/m³` },
                      { label: 'CO',     value: `${activeNode.co} ppm` },
                      { label: 'CO₂',    value: `${activeNode.co2} ppm` },
                      { label: 'Temp',   value: `${activeNode.temperature} °C` },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-card px-3 py-2.5">
                        <p className="text-[9px] text-muted-foreground font-medium mb-0.5">{label}</p>
                        <p className="text-[11px] font-semibold font-mono text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden border border-border">
                  <div className="bg-card px-3 py-2.5">
                    <p className="text-[9px] text-muted-foreground font-medium mb-1">GPS Coordinates</p>
                    <p className="text-[10px] font-mono text-foreground leading-tight">
                      Lat: {activeNode.lat?.toFixed(4) ?? '—'}<br />Lng: {activeNode.lng?.toFixed(4) ?? '—'}
                    </p>
                  </div>
                  <div className="bg-card px-3 py-2.5">
                    <p className="text-[9px] text-muted-foreground font-medium mb-1">Zone</p>
                    <p className="text-[11px] font-medium text-foreground">{activeNode.zone}</p>
                  </div>
                </div>

                {activeNode.status === 'warning' && (
                  <button className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-destructive text-white text-xs font-semibold hover:opacity-90 transition-opacity">
                    <AlertTriangle className="w-3.5 h-3.5" /> Trigger Evacuation Alert
                  </button>
                )}
              </div>
            </div>

            {/* Legend */}
            <div className="glass-card rounded-xl p-4">
              <p className="text-[10px] font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Map Legend</p>
              <ul className="space-y-2">
                {[
                  { dot: 'bg-primary',          label: 'Live Tower Online — Real GPS' },
                  { dot: 'bg-destructive',       label: 'Warning / Critical alert' },
                  { dot: 'bg-muted-foreground',  label: 'Offline / No GPS data' },
                ].map(({ dot, label }) => (
                  <li key={label} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <span className="relative flex w-3 h-3 rounded-full border border-card items-center justify-center flex-shrink-0">
                      <span className={cn('absolute inset-0 rounded-full', dot)} />
                    </span>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
