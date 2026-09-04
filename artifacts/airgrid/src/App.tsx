import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, ChevronRight, CircleHelp, Clock3, Cloud, Crosshair, Database, ExternalLink, Layers3, Map as MapIcon, Menu, Minus, Radio, RefreshCw, ScanLine, ShieldCheck, SlidersHorizontal, Sparkles, Target, X } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import AirGridMap from '@/components/airgrid-map';
import {
  getGetAirQualitySummaryQueryKey,
  getGetPredictionGridQueryKey,
  getGetStationQueryKey,
  getHealthCheckQueryKey,
  getListHotspotsQueryKey,
  getListMeasurementsQueryKey,
  getListStationsQueryKey,
  useGetAirQualitySummary,
  useGetPredictionGrid,
  useGetStation,
  useHealthCheck,
  useListHotspots,
  useListMeasurements,
  useListStations,
  getListHistoricalMeasurementsQueryKey,
  getGetValidationStatusQueryKey,
  useListHistoricalMeasurements,
  useGetValidationStatus,
} from '@workspace/api-client-react';
import type { GetPredictionGridParams, HistoricalMeasurement, Hotspot, Measurement, PredictionGrid, Station, ValidationStatus } from '@workspace/api-client-react';

const queryClient = new QueryClient();
const DATA_QUALITY_TOOLTIP = 'Based on proximity to stations and data recency — not a statistical guarantee.';

function formatDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatShortTime(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function ErrorState({ onRetry, label = 'Data could not be loaded' }: { onRetry?: () => void; label?: string }) {
  return (
    <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-center" data-testid="state-error">
      <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-destructive" />
      <p className="font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">Check the demo service connection and try again.</p>
      {onRetry && <button onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover-elevate" data-testid="button-retry"><RefreshCw className="h-4 w-4" /> Retry</button>}
    </div>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-muted', className)} data-testid="state-loading" />;
}

function QualityBadge({ score, compact = false }: { score: number; compact?: boolean }) {
  const tone = score >= 75 ? 'good' : score >= 50 ? 'watch' : 'low';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', tone === 'good' ? 'border-primary/25 bg-primary/10 text-primary' : tone === 'watch' ? 'border-accent/40 bg-accent/20 text-foreground' : 'border-destructive/25 bg-destructive/10 text-destructive')} data-testid={`status-quality-${score}`}>
          <span className={cx('h-1.5 w-1.5 rounded-full', tone === 'good' ? 'bg-primary' : tone === 'watch' ? 'bg-accent' : 'bg-destructive')} />
          {!compact && 'Data Quality '} {score}
        </span>
      </TooltipTrigger>
      <TooltipContent>{DATA_QUALITY_TOOLTIP}</TooltipContent>
    </Tooltip>
  );
}

function SourceBadge({ source = 'measured' }: { source?: string }) {
  const label = source === 'estimated' ? 'Estimated · IDW' : source === 'forecast' ? 'Prototype forecast' : 'Measured';
  return <span className={cx('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-[0.1em]', source === 'measured' ? 'bg-primary/10 text-primary' : source === 'estimated' ? 'bg-accent/30 text-foreground' : 'bg-chart-4/15 text-chart-4')} data-testid={`badge-source-${source}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{label}</span>;
}

function AppMark() {
  return <Link href="/" className="group flex items-center gap-3" data-testid="link-brand-home"><span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><span className="absolute h-14 w-14 rounded-full border border-current/40" /><span className="absolute h-7 w-7 rounded-full border border-current/40" /><span className="h-1.5 w-1.5 rounded-full bg-current" /></span><span><span className="block text-[15px] font-extrabold tracking-tight text-sidebar-foreground">AirGrid</span><span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/55">field intelligence</span></span></Link>;
}

const navItems = [
  { href: '/', label: 'Overview', icon: BarChart3 },
  { href: '/map', label: 'Map workspace', icon: MapIcon },
  { href: '/live', label: 'Live Data', icon: Radio },
  { href: '/hotspots', label: 'Hotspots', icon: Target },
  { href: '/forecast', label: 'Prototype forecast', icon: Sparkles },
  { href: '/validation', label: 'Validation', icon: ShieldCheck },
];

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dataMode, setDataMode] = useState<'live' | 'demo'>(() => window.localStorage.getItem('airgrid-data-mode') === 'live' ? 'live' : 'demo');
  const changeDataMode = (mode: 'live' | 'demo') => {
    window.localStorage.setItem('airgrid-data-mode', mode);
    window.dispatchEvent(new CustomEvent('airgrid-data-mode', { detail: mode }));
    setDataMode(mode);
  };
  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className={cx('fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-sidebar px-5 py-5 transition-transform duration-300 md:translate-x-0', mobileOpen ? 'translate-x-0' : '-translate-x-full')} data-testid="navigation-sidebar">
        <div className="flex items-center justify-between"><AppMark /><button onClick={() => setMobileOpen(false)} className="rounded-md p-1 text-sidebar-foreground/60 md:hidden" data-testid="button-close-menu"><X className="h-5 w-5" /></button></div>
        <div className="mt-12"><p className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/40">Workspace</p><nav className="space-y-1">{navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={cx('group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors', location === href ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground')} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon className="h-[17px] w-[17px]" />{label}{label === 'Hotspots' && <span className="ml-auto rounded-md bg-sidebar-foreground/10 px-1.5 py-0.5 font-mono text-[10px]">live</span>}</Link>)}</nav></div>
        <div className="mt-10"><p className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/40">Reference</p><Link href="/about" onClick={() => setMobileOpen(false)} className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors', location === '/about' ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground')} data-testid="link-nav-about"><CircleHelp className="h-[17px] w-[17px]" />Scope & method</Link></div>
        <div className="mt-auto rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-3.5"><div className="flex items-center gap-2 text-xs font-bold text-sidebar-foreground"><span className="h-2 w-2 rounded-full bg-sidebar-primary shadow-[0_0_0_4px_hsl(var(--sidebar-primary)/.12)]" />Demo environment</div><p className="mt-2 text-[11px] leading-relaxed text-sidebar-foreground/50">Transparent by design. Every view separates observed readings from spatial estimates.</p></div>
      </aside>
      {mobileOpen && <button className="fixed inset-0 z-30 bg-sidebar/40 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" data-testid="button-overlay-menu" />}
      <div className="fixed bottom-4 right-4 z-50 flex overflow-hidden rounded-xl border border-border/70 bg-card/85 p-1 shadow-xl backdrop-blur-md" data-testid="toggle-data-mode"><button onClick={() => changeDataMode('live')} className={cx('rounded-lg px-3 py-2 text-xs font-bold', dataMode === 'live' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')} data-testid="button-mode-live">Live</button><button onClick={() => changeDataMode('demo')} className={cx('rounded-lg px-3 py-2 text-xs font-bold', dataMode === 'demo' ? 'bg-secondary text-foreground' : 'text-muted-foreground')} data-testid="button-mode-demo">Demo</button></div>
      <main className="md:pl-[248px]"><header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md md:px-9"><div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-lg border border-border bg-card p-2 md:hidden" data-testid="button-open-menu"><Menu className="h-5 w-5" /></button><div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><span className="font-mono text-foreground">IN / {location === '/' ? 'OVERVIEW' : location.slice(1).toUpperCase()}</span><ChevronRight className="h-3.5 w-3.5" /></div></div><div className="flex items-center gap-3"><div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Demo feed connected</div><div className="h-8 w-8 rounded-full border border-border bg-secondary p-1.5" title="AirGrid operator"><div className="flex h-full w-full items-center justify-center rounded-full bg-primary text-[10px] font-extrabold text-primary-foreground">AG</div></div></div></header>{children}</main>
    </div>
  );
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-primary">{eyebrow}</p><h1 className="text-3xl font-extrabold tracking-[-0.04em] text-foreground sm:text-4xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}</div>{action}</div>;
}

function MetricCard({ label, value, unit, detail, icon: Icon, tone = 'default' }: { label: string; value: string | number; unit?: string; detail?: string; icon: typeof Activity; tone?: 'default' | 'warn' | 'hot' }) {
  return <div className="rounded-2xl border border-card-border bg-card p-5 shadow-sm animate-in" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="flex items-start justify-between"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary"><Icon className="h-[18px] w-[18px]" /></div>{tone === 'hot' ? <span className="rounded-md bg-destructive/10 px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-destructive">attention</span> : tone === 'warn' ? <span className="rounded-md bg-accent/25 px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-foreground">watch</span> : <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">today</span>}</div><p className="mt-5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-extrabold tracking-[-0.05em] text-foreground">{value}{unit && <span className="ml-1 text-base font-semibold tracking-normal text-muted-foreground">{unit}</span>}</p>{detail && <p className="mt-2 text-xs text-muted-foreground">{detail}</p>}</div>;
}

type LivePayload = {
  fetchedAt: string;
  weather: { value?: { current?: Record<string, number> }; error?: string };
  air: { value?: { hourly?: Record<string, Array<number | string>> }; error?: string };
  openAq?: { value?: { results?: Array<{ name?: string; locality?: string; country?: { name?: string } }> }; error?: string; unavailable?: string };
};

const LIVE_CITIES = ['Kochi', 'Ernakulam', 'Bengaluru', 'Delhi', 'Mumbai'];

function minutesAgo(value?: string) {
  if (!value) return '—';
  return `${Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000))} minutes ago`;
}

function LiveData() {
  const [city, setCity] = useState('Kochi');
  const [data, setData] = useState<LivePayload | null>(null);
  const [lastGood, setLastGood] = useState<LivePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setRequestError(null);
    try {
      const response = await fetch(`/api/live-data?city=${encodeURIComponent(city)}`);
      if (!response.ok) throw new Error(`service returned ${response.status}`);
      const next = await response.json() as LivePayload;
      setData(next);
      if (next.weather.value || next.air.value) setLastGood(next);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Live data request failed');
    } finally { setLoading(false); }
  }, [city]);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 5 * 60 * 1000); return () => window.clearInterval(timer); }, [refresh]);
  const shown = data ?? lastGood;
  const weather = shown?.weather.value?.current;
  const hourly = shown?.air.value?.hourly;
  const airIndex = Math.max(0, (hourly?.time ?? []).findIndex(time => String(time).slice(0, 13) === new Date().toISOString().slice(0, 13)));
  const airValue = (key: string) => hourly?.[key]?.[airIndex] ?? '—';
  const sourceError = (kind: 'weather' | 'air') => data?.[kind].error ?? (!data ? requestError : null);
  const cardError = (error?: string | null) => error ? <p className="mt-3 border-t border-destructive/20 pt-3 text-xs font-semibold text-destructive">Live data unavailable — {lastGood ? 'showing last successful fetch.' : 'no successful fetch yet.'}</p> : null;
  const weatherCards: Array<[string, string, string]> = [
    ['Temperature', String(weather?.temperature_2m ?? '—'), '°C'], ['Humidity', String(weather?.relative_humidity_2m ?? '—'), '%'], ['Wind speed', String(weather?.wind_speed_10m ?? '—'), 'km/h'], ['Wind direction', String(weather?.wind_direction_10m ?? '—'), '°'],
  ];
  const airCards: Array<[string, string | number, string]> = [['PM2.5', airValue('pm2_5'), 'µg/m³'], ['PM10', airValue('pm10'), 'µg/m³'], ['NO₂', airValue('nitrogen_dioxide'), 'µg/m³'], ['Ozone', airValue('ozone'), 'µg/m³'], ['CO', airValue('carbon_monoxide'), 'µg/m³'], ['SO₂', airValue('sulphur_dioxide'), 'µg/m³']];
  return <div className="mx-auto max-w-7xl p-5 md:p-9"><PageTitle eyebrow="External live feeds" title="Live Data" description="Live values fetched directly from external weather and air-quality APIs, independent of the estimation engine and demo monitoring dataset." action={<div className="flex items-center gap-2"><label className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold">City <select value={city} onChange={e => setCity(e.target.value)} className="ml-2 bg-transparent outline-none" data-testid="select-live-city">{LIVE_CITIES.map(option => <option key={option}>{option}</option>)}</select></label><button onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60" data-testid="button-refresh-live"><RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />Refresh</button></div>} />
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"><span><span className="font-bold">Selected city:</span> {city}</span><span className="font-mono text-xs text-muted-foreground">Last updated: {minutesAgo(shown?.fetchedAt)}</span></div>
    {requestError && <div className="mb-6 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">Live data request failed — {lastGood ? 'showing the last successful fetch.' : 'try refresh.'}</div>}
    <section><div className="mb-4"><h2 className="text-lg font-extrabold">Current weather and wind</h2><p className="mt-1 text-xs text-muted-foreground">Source: Open-Meteo (modelled)</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{weatherCards.map(([label, value, unit]) => <div key={label} className="rounded-2xl border border-card-border bg-card p-5 shadow-sm"><p className="text-xs font-bold text-muted-foreground">{label}</p><p className="mt-3 text-3xl font-extrabold">{value} <span className="text-sm text-muted-foreground">{unit}</span></p><p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-primary">Open-Meteo (modelled)</p>{cardError(sourceError('weather'))}</div>)}</div></section>
    <section className="mt-8"><div className="mb-4"><h2 className="text-lg font-extrabold">Current air quality</h2><p className="mt-1 text-xs text-muted-foreground">Modelled supplementary source, distinct from station measurements.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{airCards.map(([label, value, unit]) => <div key={label} className="rounded-2xl border border-card-border bg-card p-5 shadow-sm"><p className="text-xs font-bold text-muted-foreground">{label}</p><p className="mt-3 text-3xl font-extrabold">{value} <span className="text-sm text-muted-foreground">{unit}</span></p><p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-primary">Open-Meteo (modelled)</p>{cardError(sourceError('air'))}</div>)}</div></section>
    <section className="mt-8 rounded-2xl border border-card-border bg-card p-5 shadow-sm"><h2 className="text-lg font-extrabold">OpenAQ station lookup</h2>{shown?.openAq?.value?.results?.[0] ? <><p className="mt-2 text-sm font-bold">{shown.openAq.value.results[0].name ?? shown.openAq.value.results[0].locality ?? 'Nearby station'}</p><p className="mt-2 text-xs font-bold uppercase tracking-wide text-primary">OpenAQ (measured station)</p></> : <p className="mt-2 text-sm text-muted-foreground">{shown?.openAq?.unavailable ?? (shown?.openAq?.error ? 'Live data unavailable — showing last successful fetch when available.' : 'No matching OpenAQ station was returned for this city.')}</p>}</section>
  </div>;
}

function MiniMap({ stations, hotspots, cells, interactive = false }: { stations: Station[]; hotspots: Hotspot[]; cells: Array<{ latitude: number; longitude: number; value: number; dataQualityScore: number }>; interactive?: boolean }) {
  const points = useMemo(() => {
    const all = [...stations.map(s => ({ lat: s.latitude, lon: s.longitude, kind: 'station', label: s.name, value: s.pm25 })), ...hotspots.map(h => ({ lat: h.latitude, lon: h.longitude, kind: 'hotspot', label: h.area, value: h.value }))];
    const lats = all.map(p => p.lat); const lons = all.map(p => p.lon);
    const minLat = Math.min(...lats) - 0.01; const maxLat = Math.max(...lats) + 0.01; const minLon = Math.min(...lons) - 0.01; const maxLon = Math.max(...lons) + 0.01;
    return all.map(p => ({ ...p, x: ((p.lon - minLon) / (maxLon - minLon)) * 88 + 6, y: (1 - (p.lat - minLat) / (maxLat - minLat)) * 82 + 9 }));
  }, [stations, hotspots]);
  const cellPoints = useMemo(() => {
    const lats = cells.map(c => c.latitude); const lons = cells.map(c => c.longitude);
    if (!lats.length) return [];
    const minLat = Math.min(...lats) - 0.006; const maxLat = Math.max(...lats) + 0.006; const minLon = Math.min(...lons) - 0.006; const maxLon = Math.max(...lons) + 0.006;
    return cells.map(c => ({ ...c, x: ((c.longitude - minLon) / (maxLon - minLon)) * 90 + 5, y: (1 - (c.latitude - minLat) / (maxLat - minLat)) * 80 + 10 }));
  }, [cells]);
  return <div className={cx('relative min-h-[330px] overflow-hidden rounded-2xl border border-[#bdcdbb] map-paper', interactive && 'min-h-[500px]')} data-testid="map-visualization"><div className="absolute inset-0 opacity-40 air-grid" />{cellPoints.map((p, i) => <div key={`cell-${i}`} className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[12px]" style={{ left: `${p.x}%`, top: `${p.y}%`, backgroundColor: p.value > 80 ? 'hsl(4 63% 47% / .42)' : p.value > 45 ? 'hsl(41 88% 57% / .42)' : 'hsl(161 49% 39% / .34)' }} title={`Estimated ${p.value} ${p.dataQualityScore} quality`} />)}<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-35"><path d="M-5 70 C 18 42, 25 80, 42 45 S 80 16, 106 25" fill="none" stroke="#62837a" strokeWidth=".7" /><path d="M-8 26 C 19 18, 30 56, 50 68 S 78 84, 108 62" fill="none" stroke="#62837a" strokeWidth=".45" /><path d="M21 -5 C 28 28, 59 29, 58 106" fill="none" stroke="#62837a" strokeWidth=".35" /></svg>{points.map((p, i) => p.kind === 'hotspot' ? <div key={`hot-${i}`} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%` }}><span className="absolute -inset-2 animate-ping rounded-full bg-destructive/30" /><span className="relative block h-4 w-4 rounded-full border-2 border-card bg-destructive shadow-[0_0_0_3px_hsl(4_63%_47%/.18)]" title={`Hotspot: ${p.label}`} /></div> : <div key={`station-${i}`} className="group absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%` }}><span className="relative flex h-4 w-4 items-center justify-center rounded-full border-2 border-card bg-primary shadow-[0_0_0_3px_hsl(161_49%_39%/.18)]"><span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" /></span><span className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-sidebar px-2 py-1 font-mono text-[9px] text-sidebar-foreground group-hover:block">{p.label}</span></div>)}<div className="absolute left-4 top-4 rounded-lg border border-[#b7c6b5] bg-[#e9f0e4]/90 px-3 py-2 backdrop-blur"><p className="font-mono text-[10px] uppercase tracking-wider text-[#42645b]">Delhi NCR · demo extent</p><p className="mt-1 text-xs font-semibold text-[#294a42]">PM2.5 surface</p></div><div className="absolute bottom-4 left-4 flex flex-wrap gap-2 rounded-lg border border-[#b7c6b5] bg-[#e9f0e4]/90 p-2 backdrop-blur"><span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#294a42]"><i className="h-2 w-2 rounded-full bg-primary" />Measured station</span><span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#294a42]"><i className="h-2 w-2 rounded-full bg-destructive" />Detected hotspot</span><span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#294a42]"><i className="h-2 w-2 rounded-full bg-accent" />IDW estimate</span></div>{interactive && <div className="absolute right-4 top-4 flex flex-col gap-1 rounded-lg border border-[#b7c6b5] bg-[#e9f0e4]/90 p-1 backdrop-blur"><button className="flex h-8 w-8 items-center justify-center rounded text-[#42645b] hover:bg-white/50" data-testid="button-map-layers"><Layers3 className="h-4 w-4" /></button><button className="flex h-8 w-8 items-center justify-center rounded text-[#42645b] hover:bg-white/50" data-testid="button-map-locate"><Crosshair className="h-4 w-4" /></button></div>}</div>;
}

