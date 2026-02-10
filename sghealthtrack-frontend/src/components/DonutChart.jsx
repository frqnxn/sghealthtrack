import React from "react";

export function DonutChart({ value, max = 100, label = "", unit = "", color = "#0f766e", size = 140, stroke = 12 }) {
  if (value == null || !Number.isFinite(value)) {
    return <div className="chart-empty">No data available</div>;
  }

  const safeMax = Number.isFinite(max) && max > 0 ? max : value || 1;
  const percent = Math.min(100, Math.round((value / safeMax) * 100));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percent / 100);

  return (
    <div className="donut-chart" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="donut-center">
        <div className="donut-value">
          {value}
          {unit}
        </div>
        <div className="donut-label">{label}</div>
      </div>
    </div>
  );
}
