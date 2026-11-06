import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface HBarPoint {
  label: string;
  value: number;
}

export interface HBarViewProps {
  data: readonly HBarPoint[];
  title: string;
  valueLabel: string;
  format?: (value: number) => string;
}

/** Horizontal bars for ranked lists of up to ten items (long names stay readable on a phone). */
export default function HBarView({ data, title, valueLabel, format }: HBarViewProps) {
  const fmt = format ?? ((value: number) => String(value));
  return (
    <div role="img" aria-label={title} className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data as HBarPoint[]}
          margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            tickFormatter={fmt}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={104}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
          />
          <Tooltip formatter={(value: unknown) => fmt(Number(value))} />
          <Bar
            dataKey="value"
            name={valueLabel}
            fill="var(--color-primary)"
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