function useAirData() {
  const summaryQuery = useGetAirQualitySummary({ query: { queryKey: getGetAirQualitySummaryQueryKey() } });
  const stationQuery = useListStations({ query: { queryKey: getListStationsQueryKey() } });
  const hotspotQuery = useListHotspots({ query: { queryKey: getListHotspotsQueryKey() } });
  const measurementQuery = useListMeasurements({ pollutant: 'PM25' }, { query: { queryKey: getListMeasurementsQueryKey({ pollutant: 'PM25' }) } });
  const gridQuery = useGetPredictionGrid({ pollutant: 'PM25' }, { query: { queryKey: getGetPredictionGridQueryKey({ pollutant: 'PM25' }) } });
  const healthQuery = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  return { summary: summaryQuery.data, stations: stationQuery.data ?? [], hotspots: hotspotQuery.data ?? [], measurements: measurementQuery.data ?? [], grid: gridQuery.data, health: healthQuery.data, isLoading: summaryQuery.isLoading || stationQuery.isLoading || hotspotQuery.isLoading, isError: summaryQuery.isError || stationQuery.isError || hotspotQuery.isError, retry: () => { void summaryQuery.refetch(); void stationQuery.refetch(); void hotspotQuery.refetch(); } };
}

function OverviewLegacy() {
  const { summary, stations, hotspots, measurements, grid, isLoading, isError, retry } = useAirData();
  if (isError) return <div className="mx-auto max-w-7xl p-5 md:p-9"><ErrorState onRetry={retry} /></div>;
  return <div className="mx-auto max-w-7xl p-5 md:p-9"><PageTitle eyebrow="Operations overview" title={summary?.city ? `${summary.city}, in focus` : 'City air-quality overview'} description="A transparent read on what the network measured, what the surface estimates, and where teams may want to look next." action={<div className="flex flex-wrap items-center gap-2"><span className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-bold text-primary">Demo Monitoring Data</span><Link href="/map" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm hover-elevate" data-testid="link-open-map"><MapIcon className="h-4 w-4" />Open map workspace</Link></div>} />{isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div> : <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Average PM2.5" value={summary?.averagePm25 ?? '—'} unit="µg/m³" detail="Across measured stations" icon={Activity} tone={(summary?.averagePm25 ?? 0) > 60 ? 'warn' : 'default'} /><MetricCard label="Peak PM2.5" value={summary?.maxPm25 ?? '—'} unit="µg/m³" detail="Highest measured reading" icon={ArrowUpRight} tone="hot" /><MetricCard label="Measured stations" value={summary?.measuredCount ?? '—'} detail={`${summary?.stationCount ?? '—'} stations in network`} icon={Radio} /><MetricCard label="Detected hotspots" value={summary?.hotspotCount ?? '—'} detail="Spike + persistent signals" icon={Target} tone={(summary?.hotspotCount ?? 0) > 0 ? 'warn' : 'default'} /></div><div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]"><section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm md:p-6"><div className="mb-5 flex items-start justify-between"><div><div className="flex items-center gap-2"><h2 className="text-base font-extrabold tracking-tight">City surface</h2><SourceBadge source="estimated" /></div><p className="mt-1 text-xs text-muted-foreground">IDW estimate cells are shown as a separate layer from stations.</p></div><Link href="/map" className="flex items-center gap-1 text-xs font-bold text-primary" data-testid="link-view-full-map">View full map <ChevronRight className="h-3.5 w-3.5" /></Link></div><MiniMap stations={stations} hotspots={hotspots} cells={grid?.cells ?? []} /></section><section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm md:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-base font-extrabold tracking-tight">Signals to review</h2><p className="mt-1 text-xs text-muted-foreground">Detected from available measured data</p></div><Link href="/hotspots" className="text-xs font-bold text-primary" data-testid="link-all-hotspots">See all</Link></div>{hotspots.length ? <div className="space-y-3">{hotspots.slice(0, 4).map(h => <HotspotRow hotspot={h} key={h.id} />)}</div> : <EmptyState icon={ShieldCheck} title="No hotspots detected" description="No spike or persistent signals in the current demo window." />}</section></div><div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_.8fr]"><section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm md:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-base font-extrabold tracking-tight">Recent measured activity</h2><p className="mt-1 text-xs text-muted-foreground">Demo Monitoring Data · latest station readings · source retained</p></div><Clock3 className="h-4 w-4 text-muted-foreground" /></div><MeasurementTable measurements={measurements.slice(0, 6)} stations={stations} /></section><section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm md:p-6"><div className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /><h2 className="text-base font-extrabold tracking-tight">Data posture</h2></div><div className="mt-5 space-y-5"><div><div className="mb-2 flex justify-between text-xs"><span className="text-muted-foreground">Measured network</span><span className="font-mono font-medium">{summary?.measuredCount ?? 0} / {summary?.stationCount ?? 0}</span></div><div className="h-2 rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${summary?.stationCount ? ((summary.measuredCount / summary.stationCount) * 100) : 0}%` }} /></div></div><div><div className="mb-2 flex justify-between text-xs"><span className="text-muted-foreground">Estimated cells</span><span className="font-mono font-medium">{summary?.estimatedCellCount ?? grid?.cells.length ?? 0}</span></div><div className="flex h-11 items-center justify-between rounded-xl bg-secondary px-3"><span className="text-xs font-semibold">IDW interpolation</span><span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">not measured</span></div></div><p className="border-l-2 border-accent pl-3 text-xs leading-relaxed text-muted-foreground">Use estimates to explore spatial patterns, not as a replacement for a station reading.</p></div></section></div></>}</div>;
}

function OverviewDemo() {
  const { stations, hotspots, measurements, grid, isLoading, isError, retry } = useAirData();
  const [city, setCity] = useState<'Delhi NCR' | 'Kochi'>('Delhi NCR');
  const [liveAir, setLiveAir] = useState<LivePayload | null>(null);
  const [liveError, setLiveError] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/live-data?city=${city === 'Kochi' ? 'Kochi' : 'Delhi'}`).then(response => {
      if (!response.ok) throw new Error('Live request failed');
      return response.json() as Promise<LivePayload>;
    }).then(payload => { if (active) { setLiveAir(payload); setLiveError(false); } }).catch(() => { if (active) setLiveError(true); });
    return () => { active = false; };
  }, [city]);
  const isKochi = city === 'Kochi';
  const cityStations = stations.filter(station => isKochi ? station.latitude < 15 : station.latitude > 20);
  const stationIds = new Set(cityStations.map(station => station.id));
  const cityHotspots = hotspots.filter(hotspot => isKochi ? hotspot.latitude < 15 : hotspot.latitude > 20);
  const cityMeasurements = measurements.filter(measurement => stationIds.has(measurement.stationId));
  const cityCells = (grid?.cells ?? []).filter(cell => isKochi ? cell.latitude < 15 : cell.latitude > 20);
  const average = cityStations.length ? (cityStations.reduce((total, station) => total + station.pm25, 0) / cityStations.length).toFixed(1) : '—';
  const peak = cityStations.length ? Math.max(...cityStations.map(station => station.pm25)) : '—';
  const airHourly = liveAir?.air.value?.hourly;
  const currentHour = Math.max(0, (airHourly?.time ?? []).findIndex(time => String(time).slice(0, 13) === new Date().toISOString().slice(0, 13)));
  const livePm25 = airHourly?.pm2_5?.[currentHour] ?? '—';
  const livePm10 = airHourly?.pm10?.[currentHour] ?? '—';
  if (isError) return <div className="mx-auto max-w-7xl p-5 md:p-9"><ErrorState onRetry={retry} /></div>;
  return <div className="mx-auto max-w-7xl p-5 md:p-9">
    <PageTitle eyebrow="Operations overview" title={`${city}, in focus`} description="Demo monitoring data and IDW estimates for the selected city." action={<div className="flex flex-wrap items-center gap-2"><label className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold">City <select value={city} onChange={event => setCity(event.target.value as 'Delhi NCR' | 'Kochi')} className="ml-2 bg-transparent outline-none" data-testid="select-overview-city"><option>Delhi NCR</option><option>Kochi</option></select></label><Link href="/map" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"><MapIcon className="h-4 w-4" />Open map</Link></div>} />
    {isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div> : <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Average PM2.5" value={average} unit="µg/m³" detail={`Across ${city} stations`} icon={Activity} tone={Number(average) > 60 ? 'warn' : 'default'} /><MetricCard label="Peak PM2.5" value={peak} unit="µg/m³" detail="Highest measured reading" icon={ArrowUpRight} tone="hot" /><MetricCard label="Measured stations" value={cityStations.length} detail={`${city} demo network`} icon={Radio} /><MetricCard label="Detected hotspots" value={cityHotspots.length} detail="Spike + persistent signals" icon={Target} tone={cityHotspots.length ? 'warn' : 'default'} /></div><div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]"><section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm"><div className="mb-5 flex items-start justify-between"><div><h2 className="text-base font-extrabold">{city} surface</h2><p className="mt-1 text-xs text-muted-foreground">IDW estimate cells are kept separate from station readings.</p></div><SourceBadge source="estimated" /></div><MiniMap stations={cityStations} hotspots={cityHotspots} cells={cityCells} /></section><section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm"><h2 className="text-base font-extrabold">Signals to review</h2><div className="mt-5 space-y-3">{cityHotspots.length ? cityHotspots.map(hotspot => <HotspotRow hotspot={hotspot} key={hotspot.id} />) : <EmptyState icon={ShieldCheck} title="No hotspots detected" description="No current demo signal in this city." />}</div></section></div><section className="mt-6 rounded-2xl border border-card-border bg-card p-5 shadow-sm"><h2 className="text-base font-extrabold">Recent measured activity · {city}</h2><div className="mt-5"><MeasurementTable measurements={cityMeasurements.slice(0, 6)} stations={cityStations} /></div></section></>}</div>;
}

