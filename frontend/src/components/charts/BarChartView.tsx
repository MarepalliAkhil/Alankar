import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface BarPoint {
  label: string;
  value: number;
  value2?: number;
}

export interface BarChartViewProps {
  data: readonly BarPoint[];
  /** Plain-language name of the chart, read by screen readers. */
  title: string;
  valueLabel: string;
  value2Label?: string;
}

/** The only place that talks to Recharts. Colours come from the design tokens (CSS variables). */
export default function BarChartView({ data, title, valueLabel, value2Label }: BarChartViewProps) {
  return (
    <div role="img" aria-label={title} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data as BarPoint[]} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} width={56} />
          <Tooltip />
          <Bar
            dataKey="value"
            name={valueLabel}
            fill="var(--color-primary)"
            radius={[4, 4, 0, 0]}
          />
          {value2Label && (
            <Bar
              dataKey="value2"
              name={value2Label}
              fill="var(--color-warning)"
              radius={[4, 4, 0, 0]}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
