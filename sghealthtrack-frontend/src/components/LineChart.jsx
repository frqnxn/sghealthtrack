import React from "react";

function normalizeSeries(data) {
  if (!Array.isArray(data) || data.length === 0) return [];
  return data.filter((d) => d && Number.isFinite(d.value));
}

export function LineChart({ data, color = "#0f766e", height = 120, showDots = true }) {
  const series = normalizeSeries(data);
  if (series.length === 0) {
    return <div className="chart-empty">No data available</div>;
  }

  const values = series.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pointCount = series.length;
  const toX = (idx) => (pointCount === 1 ? 50 : (idx / (pointCount - 1)) * 100);
  const toY = (val) => 100 - ((val - min) / range) * 100;

  const points = series.map((d, idx) => ({ x: toX(idx), y: toY(d.value) }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${path} L 100 100 L 0 100 Z`;
  const firstLabel = series[0]?.label ?? "";
  const lastLabel = series[series.length - 1]?.label ?? "";

  return (
    <div className="line-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }}>
        <path d={areaPath} fill={color} opacity="0.12" />
        <path d={path} fill="none" stroke={color} strokeWidth="2" />
        {showDots &&
          points.map((p, idx) => (
            <circle key={idx} cx={p.x} cy={p.y} r="1.6" fill={color} />
          ))}
      </svg>
      <div className="line-chart-labels">
        <span>{firstLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  );
}