function Overview() {
  const { stations, hotspots, measurements, grid, isLoading, isError, retry } = useAirData();
  const [city, setCity] = useState<'Delhi NCR' | 'Kochi'>('Delhi NCR');
  const [liveAir, setLiveAir] = useState<LivePayload | null>(null);
  const [liveError, setLiveError] = useState(false);
  const isKochi = city === 'Kochi';
  const cityStations = stations.filter(station => isKochi ? station.latitude < 15 : station.latitude > 20);
  const stationIds = new Set(cityStations.map(station => station.id));
  const cityHotspots = hotspots.filter(hotspot => isKochi ? hotspot.latitude < 15 : hotspot.latitude > 20);
  const cityMeasurements = measurements.filter(measurement => stationIds.has(measurement.stationId));
  const cityCells = (grid?.cells ?? []).filter(cell => isKochi ? cell.latitude < 15 : cell.latitude > 20);
  useEffect(() => {
    let active = true;
    fetch(`/api/live-data?city=${isKochi ? 'Kochi' : 'Delhi'}`).then(response => {
      if (!response.ok) throw new Error('Live request failed');
      return response.json() as Promise<LivePayload>;
    }).then(payload => { if (active) { setLiveAir(payload); setLiveError(false); } }).catch(() => { if (active) setLiveError(true); });
    return () => { active = false; };
  }, [isKochi]);
  const hourly = liveAir?.air.value?.hourly;
  const index = Math.max(0, (hourly?.time ?? []).findIndex(time => String(time).slice(0, 13) === new Date().toISOString().slice(0, 13)));
  const pm25 = hourly?.pm2_5?.[index] ?? '—';
  const pm10 = hourly?.pm10?.[index] ?? '—';
  if (isError) return <div className="mx-auto max-w-7xl p-5 md:p-9"><ErrorState onRetry={retry} /></div>;
  return <div className="mx-auto max-w-7xl p-5 md:p-9"><PageTitle eyebrow="Operations overview" title={`${city}, in focus`} description="Live API values are modelled and distinct from the demo monitoring and estimation layers below." action={<label className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold">City <select value={city} onChange={event => setCity(event.target.value as 'Delhi NCR' | 'Kochi')} className="ml-2 bg-transparent outline-none" data-testid="select-overview-city"><option>Delhi NCR</option><option>Kochi</option></select></label>} />{isLoading ? <Skeleton className="h-40" /> : <><div className="mb-5 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm"><span className="font-bold">Current API values:</span> Open-Meteo modelled concentrations for {city}, not measured stations. {liveError && <span className="text-destructive">Live data unavailable — showing last successful fetch when available.</span>}</div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Live PM2.5" value={pm25} unit="µg/m³" detail="Open-Meteo · modelled" icon={Activity} /><MetricCard label="Live PM10" value={pm10} unit="µg/m³" detail="Open-Meteo · modelled" icon={Cloud} /><MetricCard label="Demo stations" value={cityStations.length} detail={`${city} seeded network`} icon={Radio} /><MetricCard label="Demo hotspots" value={cityHotspots.length} detail="Seeded signals" icon={Target} tone={cityHotspots.length ? 'warn' : 'default'} /></div><div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]"><section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm"><h2 className="text-base font-extrabold">{city} demo surface</h2><p className="mt-1 text-xs text-muted-foreground">IDW estimate cells, station markers and hotspots are deterministic demo data.</p><div className="mt-5"><MiniMap stations={cityStations} hotspots={cityHotspots} cells={cityCells} /></div></section><section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm"><h2 className="text-base font-extrabold">Demo signals</h2><div className="mt-5 space-y-3">{cityHotspots.length ? cityHotspots.map(hotspot => <HotspotRow hotspot={hotspot} key={hotspot.id} />) : <EmptyState icon={ShieldCheck} title="No demo hotspots" description="No seeded signals in this city." />}</div></section></div><section className="mt-6 rounded-2xl border border-card-border bg-card p-5 shadow-sm"><h2 className="text-base font-extrabold">Recent demo station readings</h2><div className="mt-5"><MeasurementTable measurements={cityMeasurements.slice(0, 6)} stations={cityStations} /></div></section></>}</div>;
}

