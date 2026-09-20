"use client";

import { useMemo, useState } from "react";

import type { ChartPoint } from "@/lib/types";

type MetricKey = "blocks" | "txs" | "gasUsed" | "addresses";

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = Math.pow(10, exponent);
  const scaled = value / base;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * base;
}

function useChart(points: ChartPoint[], metric: MetricKey) {
  return useMemo(() => {
    const values = points.map((point) => Number(point[metric] ?? 0));
    const max = niceMax(Math.max(...values, 1));
    const width = 1000;
    const height = 260;
    const padX = 46;
    const padY = 16;
    const plotWidth = width - padX - 12;
    const plotHeight = height - padY - 30;
    const step = values.length > 1 ? plotWidth / (values.length - 1) : plotWidth;
    const coords = values.map((value, index) => ({
      x: padX + index * step,
      y: padY + plotHeight - (value / max) * plotHeight,
      value,
      label: points[index]?.label ?? "",
    }));
    return { values, max, width, height, padX, padY, plotWidth, plotHeight, coords };
  }, [points, metric]);
}

function Grid({ max, padY, plotHeight, width, padX }: ReturnType<typeof useChart>) {
  const lines = [0, 0.25, 0.5, 0.75, 1];
  return (
    <g>
      {lines.map((ratio) => {
        const y = padY + plotHeight - ratio * plotHeight;
        return (
          <g key={ratio}>
            <line
              x1={padX}
              x2={width - 12}
              y1={y}
              y2={y}
              stroke="#eef1f4"
              strokeWidth={1}
            />
            <text x={padX - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#98a2b3">
              {formatCompact(max * ratio)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2);
}

export function BarChart({
  points,
  metric,
  color = "#0784c3",
  unit = "",
}: {
  points: ChartPoint[];
  metric: MetricKey;
  color?: string;
  unit?: string;
}) {
  const chart = useChart(points, metric);
  const [hover, setHover] = useState<number | null>(null);
  const barWidth = Math.max(chart.plotWidth / Math.max(points.length, 1) - 2, 1);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-[260px] w-full">
        <Grid {...chart} />
        {chart.coords.map((coord, index) => {
          const height = Math.max(chart.padY + chart.plotHeight - coord.y, 0);
          return (
            <rect
              key={`${coord.x}-${index}`}
              x={coord.x - barWidth / 2}
              y={coord.y}
              width={barWidth}
              height={height}
              fill={hover === index ? "#0568a0" : color}
              opacity={0.9}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${coord.label}: ${coord.value.toLocaleString()} ${unit}`}</title>
            </rect>
          );
        })}
        <LabelAxis coords={chart.coords} padY={chart.padY} plotHeight={chart.plotHeight} />
      </svg>
      {hover !== null && chart.coords[hover] && (
        <div className="pointer-events-none absolute left-3 top-2 rounded border border-line bg-white/95 px-2 py-1 text-[11px] shadow">
          <span className="font-semibold text-ink-900">{chart.coords[hover].label}</span>
          <span className="ml-2 text-gray-600">
            {chart.coords[hover].value.toLocaleString()} {unit}
          </span>
        </div>
      )}
    </div>
  );
}

export function LineChart({
  points,
  metric,
  color = "#00a186",
  unit = "",
}: {
  points: ChartPoint[];
  metric: MetricKey;
  color?: string;
  unit?: string;
}) {
  const chart = useChart(points, metric);
  const [hover, setHover] = useState<number | null>(null);
  const line = chart.coords.map((coord) => `${coord.x},${coord.y}`).join(" ");
  const area = `${chart.padX},${chart.padY + chart.plotHeight} ${line} ${
    chart.coords.length ? chart.coords[chart.coords.length - 1].x : chart.padX
  },${chart.padY + chart.plotHeight}`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-[260px] w-full">
        <Grid {...chart} />
        <defs>
          <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {chart.coords.length > 0 && <polygon points={area} fill={`url(#grad-${metric})`} />}
        <polyline points={line} fill="none" stroke={color} strokeWidth={2} />
        {chart.coords.map((coord, index) => (
          <circle
            key={`${coord.x}-${index}`}
            cx={coord.x}
            cy={coord.y}
            r={hover === index ? 4 : 2.4}
            fill="#fff"
            stroke={color}
            strokeWidth={2}
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          >
            <title>{`${coord.label}: ${coord.value.toLocaleString()} ${unit}`}</title>
          </circle>
        ))}
        <LabelAxis coords={chart.coords} padY={chart.padY} plotHeight={chart.plotHeight} />
      </svg>
    </div>
  );
}

function LabelAxis({
  coords,
  padY,
  plotHeight,
}: {
  coords: ReturnType<typeof useChart>["coords"];
  padY: number;
  plotHeight: number;
}) {
  if (coords.length === 0) return null;
  const every = Math.max(Math.ceil(coords.length / 8), 1);
  return (
    <g>
      {coords.map((coord, index) =>
        index % every === 0 ? (
          <text
            key={`label-${coord.x}`}
            x={coord.x}
            y={padY + plotHeight + 20}
            textAnchor="middle"
            fontSize={11}
            fill="#98a2b3"
          >
            {coord.label}
          </text>
        ) : null,
      )}
    </g>
  );
}
