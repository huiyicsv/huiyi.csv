import React, { useState, useMemo, useRef, useCallback } from 'react';

interface BenchmarkRate {
  id: string;
  name: string;
  rate: number;
  note: string;
}

const BENCHMARKS: BenchmarkRate[] = [
  { id: 'fd', name: 'Fixed Deposit (2.8%)', rate: 2.8, note: '12-month bank rate' },
  { id: 'asb', name: 'ASB (5.35%)', rate: 5.35, note: 'Recent unit trust distribution' },
  { id: 'epf', name: 'EPF (5.5%)', rate: 5.5, note: 'Conventional savings dividend' },
  { id: 'equity', name: 'Equity / ETF (7.5%)', rate: 7.5, note: 'Long-term diversified equities' },
];

// Helper to format currency without decimals
function formatRM(val: number): string {
  if (isNaN(val)) return 'RM 0';
  if (!isFinite(val)) return '> RM 10³⁰⁸ (Overflow)';
  if (val >= 1e12) {
    const t = val / 1e12;
    return `RM ${t >= 100 ? t.toExponential(2) : t.toFixed(2) + ' Trillion'}`;
  }
  const rounded = Math.round(Math.max(0, val));
  return 'RM ' + rounded.toLocaleString('en-MY');
}

// Compact currency formatter for chart axis (e.g. RM 50k, RM 1.2M, RM 3B)
function formatCompactRM(val: number): string {
  if (!isFinite(val)) return '∞';
  if (val >= 1_000_000_000_000) {
    const t = val / 1_000_000_000_000;
    return `RM ${t.toFixed(1)}T`;
  }
  if (val >= 1_000_000_000) {
    const b = val / 1_000_000_000;
    return `RM ${b % 1 === 0 ? b.toFixed(0) : b.toFixed(1)}B`;
  }
  if (val >= 1_000_000) {
    const m = val / 1_000_000;
    return `RM ${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (val >= 1_000) {
    const k = val / 1_000;
    return `RM ${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `RM ${Math.round(val)}`;
}

interface YearPoint {
  year: number;
  balance: number;
  principal: number;
  interest: number;
}

export default function App() {
  // Inputs state
  const [startingAmount, setStartingAmount] = useState<number>(5000);
  const [monthlyContribution, setMonthlyContribution] = useState<number>(500);
  const [annualReturn, setAnnualReturn] = useState<number>(6);
  const [years, setYears] = useState<number>(20);

  // Raw string inputs for graceful typing without jumpy re-renders
  const [rawStarting, setRawStarting] = useState<string>('5000');
  const [rawMonthly, setRawMonthly] = useState<string>('500');
  const [rawReturn, setRawReturn] = useState<string>('6');
  const [rawYears, setRawYears] = useState<string>('20');

  // Benchmark pill state
  const [activeBenchmark, setActiveBenchmark] = useState<string | null>(null);

  // Chart hover interaction state
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Core calculation logic (compounds monthly) - safely handles unbounded parameters
  const calculation = useMemo(() => {
    const p = Math.max(0, startingAmount || 0);
    const c = Math.max(0, monthlyContribution || 0);
    const r = Math.max(0, annualReturn || 0);
    const y = Math.max(1, Math.round(years || 1));

    const monthlyRate = r / 100 / 12;
    const totalMonths = y * 12;

    // Exact closed-form final balance
    let finalBalance = p;
    if (monthlyRate === 0) {
      finalBalance = p + c * totalMonths;
    } else {
      const factor = Math.pow(1 + monthlyRate, totalMonths);
      finalBalance = isFinite(factor)
        ? p * factor + c * ((factor - 1) / monthlyRate)
        : Infinity;
    }

    const totalContributed = p + c * totalMonths;
    const totalInterest = isFinite(finalBalance)
      ? Math.max(0, finalBalance - totalContributed)
      : Infinity;
    const growthMultiplier =
      totalContributed > 0 && isFinite(finalBalance)
        ? finalBalance / totalContributed
        : 1;
    const interestPercentage =
      finalBalance > 0 && isFinite(finalBalance)
        ? (totalInterest / finalBalance) * 100
        : 0;

    // Generate sampled chart points (up to 120 points max to ensure buttery smooth SVG rendering)
    const points: YearPoint[] = [
      { year: 0, balance: p, principal: p, interest: 0 },
    ];

    const step = Math.max(1, Math.ceil(y / 100));
    for (let yr = step; yr < y; yr += step) {
      const months = yr * 12;
      let yrBal = p;
      if (monthlyRate === 0) {
        yrBal = p + c * months;
      } else {
        const factor = Math.pow(1 + monthlyRate, months);
        yrBal = isFinite(factor)
          ? p * factor + c * ((factor - 1) / monthlyRate)
          : Infinity;
      }
      const yrPrincipal = p + c * months;
      const yrInterest = isFinite(yrBal) ? Math.max(0, yrBal - yrPrincipal) : Infinity;
      points.push({
        year: yr,
        balance: yrBal,
        principal: yrPrincipal,
        interest: yrInterest,
      });
    }

    // Always include the exact final year point
    points.push({
      year: y,
      balance: finalBalance,
      principal: totalContributed,
      interest: totalInterest,
    });

    return {
      finalBalance,
      totalContributed,
      totalInterest,
      growthMultiplier,
      interestPercentage,
      points,
    };
  }, [startingAmount, monthlyContribution, annualReturn, years]);

  // Handle benchmark selection
  const handleSelectBenchmark = (benchmark: BenchmarkRate) => {
    setActiveBenchmark(benchmark.id);
    setAnnualReturn(benchmark.rate);
    setRawReturn(benchmark.rate.toString());
  };

  // Input synchronization handlers
  const handleStartingChange = (val: number, raw?: string) => {
    const clean = Math.max(0, isNaN(val) ? 0 : val);
    setStartingAmount(clean);
    setRawStarting(raw !== undefined ? raw : clean.toString());
  };

  const handleMonthlyChange = (val: number, raw?: string) => {
    const clean = Math.max(0, isNaN(val) ? 0 : val);
    setMonthlyContribution(clean);
    setRawMonthly(raw !== undefined ? raw : clean.toString());
  };

  const handleReturnChange = (val: number, raw?: string) => {
    const clean = Math.max(0, isNaN(val) ? 0 : val);
    setAnnualReturn(clean);
    setRawReturn(raw !== undefined ? raw : clean.toString());

    // Typing or manually dragging to a custom rate deselects active benchmark
    const currentActive = BENCHMARKS.find((b) => b.id === activeBenchmark);
    if (!currentActive || Math.abs(currentActive.rate - clean) > 0.001) {
      setActiveBenchmark(null);
    }
  };

  const handleYearsChange = (val: number, raw?: string) => {
    const clean = Math.max(1, isNaN(val) ? 1 : Math.round(val));
    setYears(clean);
    setRawYears(raw !== undefined ? raw : clean.toString());
  };

  // SVG Chart Geometry calculations
  const chartWidth = 720;
  const chartHeight = 310;
  const padding = { top: 30, right: 35, bottom: 42, left: 75 };
  const plotW = chartWidth - padding.left - padding.right;
  const plotH = chartHeight - padding.top - padding.bottom;

  const maxVal = useMemo(() => {
    const highest = calculation.finalBalance;
    return highest > 0 ? highest * 1.08 : 1000;
  }, [calculation.finalBalance]);

  const numYears = Math.max(1, Math.round(years));

  const getCoordinates = useCallback(
    (pt: YearPoint) => {
      const x = padding.left + (pt.year / numYears) * plotW;
      const yBalance = padding.top + (1 - pt.balance / maxVal) * plotH;
      const yPrincipal = padding.top + (1 - pt.principal / maxVal) * plotH;
      return { x, yBalance, yPrincipal };
    },
    [numYears, plotW, plotH, maxVal, padding.left, padding.top]
  );

  // Generate SVG path commands
  const { balanceLine, balanceArea, principalLine, principalArea } = useMemo(() => {
    if (calculation.points.length === 0) {
      return { balanceLine: '', balanceArea: '', principalLine: '', principalArea: '' };
    }

    const coords = calculation.points.map(getCoordinates);
    const zeroY = padding.top + plotH;

    const bLine = coords.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)},${pt.yBalance.toFixed(1)}`, '');
    const pLine = coords.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)},${pt.yPrincipal.toFixed(1)}`, '');

    const firstX = coords[0].x.toFixed(1);
    const lastX = coords[coords.length - 1].x.toFixed(1);

    const bArea = `${bLine} L ${lastX},${zeroY} L ${firstX},${zeroY} Z`;
    const pArea = `${pLine} L ${lastX},${zeroY} L ${firstX},${zeroY} Z`;

    return { balanceLine: bLine, balanceArea: bArea, principalLine: pLine, principalArea: pArea };
  }, [calculation.points, getCoordinates, padding.top, plotH]);

  // Chart Y-axis tick values (4 steps)
  const yTicks = useMemo(() => {
    const steps = 4;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const val = (maxVal / steps) * i;
      const y = padding.top + (1 - val / maxVal) * plotH;
      return { val, y };
    });
  }, [maxVal, padding.top, plotH]);

  // Chart X-axis tick intervals
  const xTicks = useMemo(() => {
    let interval = 5;
    if (numYears <= 10) interval = 2;
    else if (numYears <= 25) interval = 5;
    else if (numYears <= 50) interval = 10;
    else if (numYears <= 100) interval = 20;
    else if (numYears <= 500) interval = 50;
    else interval = Math.max(10, Math.pow(10, Math.floor(Math.log10(numYears / 4))));

    const ticks: { year: number; x: number }[] = [];
    for (let yr = 0; yr <= numYears; yr += interval) {
      ticks.push({
        year: yr,
        x: padding.left + (yr / numYears) * plotW,
      });
    }
    // Always ensure end year is included if not too close to previous tick
    const lastTick = ticks[ticks.length - 1];
    if (lastTick && lastTick.year !== numYears) {
      if (numYears - lastTick.year >= interval * 0.45) {
        ticks.push({
          year: numYears,
          x: padding.left + plotW,
        });
      }
    }
    return ticks;
  }, [numYears, padding.left, plotW]);

  // Interactive hover coordinate tracker
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * chartWidth;

    const relativeX = svgX - padding.left;
    const ratio = Math.max(0, Math.min(1, relativeX / plotW));
    const rawYr = Math.round(ratio * numYears);
    setHoveredYear(rawYr);
  };

  const handleMouseLeave = () => {
    setHoveredYear(null);
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (!svgRef.current || !e.touches[0]) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.touches[0].clientX - rect.left;
    const svgX = (clientX / rect.width) * chartWidth;

    const relativeX = svgX - padding.left;
    const ratio = Math.max(0, Math.min(1, relativeX / plotW));
    const rawYr = Math.round(ratio * numYears);
    setHoveredYear(rawYr);
  };

  const handleTouchEnd = () => {
    setHoveredYear(null);
  };

  const activePoint = useMemo(() => {
    if (hoveredYear === null || calculation.points.length === 0) return null;
    let closest = calculation.points[0];
    let minDiff = Math.abs(closest.year - hoveredYear);
    for (let i = 1; i < calculation.points.length; i++) {
      const diff = Math.abs(calculation.points[i].year - hoveredYear);
      if (diff < minDiff) {
        minDiff = diff;
        closest = calculation.points[i];
      }
    }
    return closest;
  }, [hoveredYear, calculation.points]);

  const activeCoords = useMemo(() => {
    if (!activePoint) return null;
    return getCoordinates(activePoint);
  }, [activePoint, getCoordinates]);

  return (
    <div id="calculator-app" className="min-h-screen bg-[#F7F1E8] text-[#3F3632] px-4 py-8 sm:px-6 sm:py-12 lg:px-10 lg:py-16">
      <div className="max-w-6xl mx-auto">
        {/* Editorial Header */}
        <header id="editorial-header" className="mb-8 sm:mb-10">
          <h1 className="font-editorial text-3xl sm:text-4xl lg:text-5xl text-[#3F3632] font-normal tracking-tight">
            Compound Interest Calculator
          </h1>
        </header>

        {/* Asymmetric Two-Column Layout */}
        <div id="calculator-grid" className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Inputs Column (Narrower) */}
          <section
            id="inputs-panel"
            className="lg:col-span-5 bg-[#FFF9F1] border border-[#E8DCD0] rounded-2xl p-5 sm:p-7 transition-shadow"
          >
            <div className="pb-4 mb-6 border-b border-[#E8DCD0]">
              <h2 className="font-editorial text-xl text-[#3F3632] font-normal">
                Your parameters
              </h2>
            </div>

            <div className="space-y-5 sm:space-y-6">
              {/* Input 1: Starting Amount */}
              <div id="starting-amount-group" className="space-y-2">
                <label htmlFor="starting-amount-input" className="block font-humanist text-sm font-medium text-[#3F3632]">
                  Starting amount
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-xs font-semibold text-[#81756F]">RM</span>
                  <input
                    id="starting-amount-input"
                    type="number"
                    min="0"
                    step="100"
                    value={rawStarting}
                    onChange={(e) => {
                      setRawStarting(e.target.value);
                      handleStartingChange(parseFloat(e.target.value) || 0, e.target.value);
                    }}
                    onBlur={() => {
                      setRawStarting(startingAmount.toString());
                    }}
                    className="w-full text-left pl-11 pr-4 py-2 bg-[#F7F1E8] border border-[#E8DCD0] rounded-lg font-humanist text-sm font-semibold text-[#3F3632] focus:outline-none focus:ring-2 focus:ring-[#C98F91] focus:border-[#C98F91] transition-all"
                  />
                </div>
              </div>

              {/* Input 2: Monthly Contribution */}
              <div id="monthly-contribution-group" className="space-y-2">
                <label htmlFor="monthly-contribution-input" className="block font-humanist text-sm font-medium text-[#3F3632]">
                  Monthly contribution
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-xs font-semibold text-[#81756F]">RM</span>
                  <input
                    id="monthly-contribution-input"
                    type="number"
                    min="0"
                    step="50"
                    value={rawMonthly}
                    onChange={(e) => {
                      setRawMonthly(e.target.value);
                      handleMonthlyChange(parseFloat(e.target.value) || 0, e.target.value);
                    }}
                    onBlur={() => {
                      setRawMonthly(monthlyContribution.toString());
                    }}
                    className="w-full text-left pl-11 pr-4 py-2 bg-[#F7F1E8] border border-[#E8DCD0] rounded-lg font-humanist text-sm font-semibold text-[#3F3632] focus:outline-none focus:ring-2 focus:ring-[#C98F91] focus:border-[#C98F91] transition-all"
                  />
                </div>
              </div>

              {/* Input 3: Annual Return (%) with Malaysian Benchmark Pills */}
              <div id="annual-return-group" className="space-y-2">
                <label htmlFor="annual-return-input" className="block font-humanist text-sm font-medium text-[#3F3632]">
                  Annual return
                </label>

                {/* Benchmark Reference Pills */}
                <div id="malaysian-benchmarks-row" className="pt-0.5 pb-1">
                  <div className="text-[11px] font-medium text-[#81756F] mb-1.5">
                    Malaysian benchmark reference rates:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {BENCHMARKS.map((item) => {
                      const isSelected = activeBenchmark === item.id;
                      return (
                        <button
                          key={item.id}
                          id={`benchmark-pill-${item.id}`}
                          type="button"
                          onClick={() => handleSelectBenchmark(item)}
                          title={item.note}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-all whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-[#C98F91] ${
                            isSelected
                              ? 'bg-[#E8CFC8] border-[#C98F91] text-[#3F3632] font-semibold shadow-xs'
                              : 'bg-[#F7F1E8] border-[#E8DCD0] text-[#81756F] hover:border-[#C98F91] hover:text-[#3F3632]'
                          }`}
                        >
                          {item.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="relative flex items-center">
                  <input
                    id="annual-return-input"
                    type="number"
                    min="0"
                    step="0.1"
                    value={rawReturn}
                    onChange={(e) => {
                      setRawReturn(e.target.value);
                      handleReturnChange(parseFloat(e.target.value) || 0, e.target.value);
                    }}
                    onBlur={() => {
                      setRawReturn(annualReturn.toString());
                    }}
                    className="w-full text-left pl-4 pr-9 py-2 bg-[#F7F1E8] border border-[#E8DCD0] rounded-lg font-humanist text-sm font-semibold text-[#3F3632] focus:outline-none focus:ring-2 focus:ring-[#C98F91] focus:border-[#C98F91] transition-all"
                  />
                  <span className="absolute right-3.5 text-xs font-semibold text-[#81756F]">%</span>
                </div>
              </div>

              {/* Input 4: Years to Grow */}
              <div id="years-to-grow-group" className="space-y-2">
                <label htmlFor="years-input" className="block font-humanist text-sm font-medium text-[#3F3632]">
                  Years to grow
                </label>
                <div className="relative flex items-center">
                  <input
                    id="years-input"
                    type="number"
                    min="1"
                    step="1"
                    value={rawYears}
                    onChange={(e) => {
                      setRawYears(e.target.value);
                      handleYearsChange(parseInt(e.target.value, 10) || 1, e.target.value);
                    }}
                    onBlur={() => {
                      setRawYears(years.toString());
                    }}
                    className="w-full text-left pl-4 pr-12 py-2 bg-[#F7F1E8] border border-[#E8DCD0] rounded-lg font-humanist text-sm font-semibold text-[#3F3632] focus:outline-none focus:ring-2 focus:ring-[#C98F91] focus:border-[#C98F91] transition-all"
                  />
                  <span className="absolute right-3.5 text-xs font-semibold text-[#81756F]">years</span>
                </div>
              </div>
            </div>
          </section>

          {/* Output Card (Wider) */}
          <main
            id="results-panel"
            className="lg:col-span-7 bg-[#FFF9F1] border border-[#E8DCD0] rounded-2xl p-5 sm:p-8 space-y-6 sm:space-y-8"
          >
            {/* Primary Output Display */}
            <div id="final-balance-display" className="space-y-1">
              <span className="font-humanist text-xs sm:text-sm tracking-wide text-[#81756F] uppercase font-medium">
                Estimated balance after {years} {years === 1 ? 'year' : 'years'}
              </span>
              <div className="font-editorial text-4xl sm:text-5xl lg:text-6xl text-[#3F3632] font-normal tracking-tight">
                {formatRM(calculation.finalBalance)}
              </div>
            </div>

            {/* Key Totals Breakdown Cards */}
            <div id="totals-summary-grid" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Total Contributed */}
              <div
                id="total-contributed-card"
                className="bg-[#F7F1E8] border border-[#E8DCD0] rounded-xl p-4 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#C98F91]" />
                  <span className="font-humanist text-xs font-medium text-[#81756F]">
                    Total contributed (Principal)
                  </span>
                </div>
                <div className="font-editorial text-2xl sm:text-3xl text-[#3F3632] font-normal">
                  {formatRM(calculation.totalContributed)}
                </div>
                <div className="text-[11px] text-[#9E8F87] mt-1 font-humanist">
                  RM {startingAmount.toLocaleString('en-MY')} initial + RM {monthlyContribution.toLocaleString('en-MY')}/mo
                </div>
              </div>

              {/* Total Interest Earned */}
              <div
                id="total-interest-card"
                className="bg-[#F7F1E8] border border-[#E8DCD0] rounded-xl p-4 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#D8B95F]" />
                  <span className="font-humanist text-xs font-medium text-[#81756F]">
                    Total interest earned
                  </span>
                </div>
                <div className="font-editorial text-2xl sm:text-3xl text-[#D8B95F] font-medium">
                  {formatRM(calculation.totalInterest)}
                </div>
                <div className="text-[11px] text-[#81756F] mt-1 font-humanist">
                  {calculation.interestPercentage.toFixed(0)}% of your final wealth
                </div>
              </div>
            </div>

            {/* Proportion Bar & Wealth Multiplier Callout */}
            <div id="wealth-growth-metric" className="bg-[#F7F1E8] border border-[#E8DCD0] rounded-xl p-4">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs font-medium text-[#81756F]">Wealth breakdown</span>
                <span className="text-xs font-semibold text-[#3F3632]">
                  {calculation.growthMultiplier.toFixed(2)}× original capital
                </span>
              </div>
              <div className="w-full h-3 bg-[#E8DCD0] rounded-full overflow-hidden flex">
                <div
                  style={{
                    width: `${calculation.finalBalance > 0 ? (calculation.totalContributed / calculation.finalBalance) * 100 : 100}%`,
                  }}
                  className="h-full bg-[#C98F91] transition-all duration-300"
                  title="Principal Contributions"
                />
                <div
                  style={{
                    width: `${calculation.finalBalance > 0 ? (calculation.totalInterest / calculation.finalBalance) * 100 : 0}%`,
                  }}
                  className="h-full bg-[#D8B95F] transition-all duration-300"
                  title="Compound Interest"
                />
              </div>
              <div className="flex justify-between items-center text-[11px] text-[#81756F] mt-2">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-xs bg-[#C98F91]" />
                  Principal (
                  {calculation.finalBalance > 0
                    ? ((calculation.totalContributed / calculation.finalBalance) * 100).toFixed(0)
                    : 100}
                  %)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-xs bg-[#D8B95F]" />
                  Interest ({calculation.interestPercentage.toFixed(0)}%)
                </span>
              </div>
            </div>

            {/* Inline SVG Chart */}
            <div id="growth-chart-container" className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="font-editorial text-lg text-[#3F3632] font-normal">
                  Growth trajectory over time
                </h3>
                <div className="flex items-center gap-4 text-xs text-[#81756F]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-0.5 bg-[#C98F91] inline-block" />
                    <span>Principal</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-0.5 bg-[#D8B95F] inline-block" />
                    <span>Total balance</span>
                  </div>
                </div>
              </div>

              {/* Chart Canvas with SVG */}
              <div className="relative w-full bg-[#FFF9F1] border border-[#E8DCD0] rounded-xl p-2 sm:p-3 overflow-hidden select-none">
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-auto cursor-crosshair"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  id="compound-growth-svg"
                >
                  <defs>
                    {/* Area fill for principal */}
                    <linearGradient id="principalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E8CFC8" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#E8CFC8" stopOpacity="0.05" />
                    </linearGradient>

                    {/* Area fill for compound interest layer */}
                    <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#D8B95F" stopOpacity="0.30" />
                      <stop offset="100%" stopColor="#D8B95F" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid Lines and Y-Axis Ticks */}
                  {yTicks.map((tick, i) => (
                    <g key={`ytick-${i}`}>
                      <line
                        x1={padding.left}
                        y1={tick.y}
                        x2={chartWidth - padding.right}
                        y2={tick.y}
                        stroke="#E8DCD0"
                        strokeDasharray={i === 0 ? '' : '3 3'}
                        strokeWidth="1"
                      />
                      <text
                        x={padding.left - 10}
                        y={tick.y + 4}
                        textAnchor="end"
                        fontSize="11"
                        fill="#9E8F87"
                        fontFamily="Plus Jakarta Sans, sans-serif"
                      >
                        {formatCompactRM(tick.val)}
                      </text>
                    </g>
                  ))}

                  {/* X-Axis Ticks */}
                  {xTicks.map((tick, i) => (
                    <g key={`xtick-${i}`}>
                      <line
                        x1={tick.x}
                        y1={padding.top + plotH}
                        x2={tick.x}
                        y2={padding.top + plotH + 5}
                        stroke="#E8DCD0"
                        strokeWidth="1"
                      />
                      <text
                        x={tick.x}
                        y={padding.top + plotH + 20}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#9E8F87"
                        fontFamily="Plus Jakarta Sans, sans-serif"
                      >
                        {tick.year === 0 ? 'Yr 0' : `Yr ${tick.year}`}
                      </text>
                    </g>
                  ))}

                  {/* Total Balance Area Fill */}
                  <path d={balanceArea} fill="url(#balanceGrad)" />

                  {/* Principal Area Fill */}
                  <path d={principalArea} fill="url(#principalGrad)" />

                  {/* Principal Contribution Line Trace (Dusty Rose) */}
                  <path
                    d={principalLine}
                    fill="none"
                    stroke="#C98F91"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Total Balance / Compounding Trajectory Line Trace (Soft Muted Yellow) */}
                  <path
                    d={balanceLine}
                    fill="none"
                    stroke="#D8B95F"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Hover Guideline & Data Points */}
                  {activeCoords && activePoint && (
                    <g id="chart-hover-marker">
                      {/* Vertical inspection line */}
                      <line
                        x1={activeCoords.x}
                        y1={padding.top}
                        x2={activeCoords.x}
                        y2={padding.top + plotH}
                        stroke="#81756F"
                        strokeWidth="1"
                        strokeDasharray="2 2"
                      />

                      {/* Dot for Principal */}
                      <circle
                        cx={activeCoords.x}
                        cy={activeCoords.yPrincipal}
                        r="4.5"
                        fill="#FFF9F1"
                        stroke="#C98F91"
                        strokeWidth="2.5"
                      />

                      {/* Dot for Balance */}
                      <circle
                        cx={activeCoords.x}
                        cy={activeCoords.yBalance}
                        r="5"
                        fill="#FFF9F1"
                        stroke="#D8B95F"
                        strokeWidth="3"
                      />
                    </g>
                  )}
                </svg>

                {/* Floating Tooltip Callout on Hover */}
                {activePoint && (
                  <div
                    id="chart-floating-tooltip"
                    className="mt-2 sm:mt-3 px-3.5 py-2.5 bg-[#F7F1E8] border border-[#E8DCD0] rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#3F3632]">
                        Year {activePoint.year}
                      </span>
                      <span className="text-[#9E8F87]">
                        ({activePoint.year * 12} months)
                      </span>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#C98F91]" />
                        <span className="text-[#81756F]">Principal:</span>
                        <span className="font-medium text-[#3F3632]">
                          {formatRM(activePoint.principal)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#D8B95F]" />
                        <span className="text-[#81756F]">Interest:</span>
                        <span className="font-medium text-[#D8B95F]">
                          {formatRM(activePoint.interest)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#81756F]">Total:</span>
                        <span className="font-semibold text-[#3F3632]">
                          {formatRM(activePoint.balance)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-[#9E8F87] font-humanist">
                Hover or touch the graph to inspect exact balance and interest milestones by year.
              </p>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