function HotspotRow({ hotspot }: { hotspot: Hotspot }) {
  return <Link href="/hotspots" className="group flex items-center gap-3 rounded-xl border border-border/80 p-3 transition-colors hover:bg-secondary" data-testid={`card-hotspot-${hotspot.id}`}><span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', hotspot.severity === 'critical' ? 'bg-destructive/10 text-destructive' : 'bg-accent/25 text-foreground')}><Target className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{hotspot.area}</span><span className="mt-0.5 block text-xs text-muted-foreground">{hotspot.kind} · {hotspot.pollutant}</span></span><span className="text-right"><span className="block font-mono text-sm font-medium">{hotspot.value}</span><span className="block text-[10px] uppercase text-muted-foreground">{hotspot.severity}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></Link>;
}

function MeasurementTable({ measurements, stations }: { measurements: Measurement[]; stations: Station[] }) {
  const stationName = (id: string) => stations.find(s => s.id === id)?.name ?? id;
  if (!measurements.length) return <EmptyState icon={Radio} title="No measured activity yet" description="Station readings will appear when the demo feed returns measurements." />;
  return <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left text-sm"><thead><tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground"><th className="pb-3 font-semibold">Station</th><th className="pb-3 font-semibold">Pollutant</th><th className="pb-3 font-semibold">Reading</th><th className="pb-3 font-semibold">Time</th><th className="pb-3 text-right font-semibold">Source</th></tr></thead><tbody className="divide-y divide-border/70">{measurements.map((m, i) => <tr key={`${m.stationId}-${m.timestamp}-${i}`} data-testid={`row-measurement-${i}`}><td className="py-3 font-semibold">{stationName(m.stationId)}</td><td className="py-3"><span className="rounded bg-secondary px-1.5 py-1 font-mono text-[10px]">{m.pollutant}</span></td><td className="py-3 font-mono">{m.value} <span className="font-sans text-xs text-muted-foreground">{m.unit}</span></td><td className="py-3 text-xs text-muted-foreground">{formatShortTime(m.timestamp)}</td><td className="py-3 text-right"><SourceBadge source={m.source} /></td></tr>)}</tbody></table></div>;
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof Activity; title: string; description: string }) {
  return <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-8 text-center" data-testid="state-empty"><Icon className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><p className="text-sm font-bold">{title}</p><p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{description}</p></div>;
}

