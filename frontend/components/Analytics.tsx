import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { app } from "../state/store";
import { useApp, useT } from "../state/hooks";
import { locale } from "../lib/format";
import type { Analytics as Data, AnalyticsDays, EquipmentStatus, WindowStats } from "../state/types";
import { Icon } from "./common";

type T = ReturnType<typeof useT>;
const periods: AnalyticsDays[] = [7, 30, 90];
const statusOrder: EquipmentStatus[] = ["ACTIVE", "MAINTENANCE", "INACTIVE", "UNKNOWN"];
const slotKeys = ["slotNight", "slotDay", "slotEvening"] as const;

function useWidth<E extends HTMLElement>() {
  const ref = useRef<E>(null), [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current; if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Shared hover tooltip, positioned inside the chart's relative container. */
type Tip = { x: number; y: number; content: ReactNode } | null;
function Tooltip({ tip }: { tip: Tip }) {
  return tip ? <div className="viz-tooltip" role="presentation" style={{ left: tip.x, top: tip.y }}>{tip.content}</div> : null;
}

function DataTable({ t, head, rows }: { t: T; head: string[]; rows: Array<Array<string | number>> }) {
  return <details className="viz-table"><summary>{t("showTable")}</summary><div className="table-wrap"><table>
    <thead><tr>{head.map(cell => <th key={cell} scope="col">{cell}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => column === 0 ? <th key={column} scope="row">{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody>
  </table></div></details>;
}

function Panel({ id, title, hint, children }: { id: string; title: string; hint: string; children: ReactNode }) {
  return <section className="panel viz-panel" aria-labelledby={id + "-title"} id={id}><div className="section-title"><div><h2 id={id + "-title"}>{title}</h2><p className="muted">{hint}</p></div></div>{children}</section>;
}

function Kpi({ id, label, value, note, delta }: { id: string; label: string; value: string; note?: string; delta?: string }) {
  return <div className="kpi-tile" data-kpi={id}><span className="kpi-label">{label}</span><strong className="kpi-value">{value}</strong>
    {note && <span className="kpi-note">{note}</span>}{delta && <span className="kpi-delta">{delta}</span>}</div>;
}

function deltaText(t: T, number: Intl.NumberFormat, now: number, before: number, start = false) {
  const diff = Math.round((now - before) * 10) / 10;
  if (diff === 0) return t("deltaSame");
  const value = number.format(Math.abs(diff));
  return t((start ? "deltaStart" : "delta") + (diff > 0 ? "Up" : "Down"), { value });
}

function Kpis({ current, previous, comparable, t, number }: { current: WindowStats; previous: WindowStats; comparable: boolean; t: T; number: Intl.NumberFormat }) {
  const median = current.medianCloseHours;
  // When records do not cover the whole previous window (e.g. a young database) a comparison would mislead.
  const compare = comparable;
  const delta = (now: number, before: number, start = false) => compare ? { delta: deltaText(t, number, now, before, start) } : {};
  return <div className="kpi-row">
    <Kpi id="opened" label={t("kpiOpened")} value={number.format(current.opened)} note={t("kpiImportant", { count: current.important })} {...delta(current.opened, previous.opened)} />
    <Kpi id="closed" label={t("kpiClosed")} value={number.format(current.closed)} {...delta(current.closed, previous.closed)} />
    <Kpi id="median" label={t("kpiMedian")} value={median === null ? "—" : t("hoursShort", { value: number.format(median) })} note={median === null ? t("kpiNoData") : t("kpiMedianHint")}
      {...(median !== null && previous.medianCloseHours !== null ? delta(median, previous.medianCloseHours) : {})} />
    <Kpi id="backlog" label={t("kpiBacklog")} value={number.format(current.backlog)} {...delta(current.backlog, previous.backlog, true)} />
  </div>;
}

/** Smallest whole 1/2/5×10ⁿ step at or above the value, so axis ticks are integers. */
function niceStep(value: number) {
  if (value <= 1) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(value))), scaled = value / power;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
}

/** Sums daily points into 7-day buckets counted back from the last day. */
function weeks(daily: Data["daily"]) {
  const result: Array<{ day: string; end: string; opened: number; closed: number }> = [];
  for (let end = daily.length; end > 0; end -= 7) {
    const chunk = daily.slice(Math.max(0, end - 7), end);
    result.unshift({ day: chunk[0]!.day, end: chunk[chunk.length - 1]!.day,
      opened: chunk.reduce((sum, point) => sum + point.opened, 0), closed: chunk.reduce((sum, point) => sum + point.closed, 0) });
  }
  return result;
}

function Trend({ data, t, language }: { data: Data; t: T; language: "tr" | "en" }) {
  const [ref, width] = useWidth<HTMLDivElement>(), [hover, setHover] = useState<number | null>(null);
  const day = new Intl.DateTimeFormat(locale(language), { day: "numeric", month: "short", timeZone: "UTC" });
  // 90 daily points zigzag too much to read; group them into weeks ending today.
  const weekly = data.daily.length > 45;
  const points = weekly ? weeks(data.daily) : data.daily.map(point => ({ ...point, end: point.day })), height = 240, pad = { top: 16, right: 76, bottom: 30, left: 34 };
  const period = (point: { day: string; end: string }) => day.format(new Date(point.day + "T00:00:00Z")) + (point.end !== point.day ? " – " + day.format(new Date(point.end + "T00:00:00Z")) : "");
  const plotW = Math.max(0, width - pad.left - pad.right), plotH = height - pad.top - pad.bottom;
  const step = niceStep(Math.max(1, ...points.flatMap(point => [point.opened, point.closed])) / 4), max = step * 4;
  const x = (index: number) => pad.left + (points.length <= 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
  const y = (value: number) => pad.top + plotH - (value / max) * plotH;
  const ticks = [0, step, 2 * step, 3 * step, max];
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotW / 70))));
  const line = (key: "opened" | "closed") => points.map((point, index) => (index ? "L" : "M") + x(index).toFixed(1) + "," + y(point[key]).toFixed(1)).join("");
  const series = [{ key: "opened" as const, label: t("seriesOpened"), className: "viz-s1" }, { key: "closed" as const, label: t("seriesClosed"), className: "viz-s2" }];
  const last = points[points.length - 1];
  // Keep end labels apart when the two series finish close together.
  const ends = last ? (() => { let a = y(last.opened), b = y(last.closed); if (Math.abs(a - b) < 14) { const mid = (a + b) / 2; a = mid + (a <= b ? -7 : 7); b = mid + (a <= b ? 7 : -7); } return { opened: a, closed: b }; })() : null;
  const hovered = hover === null ? null : points[hover];
  const tip: Tip = hovered && hover !== null ? { x: Math.min(x(hover) + 12, Math.max(0, width - 170)), y: pad.top, content: <><strong>{period(hovered)}</strong>
    {series.map(item => <span key={item.key} className="viz-tip-row"><i className={"viz-key " + item.className} aria-hidden="true" />{item.label}<b>{hovered[item.key]}</b></span>)}</> } : null;
  return <>
    <ul className="viz-legend">{series.map(item => <li key={item.key}><i className={"viz-key " + item.className} aria-hidden="true" />{item.label}</li>)}</ul>
    <div className="viz-frame" ref={ref} onMouseLeave={() => setHover(null)}>
      {width > 0 && <svg width={width} height={height} role="img" aria-label={t("trendTitle")}
        onMouseMove={event => { const box = event.currentTarget.getBoundingClientRect(); const ratio = (event.clientX - box.left - pad.left) / Math.max(1, plotW); setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))))); }}>
        {ticks.map(tick => <g key={tick}><line className="viz-grid" x1={pad.left} x2={pad.left + plotW} y1={y(tick)} y2={y(tick)} /><text className="viz-axis" x={pad.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">{Math.round(tick)}</text></g>)}
        {points.map((point, index) => (index % labelEvery === 0 && points.length - 1 - index >= labelEvery / 2) || index === points.length - 1 ? <text key={point.day} className="viz-axis" x={x(index)} y={height - 8} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}>{day.format(new Date(point.day + "T00:00:00Z"))}</text> : null)}
        {hover !== null && <line className="viz-crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotH} />}
        {series.map(item => <path key={item.key} className={"viz-line " + item.className} d={line(item.key)} />)}
        {hovered && hover !== null && series.map(item => <circle key={item.key} className={"viz-dot " + item.className} cx={x(hover)} cy={y(hovered[item.key])} r={4.5} />)}
        {last && ends && series.map(item => <text key={item.key} className="viz-end-label" x={x(points.length - 1) + 8} y={ends[item.key]} dy="0.32em">{item.label} {last[item.key]}</text>)}
      </svg>}
      <Tooltip tip={tip} />
    </div>
    <DataTable t={t} head={[t("date"), t("seriesOpened"), t("seriesClosed")]} rows={points.map(point => [period(point), point.opened, point.closed])} />
  </>;
}

function Availability({ data, t, number }: { data: Data; t: T; number: Intl.NumberFormat }) {
  const [tip, setTip] = useState<Tip>(null);
  const percent = (value: number) => "%" + number.format(value);
  return <>
    <ul className="viz-legend">{statusOrder.map(status => <li key={status}><i className={"viz-key status-" + status} aria-hidden="true" />{t(status)}</li>)}</ul>
    <div className="viz-frame availability" onMouseLeave={() => setTip(null)}>
      {data.availability.map(unit => <div key={unit.code} className="availability-row" data-unit={unit.code}>
        <span className="availability-code">{unit.code}</span>
        <div className="availability-bar" role="img" aria-label={unit.code + ": " + statusOrder.filter(status => unit.share[status] > 0).map(status => t(status) + " " + percent(unit.share[status])).join(", ")}>
          {statusOrder.filter(status => unit.share[status] > 0).map(status => <span key={status} className={"availability-segment status-" + status} style={{ flexGrow: unit.share[status] }}
            onMouseMove={event => { const frame = event.currentTarget.closest(".viz-frame")!.getBoundingClientRect(); setTip({ x: Math.min(event.clientX - frame.left + 12, frame.width - 180), y: event.clientY - frame.top + 14, content: <><strong>{unit.code}</strong><span className="viz-tip-row"><i className={"viz-key status-" + status} aria-hidden="true" />{t(status)}<b>{percent(unit.share[status])}</b></span></> }); }} />)}
        </div>
        <span className="availability-value"><strong>{percent(unit.share.ACTIVE)}</strong><small>{t("transitions", { count: unit.transitions })}</small></span>
      </div>)}
      <Tooltip tip={tip} />
    </div>
    <DataTable t={t} head={[t("unitCode"), ...statusOrder.map(status => t(status))]} rows={data.availability.map(unit => [unit.code, ...statusOrder.map(status => percent(unit.share[status]))])} />
  </>;
}

function Bars({ items, t, label }: { items: Array<{ key: string; label: string; count: number }>; t: T; label: string }) {
  const max = Math.max(1, ...items.map(item => item.count));
  if (!items.length) return <p className="overview-empty">{t("emptyChart")}</p>;
  return <>
    <ul className="hbar-list" aria-label={label}>{items.map(item => <li key={item.key} className="hbar-row" title={item.label + ": " + item.count}>
      <span className="hbar-label">{item.label}</span>
      <span className="hbar-track">{item.count > 0 && <span className="hbar-fill" style={{ width: (item.count / max) * 100 + "%" }} />}</span>
      <strong className="hbar-value">{item.count}</strong>
    </li>)}</ul>
    <DataTable t={t} head={[label, t("count")]} rows={items.map(item => [item.label, item.count])} />
  </>;
}

// Sequential one-hue ramps per theme (light: pale to deep blue; dark: deep to pale blue).
const ramps = { light: ["#e3eefc", "#104281"], dark: ["#213049", "#86b6ef"] } as const;
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const luminance = (color: number[]) => color.map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
const contrast = (a: number[], b: number[]) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
/** Interpolated cell color plus whichever of white or near-black text reads better on it. */
function heatColor(level: number, theme: "light" | "dark") {
  const [low, high] = ramps[theme].map(rgb) as [number[], number[]];
  const color = low.map((c, i) => Math.round(c + (high[i]! - c) * level));
  // With pure black as the dark ink, the better of the two always clears 4.5:1 (worst case ≈4.58 at the crossover).
  const ink = contrast(color, [255, 255, 255]) >= contrast(color, [0, 0, 0]) ? "#fff" : "#000";
  return { background: `rgb(${color.join(",")})`, color: ink };
}
function Heatmap({ data, t, theme }: { data: Data; t: T; theme: "light" | "dark" }) {
  const days = t("weekdays").split(","), max = Math.max(1, ...data.heatmap.flat());
  return <>
    <div className="heatmap" role="table" aria-label={t("heatmapTitle")}>
      <div role="row" className="heatmap-row heatmap-head"><span role="columnheader" />{slotKeys.map(key => <span role="columnheader" key={key}>{t(key)}</span>)}</div>
      {data.heatmap.map((row, index) => <div role="row" className="heatmap-row" key={index}><span role="rowheader">{days[index]}</span>
        {row.map((count, slot) => { const cell = heatColor(count / max, theme); return <span role="cell" key={slot} className="heatmap-cell" title={`${days[index]} · ${t(slotKeys[slot]!)}: ${count}`}
          style={{ background: cell.background, color: cell.color }}>{count}</span>; })}
      </div>)}
    </div>
    <DataTable t={t} head={[t("weekday"), ...slotKeys.map(key => t(key))]} rows={data.heatmap.map((row, index) => [days[index] || "", ...row])} />
  </>;
}

export function Analytics() {
  const t = useT(), language = useApp(state => state.language), theme = useApp(state => state.theme), page = useApp(state => state.page), user = useApp(state => state.user);
  const data = useApp(state => state.analytics), days = useApp(state => state.analyticsDays), busy = useApp(state => state.analyticsBusy), stale = useApp(state => state.analyticsStale);
  useEffect(() => { if (user && page === "analytics" && !data) void app.loadAnalytics(); }, [user, page, data]);
  const number = new Intl.NumberFormat(locale(language), { maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(locale(language), { day: "numeric", month: "short", timeZone: "Europe/Istanbul" });
  return <div className="analytics">
    <div className="analytics-toolbar">
      <div className="segmented" role="radiogroup" aria-label={t("analyticsPeriod")}>{periods.map(value =>
        <button key={value} type="button" role="radio" aria-checked={days === value} data-days={value} disabled={busy && days === value} onClick={() => { void app.loadAnalytics(value); }}>{t("analyticsDays", { days: value })}</button>)}</div>
      <p className={"hint" + (stale ? " error" : "")} id="analytics-updated" role="status">{stale ? t("analyticsStale") : !data ? t("analyticsLoading") : t(data.comparable ? "analyticsUpdated" : "analyticsRange", { from: date.format(new Date(data.from)), to: date.format(new Date(data.to)), days: data.days })}</p>
      <button type="button" className="button quiet small" disabled={busy} onClick={() => { void app.loadAnalytics(); }}><Icon name="refresh" size={15} />{t("refresh")}</button>
    </div>
    {data && <div className={"analytics-body" + (busy ? " loading" : "")} aria-busy={busy}>
      <Kpis current={data.current} previous={data.previous} comparable={data.comparable} t={t} number={number} />
      <Panel id="analytics-trend" title={t("trendTitle")} hint={t(data.daily.length > 45 ? "trendHintWeekly" : "trendHint")}><Trend data={data} t={t} language={language} /></Panel>
      <div className="analytics-grid">
        <Panel id="analytics-availability" title={t("availabilityTitle")} hint={t("availabilityHint")}><Availability data={data} t={t} number={number} /></Panel>
        <Panel id="analytics-heatmap" title={t("heatmapTitle")} hint={t("heatmapHint")}><Heatmap data={data} t={t} theme={theme} /></Panel>
        <Panel id="analytics-aging" title={t("agingTitle")} hint={t("agingHint")}><Bars t={t} label={t("ageRange")} items={data.aging.map(bucket => ({ key: bucket.key, label: t(bucket.key), count: bucket.count }))} /></Panel>
        <Panel id="analytics-teams" title={t("teamsTitle")} hint={t("teamsHint")}><Bars t={t} label={t("team")} items={data.teams.map(team => ({ key: team.team || "-", label: team.team || t("noTeam"), count: team.count }))} /></Panel>
      </div>
    </div>}
  </div>;
}
