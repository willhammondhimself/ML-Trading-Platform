export function MarketDataFeed() {
  return (
    <div className="h-full">
      <h3 className="text-lg font-semibold text-trading-text-primary mb-4">Market Data</h3>
      <div className="space-y-2">
        {['SPY', 'QQQ', 'IWM', 'GLD', 'TLT'].map((symbol) => (
          <div key={symbol} className="flex justify-between items-center p-2 rounded hover:bg-trading-neutral-800">
            <span className="font-mono text-trading-text-primary">{symbol}</span>
            <div className="text-right">
              <div className="font-mono text-sm text-trading-text-primary">$156.78</div>
              <div className="text-xs text-trading-success-500">+0.85%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}