function MapWorkspace() {
  const { stations, hotspots, grid, isLoading, isError, retry } = useAirData();
  const [pollutant, setPollutant] = useState<GetPredictionGridParams['pollutant']>('PM25');
  const gridQuery = useGetPredictionGrid({ pollutant }, { query: { queryKey: getGetPredictionGridQueryKey({ pollutant }) } });
  const [, navigate] = useLocation();
  return <div className="mx-auto max-w-[1500px] p-5 md:p-8"><PageTitle eyebrow="Spatial workspace" title="Map the signal, then check the source." description="A pannable India-wide map for measured stations, interpolated cells, and detected hotspots. Layers are deliberately labeled." action={<div className="flex items-center gap-2"><label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold"><SlidersHorizontal className="h-4 w-4 text-muted-foreground" /><select value={pollutant} onChange={e => setPollutant(e.target.value as GetPredictionGridParams['pollutant'])} className="bg-transparent font-mono text-xs outline-none" data-testid="select-map-pollutant"><option value="PM25">PM2.5</option><option value="PM10">PM10</option><option value="NO2">NO₂</option><option value="O3">O₃</option></select></label></div>} />{isError ? <ErrorState onRetry={retry} /> : isLoading ? <Skeleton className="h-[660px]" /> : <div className="grid gap-5 xl:grid-cols-[1fr_320px]"><div className="rounded-2xl border border-card-border bg-card p-2 shadow-sm md:p-3"><AirGridMap stations={stations} hotspots={hotspots} grid={gridQuery.data ?? grid} onStationSelect={(stationId) => navigate(`/location/${stationId}`)} /></div><aside className="space-y-4"><div className="rounded-2xl border border-card-border bg-card p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-extrabold">Layer key</h2><ScanLine className="h-4 w-4 text-primary" /></div><div className="mt-5 space-y-4"><div className="flex items-start gap-3"><span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"><Radio className="h-3.5 w-3.5" /></span><div><p className="text-sm font-bold">Measured stations</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Direct readings from monitoring locations. This is the observation layer.</p></div></div><div className="flex items-start gap-3"><span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-accent/40 text-foreground"><Layers3 className="h-3.5 w-3.5" /></span><div><p className="text-sm font-bold">IDW estimate cells</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">A spatial estimate between stations, weighted by proximity.</p></div></div><div className="flex items-start gap-3"><span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-destructive/10 text-destructive"><Target className="h-3.5 w-3.5" /></span><div><p className="text-sm font-bold">Detected hotspots</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Signals against a local baseline. Review before acting.</p></div></div></div></div><div className="rounded-2xl border border-card-border bg-card p-5 shadow-sm"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Current estimate</p><p className="mt-2 text-lg font-extrabold">{gridQuery.data?.pollutant ?? pollutant} · {gridQuery.data?.unit ?? 'µg/m³'}</p><div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-xs"><span className="text-muted-foreground">Method</span><span className="font-mono uppercase">{gridQuery.data?.method ?? 'IDW'}</span></div><div className="mt-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">Generated</span><span className="font-mono">{formatDate(gridQuery.data?.generatedAt)}</span></div><p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">Estimated values are not measurements. Data Quality Score reflects proximity and recency, not a statistical guarantee.</p></div><Link href="/hotspots" className="flex items-center justify-between rounded-2xl bg-sidebar p-4 text-sidebar-foreground" data-testid="link-map-hotspots"><span><span className="block text-sm font-bold">Review hotspot signals</span><span className="mt-1 block text-xs text-sidebar-foreground/55">{hotspots.length} detected in current window</span></span><ChevronRight className="h-4 w-4 text-sidebar-primary" /></Link></aside></div>}</div>;
}

function LocationDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const query = useGetStation(id, { query: { enabled: Boolean(id), queryKey: getGetStationQueryKey(id) } });
  const { stations, hotspots } = useAirData();
  const detail = query.data;
  const station = detail?.station;
  const nearby = stations.filter(s => s.id !== station?.id).slice(0, 3);
  if (query.isLoading) return <div className="mx-auto max-w-7xl p-5 md:p-9"><Skeleton className="h-8 w-56" /><Skeleton className="mt-4 h-20 w-full" /><Skeleton className="mt-6 h-64 w-full" /></div>;
  if (query.isError || !station) return <div className="mx-auto max-w-7xl p-5 md:p-9"><ErrorState label="Station detail could not be loaded" onRetry={() => void query.refetch()} /></div>;
  const stationHotspot = hotspots.find(h => h.area === station.area);
  return <div className="mx-auto max-w-7xl p-5 md:p-9"><Link href="/map" className="mb-7 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground" data-testid="link-back-map"><ArrowDownRight className="h-3.5 w-3.5 rotate-45" />Back to map workspace</Link><PageTitle eyebrow="Station detail" title={station.name} description={`${station.area} · ${station.latitude.toFixed(4)}, ${station.longitude.toFixed(4)}`} action={<div className="flex items-center gap-2"><span className={cx('rounded-full px-3 py-1.5 text-xs font-bold', station.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-accent/30 text-foreground')}>{station.status === 'active' ? 'Active feed' : 'Delayed feed'}</span><QualityBadge score={station.dataQualityScore} /></div>} /><div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]"><section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm md:p-6"><div className="flex items-center justify-between"><div><h2 className="text-base font-extrabold">Latest observed values</h2><p className="mt-1 text-xs text-muted-foreground">All values below are measured at this station.</p></div><SourceBadge /></div><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['PM2.5', station.pm25, 'µg/m³'], ['PM10', station.pm10, 'µg/m³'], ['NO₂', station.no2, 'ppb'], ['O₃', station.o3, 'ppb']].map(([label, value, unit]) => <div key={String(label)} className="rounded-xl bg-secondary p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-extrabold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{unit}</p></div>)}</div><div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs"><span className="text-muted-foreground">Last updated</span><span className="font-mono">{formatDate(station.lastUpdated)}</span></div></section><section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm md:p-6"><div className="flex items-center gap-2"><Crosshair className="h-4 w-4 text-primary" /><h2 className="text-base font-extrabold">Nearby context</h2></div><p className="mt-1 text-xs text-muted-foreground">Useful for orientation, not a substitute for local measurement.</p><div className="mt-5 rounded-xl border border-border bg-secondary/50 p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Local signal</p><p className="mt-2 text-sm font-bold">{stationHotspot ? `${stationHotspot.kind} signal near ${stationHotspot.area}` : 'No hotspot signal mapped to this area'}</p>{stationHotspot && <div className="mt-3 flex items-center justify-between text-xs"><span className="text-muted-foreground">Observed against baseline</span><span className="font-mono">{stationHotspot.value} / {stationHotspot.baseline}</span></div>}</div><div className="mt-5 space-y-2">{nearby.map(s => <Link href={`/location/${s.id}`} key={s.id} className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2.5 hover:bg-secondary" data-testid={`link-nearby-${s.id}`}><span><span className="block text-xs font-bold">{s.name}</span><span className="block text-[11px] text-muted-foreground">{s.area}</span></span><span className="font-mono text-xs">{s.pm25} µg/m³</span></Link>)}</div></section></div><section className="mt-6 rounded-2xl border border-card-border bg-card p-5 shadow-sm md:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-base font-extrabold">Recent measurements</h2><p className="mt-1 text-xs text-muted-foreground">Station feed · latest available readings</p></div><Activity className="h-4 w-4 text-primary" /></div><MeasurementTable measurements={detail.recentMeasurements} stations={[station]} /></section></div>;
}

function HistoryChart({ history, pollutant }: { history: HistoricalMeasurement[]; pollutant: 'PM25' | 'PM10' }) {
  const data = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour: `${String(hour).padStart(2, '0')}:00`, total: 0, count: 0 }));
    history.forEach((reading) => {
      const hour = new Date(reading.timestamp).getUTCHours();
      buckets[hour].total += pollutant === 'PM25' ? reading.pm25 : reading.pm10;
      buckets[hour].count += 1;
    });
    return buckets.map((bucket) => ({ ...bucket, value: bucket.count ? Number((bucket.total / bucket.count).toFixed(1)) : 0 }));
  }, [history, pollutant]);

  return <div className="h-64 w-full" data-testid="chart-historical-pattern"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}><CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="hour" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} interval={3} axisLine={false} tickLine={false} /><YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} /><ChartTooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 700 }} formatter={(value: number) => [`${value} µg/m³`, pollutant === 'PM25' ? 'PM2.5 average' : 'PM10 average']} /><Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ fill: 'hsl(var(--primary))', r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div>;
}

