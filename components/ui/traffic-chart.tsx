"use client";

import { ResponsiveLine } from "@nivo/line";
import { useTheme } from "next-themes";

export type TrafficData = {
  id: string;
  data: Array<{
    x: string;
    y: number;
  }>;
};

interface TrafficChartProps {
  data: TrafficData[];
  height?: number;
}

export function TrafficChart({ data, height = 300 }: TrafficChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div style={{ height }}>
      <ResponsiveLine
        data={data}
        margin={{ top: 20, right: 20, bottom: 40, left: 40 }}
        xScale={{
          type: "point",
        }}
        yScale={{
          type: "linear",
          min: "auto",
          max: "auto",
          stacked: false,
        }}
        curve="monotoneX"
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
        }}
        axisLeft={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
        }}
        enableGridX={false}
        colors={{ scheme: "category10" }}
        lineWidth={2}
        pointSize={8}
        pointColor={{ theme: "background" }}
        pointBorderWidth={2}
        pointBorderColor={{ from: "serieColor" }}
        pointLabelYOffset={-12}
        useMesh={true}
        enableSlices="x"
        crosshairType="x"
        theme={{
          axis: {
            ticks: {
              text: {
                fill: isDark ? "#888888" : "#666666",
              },
            },
          },
          grid: {
            line: {
              stroke: isDark ? "#404040" : "#dddddd",
              strokeDasharray: "4 4",
            },
          },
          crosshair: {
            line: {
              stroke: isDark ? "#666666" : "#999999",
              strokeWidth: 1,
              strokeOpacity: 0.75,
            },
          },
          tooltip: {
            container: {
              background: isDark ? "#1a1a1a" : "#ffffff",
              color: isDark ? "#ffffff" : "#333333",
              fontSize: "12px",
              borderRadius: "4px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            },
          },
        }}
        motionConfig="gentle"
        legends={[
          {
            anchor: "top",
            direction: "row",
            justify: false,
            translateX: 0,
            translateY: -20,
            itemsSpacing: 0,
            itemDirection: "left-to-right",
            itemWidth: 80,
            itemHeight: 20,
            itemOpacity: 0.75,
            symbolSize: 12,
            symbolShape: "circle",
            symbolBorderColor: "rgba(0, 0, 0, .5)",
            effects: [
              {
                on: "hover",
                style: {
                  itemBackground: "rgba(0, 0, 0, .03)",
                  itemOpacity: 1,
                },
              },
            ],
          },
        ]}
      />
    </div>
  );
} 