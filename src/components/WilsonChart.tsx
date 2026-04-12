import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface WilsonChartProps {
  data: Record<string, unknown>[];
  type?: "line" | "bar" | "area";
  dataKey?: string;
  xKey?: string;
}

const WilsonChart = ({ data, type = "line", dataKey, xKey }: WilsonChartProps) => {
  if (!data || data.length === 0) return null;

  // Auto-detect keys if not provided
  const keys = Object.keys(data[0]);
  const x = xKey || keys[0];
  const y = dataKey || keys.find((k) => k !== x && typeof data[0][k] === "number") || keys[1];

  const chartProps = {
    data,
    margin: { top: 5, right: 10, left: 0, bottom: 5 },
  };

  const commonAxisProps = {
    xAxis: <XAxis dataKey={x} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />,
    yAxis: <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={35} />,
    grid: <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />,
    tooltip: <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />,
  };

  return (
    <div className="my-3 rounded-xl border border-border/30 bg-card/50 p-3" style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        {type === "bar" ? (
          <BarChart {...chartProps}>
            {commonAxisProps.grid}
            {commonAxisProps.xAxis}
            {commonAxisProps.yAxis}
            {commonAxisProps.tooltip}
            <Bar dataKey={y} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : type === "area" ? (
          <AreaChart {...chartProps}>
            {commonAxisProps.grid}
            {commonAxisProps.xAxis}
            {commonAxisProps.yAxis}
            {commonAxisProps.tooltip}
            <Area type="monotone" dataKey={y} stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
          </AreaChart>
        ) : (
          <LineChart {...chartProps}>
            {commonAxisProps.grid}
            {commonAxisProps.xAxis}
            {commonAxisProps.yAxis}
            {commonAxisProps.tooltip}
            <Line type="monotone" dataKey={y} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default WilsonChart;
