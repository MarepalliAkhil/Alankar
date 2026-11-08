import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface TrendPoint {
  day: string;
  chat: number;
  voice: number;
  rate: number | null;
}

/**
 * AIR conversations per day (chat and voice, stacked bars) with the handover rate as a line on
 * a second axis. Colours are the Okabe-Ito colour-blind-safe set; the line is also dashed so it
 * does not depend on colour. No animation (reduced motion and print).
 */
export default function ConversationTrendView({
  data,
  title,
}: {
  data: readonly TrendPoint[];
  title: string;
}) {
  return (
    <div role="img" aria-label={title} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data as TrendPoint[]}
          margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="day" tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} />
          <YAxis
            yAxisId="count"
            allowDecimals={false}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            width={40}
          />
          <YAxis
            yAxisId="rate"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            width={44}
          />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            yAxisId="count"
            dataKey="chat"
            name="Chat"
            stackId="c"
            fill="var(--chart-cb-blue)"
            isAnimationActive={false}
          />
          <Bar
            yAxisId="count"
            dataKey="voice"
            name="Voice"
            stackId="c"
            fill="var(--chart-cb-orange)"
            isAnimationActive={false}
          />
          <Line
            yAxisId="rate"
            dataKey="rate"
            name="Handover rate (%)"
            stroke="var(--chart-cb-vermillion)"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={{ r: 3 }}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
