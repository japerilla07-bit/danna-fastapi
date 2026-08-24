// src/components/RadarMap.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';

interface RadarProps {
  spinsCount?: number;
  hud: number | null;
  entropy: number | null;
}

interface Point {
  hud: number;
  ent: number;
}

export function RadarMap({ spinsCount = 0, hud, entropy }: RadarProps) {
  const [history, setHistory] = useState<Point[]>([]);
  const lastSpin = useRef<number>(-1);

  useEffect(() => {
    if (spinsCount === lastSpin.current) return;
    lastSpin.current = spinsCount;

    if (hud !== null && entropy !== null) {
      setHistory((prev) => {
        const newHist = [...prev, { hud, ent: entropy }];
        return newHist.slice(-5);
      });
    }
  }, [spinsCount, hud, entropy]);

  const options = useMemo(() => {
    const dataPoints = history.map((p) => [p.hud, p.ent]);

    return {
      backgroundColor: 'transparent',
      grid: {
        top: 20,
        right: 20,
        bottom: 30,
        left: 35,
        containLabel: true,
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => `HUD: ${params.value[0]}<br/>ENT: ${params.value[1]}`,
        backgroundColor: 'rgba(8, 12, 22, 0.9)',
        borderColor: 'rgba(34, 211, 238, 0.4)',
        textStyle: { color: '#e2e8f0', fontFamily: 'monospace', fontSize: 12 },
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: 100,
        name: 'VELOCITY (HUD)',
        nameLocation: 'middle',
        nameGap: 22,
        nameTextStyle: { color: '#475569', fontSize: 10 },
        splitLine: {
          show: true,
          lineStyle: { color: 'rgba(34, 211, 238, 0.05)', type: 'dashed' },
        },
        axisLabel: { color: '#64748b', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        name: 'ENTROPY',
        nameLocation: 'middle',
        nameGap: 22,
        nameTextStyle: { color: '#475569', fontSize: 10 },
        splitLine: {
          show: true,
          lineStyle: { color: 'rgba(34, 211, 238, 0.05)', type: 'dashed' },
        },
        axisLabel: { color: '#64748b', fontSize: 10 },
      },
      series: [
        {
          name: 'Trayectoria',
          type: 'line',
          data: dataPoints,
          smooth: true,
          symbolSize: (_value: any, params: any) => {
            return params.dataIndex === history.length - 1 ? 8 : 4;
          },
          itemStyle: {
            color: '#22d3ee',
            shadowBlur: 10,
            shadowColor: '#22d3ee',
          },
          lineStyle: {
            width: 2,
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: 'rgba(34, 211, 238, 0)' },
              { offset: 1, color: 'rgba(34, 211, 238, 0.8)' },
            ]),
            shadowBlur: 5,
            shadowColor: '#22d3ee',
          },
          markArea: {
            silent: true,
            itemStyle: {
              borderWidth: 1,
            },
            data: [
              [
                { xAxis: 46, yAxis: 10, itemStyle: { color: 'rgba(34, 197, 94, 0.1)', borderColor: 'rgba(34, 197, 94, 0.3)' } },
                { xAxis: 55, yAxis: 30 }
              ],
              [
                { xAxis: 41, yAxis: 0, itemStyle: { color: 'rgba(34, 197, 94, 0.1)', borderColor: 'rgba(34, 197, 94, 0.3)' } },
                { xAxis: 50, yAxis: 10 }
              ],
              [
                { xAxis: 70, yAxis: 0, itemStyle: { color: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' } },
                { xAxis: 100, yAxis: 15 }
              ],
              [
                { xAxis: 90, yAxis: 15, itemStyle: { color: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' } },
                { xAxis: 100, yAxis: 100 }
              ],
              [
                { xAxis: 41, yAxis: 50, itemStyle: { color: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.2)' } },
                { xAxis: 55, yAxis: 100 }
              ]
            ]
          }
        }
      ]
    };
  }, [history]);

  return (
    // @ts-ignore
    <ReactECharts
      option={options}
      style={{ height: '100%', width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  );
}