export function TradeHistory() {
  const trades = [
    { time: '10:30:45', symbol: 'AAPL', side: 'BUY', qty: 100, price: 178.25, pnl: '+$125.50' },
    { time: '09:15:32', symbol: 'MSFT', side: 'SELL', qty: 50, price: 338.11, pnl: '-$45.20' },
  ];
  
  return (
    <div className="h-full">
      <h3 className="text-lg font-semibold text-trading-text-primary mb-4">Recent Trades</h3>
      <div className="space-y-2">
        {trades.map((trade, i) => (
          <div key={i} className="p-2 rounded bg-trading-bg-tertiary text-sm">
            <div className="flex justify-between items-center">
              <span className="text-trading-text-muted">{trade.time}</span>
              <span className="font-mono text-trading-text-primary">{trade.symbol}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className={trade.side === 'BUY' ? 'text-trading-success-500' : 'text-trading-danger-500'}>
                {trade.side} {trade.qty}
              </span>
              <span className="font-mono">${trade.price}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}