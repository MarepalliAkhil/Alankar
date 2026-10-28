import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface LinePoint {
  label: string;
  value: number | null;
}

export interface LineChartViewProps {
  data: readonly LinePoint[];
  /** Plain-language name of the chart, read by screen readers. */
  title: string;
  valueLabel: string;
  /** Fixed value axis, for example [1, 5] for star ratings. */
  domain?: [number, number];
}

/** Recharts line wrapper, next to BarChartView. Colours come from the design tokens. */
export default function LineChartView({ data, title, valueLabel, domain }: LineChartViewProps) {
  return (
    <div role="img" aria-label={title} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data as LinePoint[]} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            width={56}
            domain={domain ?? ['auto', 'auto']}
          />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            name={valueLabel}
            stroke="var(--color-primary)"
            strokeWidth={2}
            connectNulls
            dot
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