function Forecast() {
  const { stations, isLoading } = useAirData();
  const [selected, setSelected] = useState<'PM25' | 'PM10'>('PM25');
  const gridQuery = useGetPredictionGrid({ pollutant: selected }, { query: { queryKey: getGetPredictionGridQueryKey({ pollutant: selected }) } });
  const historyQuery = useListHistoricalMeasurements(undefined, { query: { queryKey: getListHistoricalMeasurementsQueryKey() } });
  const forecastRows = useMemo(() => stations.slice(0, 5).map((station, index) => {
    const now = selected === 'PM25' ? station.pm25 : station.pm10;
    const next = Math.max(12, Math.round(now + (index % 2 ? 5 : -3)));
    return { station, now, next, confidence: Math.max(42, station.dataQualityScore - 9) };
  }), [stations, selected]);
  return <div className="mx-auto max-w-7xl p-5 md:p-9"><PageTitle eyebrow="Prototype forecast" title="A forward look, clearly caveated." description="Seven days of deterministic demo history reveal the daily pattern behind this directional estimate. It is not a real-time forecast or official advisory." action={<div className="flex items-center gap-2 rounded-xl border border-accent/50 bg-accent/15 px-3 py-2 text-xs font-bold"><Sparkles className="h-4 w-4" />Prototype only</div>} /><div className="rounded-2xl border border-accent/40 bg-accent/10 p-4 text-sm leading-relaxed text-foreground"><span className="font-bold">Interpretation guardrail:</span> if this estimate is accurate, the projected direction can help prioritize a follow-up check. It does not replace a measured reading or confirm future conditions.</div><div className="mt-6 flex gap-2 overflow-x-auto pb-1">{(['PM25', 'PM10'] as const).map(p => <button key={p} onClick={() => setSelected(p)} className={cx('shrink-0 rounded-lg border px-4 py-2 text-xs font-bold transition-colors', selected === p ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-secondary')} data-testid={`button-forecast-${p}`}>{p === 'PM25' ? 'PM2.5' : 'PM10'}</button>)}</div>{isLoading ? <Skeleton className="mt-5 h-72" /> : <><section className="mt-5 rounded-2xl border border-card-border bg-card p-5 shadow-sm md:p-6"><div className="mb-4 flex items-start justify-between"><div><h2 className="text-base font-extrabold">Historical daily pattern</h2><p className="mt-1 text-xs text-muted-foreground">Average by hour across 7 days · deterministic seed 42</p></div><SourceBadge /></div>{historyQuery.isLoading ? <Skeleton className="h-64" /> : historyQuery.isError ? <ErrorState label="Historical demo data could not be loaded" onRetry={() => void historyQuery.refetch()} /> : <HistoryChart history={historyQuery.data ?? []} pollutant={selected} />}<p className="mt-3 text-xs text-muted-foreground">Demo Monitoring Data · the morning rise, midday plateau, evening rise, and overnight decline are intentionally seeded patterns.</p></section><div className="mt-5 grid gap-6 xl:grid-cols-[1fr_340px]"><section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm md:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-base font-extrabold">Next interval estimate</h2><p className="mt-1 text-xs text-muted-foreground">Directional prototype by monitoring location</p></div><SourceBadge source="forecast" /></div><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground"><th className="pb-3">Station</th><th className="pb-3">Now · measured</th><th className="pb-3">Next · estimated</th><th className="pb-3">Data quality</th><th className="pb-3 text-right">Direction</th></tr></thead><tbody className="divide-y divide-border/70">{forecastRows.map(({ station, now, next, confidence }) => <tr key={station.id} data-testid={`row-forecast-${station.id}`}><td className="py-4"><Link href={`/location/${station.id}`} className="font-bold hover:text-primary">{station.name}</Link><span className="block text-[11px] text-muted-foreground">{station.area}</span></td><td className="py-4 font-mono">{now} <span className="font-sans text-xs text-muted-foreground">µg/m³</span></td><td className="py-4 font-mono font-bold">{next} <span className="font-sans text-xs text-muted-foreground">µg/m³</span></td><td className="py-4"><QualityBadge score={confidence} compact /></td><td className="py-4 text-right">{next > now ? <ArrowUpRight className="ml-auto h-4 w-4 text-destructive" /> : <ArrowDownRight className="ml-auto h-4 w-4 text-primary" />}</td></tr>)}</tbody></table></div></section><aside className="rounded-2xl border border-card-border bg-card p-5 shadow-sm"><div className="flex items-center gap-2"><Cloud className="h-4 w-4 text-primary" /><h2 className="text-base font-extrabold">Model note</h2></div><p className="mt-4 text-sm leading-relaxed text-muted-foreground">The prototype carries current station context into a simple directional estimate. It does not incorporate weather, emissions inventories, or a validated temporal model.</p><div className="mt-5 border-t border-border pt-5 text-xs"><div className="flex justify-between"><span className="text-muted-foreground">Surface source</span><span className="font-mono">{gridQuery.data?.method?.toUpperCase() ?? 'IDW'}</span></div><div className="mt-3 flex justify-between"><span className="text-muted-foreground">Generated</span><span className="font-mono">{formatDate(gridQuery.data?.generatedAt)}</span></div></div></aside></div></>}</div>;
}

function Hotspots() {
  const { hotspots, isLoading, isError, retry } = useAirData();
  const [filter, setFilter] = useState<'all' | 'spike' | 'persistent'>('all');
  const filtered = hotspots.filter(h => filter === 'all' || h.kind === filter);
  return <div className="mx-auto max-w-7xl p-5 md:p-9"><PageTitle eyebrow="Signal review" title="Hotspots worth a closer look." description="Signals detected from measured readings and local baselines. A hotspot is a prompt for investigation, not a conclusion." action={<div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">{(['all', 'spike', 'persistent'] as const).map(f => <button key={f} onClick={() => setFilter(f)} className={cx('rounded-lg px-3 py-2 text-xs font-bold capitalize', filter === f ? 'bg-secondary text-foreground' : 'text-muted-foreground')} data-testid={`button-filter-${f}`}>{f}</button>)}</div>} />{isError ? <ErrorState onRetry={retry} /> : isLoading ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div> : filtered.length ? <div className="grid gap-4 md:grid-cols-2">{filtered.map(h => <HotspotCard key={h.id} hotspot={h} />)}</div> : <EmptyState icon={ShieldCheck} title="No matching hotspots" description="Try another filter or check again when the demo window updates." />}</div>;
}

function HotspotCard({ hotspot }: { hotspot: Hotspot }) {
  const delta = Math.round(((hotspot.value - hotspot.baseline) / hotspot.baseline) * 100);
  return <article className="rounded-2xl border border-card-border bg-card p-5 shadow-sm transition-transform hover:-translate-y-0.5" data-testid={`card-hotspot-detail-${hotspot.id}`}><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><span className={cx('flex h-10 w-10 items-center justify-center rounded-xl', hotspot.severity === 'critical' ? 'bg-destructive/10 text-destructive' : 'bg-accent/25 text-foreground')}><Target className="h-5 w-5" /></span><div><h2 className="font-extrabold">{hotspot.area}</h2><p className="mt-0.5 text-xs text-muted-foreground">{hotspot.pollutant} · {hotspot.kind} signal</p></div></div><span className={cx('rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider', hotspot.severity === 'critical' ? 'bg-destructive/10 text-destructive' : 'bg-accent/25 text-foreground')}>{hotspot.severity}</span></div><div className="mt-6 grid grid-cols-3 gap-3"><div className="rounded-lg bg-secondary p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Observed</p><p className="mt-1 font-mono text-lg font-bold">{hotspot.value}</p></div><div className="rounded-lg bg-secondary p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Baseline</p><p className="mt-1 font-mono text-lg font-bold">{hotspot.baseline}</p></div><div className="rounded-lg bg-secondary p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Delta</p><p className="mt-1 flex items-center gap-1 font-mono text-lg font-bold text-destructive"><ArrowUpRight className="h-4 w-4" />{delta}%</p></div></div><div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs"><span className="text-muted-foreground">Detected {formatDate(hotspot.detectedAt)}</span><Link href={`/map`} className="inline-flex items-center gap-1 font-bold text-primary" data-testid={`link-hotspot-map-${hotspot.id}`}>View on map <ExternalLink className="h-3 w-3" /></Link></div></article>;
}

function Validation() {
  const query = useGetValidationStatus({ query: { queryKey: getGetValidationStatusQueryKey() } });
  const status = query.data;
  return <div className="mx-auto max-w-5xl p-5 md:p-9"><PageTitle eyebrow="Validation boundary" title="Keep the benchmark honest." description="Real historical data stays separate from deterministic demo data. This page never fabricates validation metrics when a real CSV is missing." action={<span className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold">Held-out split required</span>} />{query.isLoading ? <Skeleton className="h-80" /> : query.isError ? <ErrorState label="Validation status could not be loaded" onRetry={() => void query.refetch()} /> : status?.status === 'loaded' ? <div className="space-y-5"><section className="rounded-2xl border border-primary/25 bg-primary/5 p-6"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">{status.datasetLabel}</p><h2 className="mt-3 text-2xl font-extrabold">Real held-out results</h2><p className="mt-2 text-sm text-muted-foreground">{status.message}</p></section><div className="grid gap-4 sm:grid-cols-3">{[['MAE', status.mae], ['RMSE', status.rmse], ['R²', status.r2]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-card-border bg-card p-5 shadow-sm"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-extrabold">{value ?? '—'}</p></div>)}</div><div className="rounded-2xl border border-card-border bg-card p-5 text-sm text-muted-foreground">Dataset rows: <strong className="text-foreground">{status.rowCount}</strong> · training reference: <strong className="text-foreground">{status.trainingRows}</strong> · held-out validation: <strong className="text-foreground">{status.validationRows}</strong></div></div> : <section className="rounded-2xl border border-accent/50 bg-accent/10 p-6 md:p-8"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/30 text-foreground"><Database className="h-5 w-5" /></div><p className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">Validation — real historical data</p><h2 className="mt-3 text-2xl font-extrabold">No real validation dataset loaded yet</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">AirGrid is intentionally not showing made-up MAE, RMSE, or R² values. Add a CSV at <span className="rounded bg-card px-1.5 py-1 font-mono text-xs text-foreground">backend/data/real_historical.csv</span> with a timestamp and PM2.5 or PM10 column, then reload this page.</p><div className="mt-6 grid gap-3 text-sm sm:grid-cols-3"><div className="rounded-xl border border-border bg-card/70 p-4"><p className="font-bold text-foreground">1 · Upload</p><p className="mt-1 text-xs text-muted-foreground">Bring your historical export into the expected path.</p></div><div className="rounded-xl border border-border bg-card/70 p-4"><p className="font-bold text-foreground">2 · Split</p><p className="mt-1 text-xs text-muted-foreground">The first 80% is reference; the final 20% stays held out.</p></div><div className="rounded-xl border border-border bg-card/70 p-4"><p className="font-bold text-foreground">3 · Compare</p><p className="mt-1 text-xs text-muted-foreground">Metrics are computed only against held-out actuals.</p></div></div></section>}</div>;
}

function About() {
  const { summary } = useAirData();
  return <div className="mx-auto max-w-4xl p-5 md:p-12"><p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Scope & method</p><h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-[-0.05em] sm:text-6xl">Make the gap between data and certainty visible.</h1><p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">AirGrid is a geospatial intelligence prototype for city air-quality teams working with sparse monitoring networks.</p><section className="mt-12 rounded-2xl border border-primary/25 bg-primary/5 p-6 md:p-8"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Positioning statement</p><blockquote className="mt-4 text-xl font-bold leading-relaxed tracking-tight text-foreground md:text-2xl">“{summary?.positioningStatement ?? 'AirGrid turns sparse monitoring station data into a transparent pollution map and always distinguishes what was measured from what was estimated.'}”</blockquote></section><div className="mt-10 grid gap-5 md:grid-cols-2"><section className="rounded-2xl border border-card-border bg-card p-6"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary"><Radio className="h-4 w-4" /></div><h2 className="mt-5 text-lg font-extrabold">Measured stays measured</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Station markers and reading tables preserve the source of every observation. Measured values come from the available demo monitoring feed.</p></section><section className="rounded-2xl border border-card-border bg-card p-6"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/30 text-foreground"><Layers3 className="h-4 w-4" /></div><h2 className="mt-5 text-lg font-extrabold">Estimates stay labeled</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">The IDW surface fills space between stations to make patterns easier to inspect. It is not a measured map and its quality score is not a statistical guarantee.</p></section><section className="rounded-2xl border border-card-border bg-card p-6"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary"><Target className="h-4 w-4" /></div><h2 className="mt-5 text-lg font-extrabold">Signals invite review</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Hotspots compare available readings with a local baseline. They help teams decide where to look next, not what action is automatically correct.</p></section><section className="rounded-2xl border border-card-border bg-card p-6"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary"><ShieldCheck className="h-4 w-4" /></div><h2 className="mt-5 text-lg font-extrabold">Prototype boundaries</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">This demo is not official, CPCB, or real-time. Any recommendation is conditional on the estimate being accurate and should be checked against a measured reading.</p></section></div><div className="mt-10 border-t border-border pt-5 text-xs text-muted-foreground"><span className="font-mono">AIRGRID / DEMO DATA / TRANSPARENT BY DESIGN</span></div></div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch><Route path="/" component={Overview} /><Route path="/map" component={MapWorkspace} /><Route path="/live" component={LiveData} /><Route path="/location/:id" component={LocationDetail} /><Route path="/forecast" component={Forecast} /><Route path="/hotspots" component={Hotspots} /><Route path="/validation" component={Validation} /><Route path="/about" component={About} /><Route component={NotFound} /></Switch></Shell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
