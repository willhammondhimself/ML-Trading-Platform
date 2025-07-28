export function OrderBook() {
  return (
    <div className="h-full">
      <h3 className="text-lg font-semibold text-trading-text-primary mb-4">Order Book</h3>
      <div className="space-y-1 text-xs font-mono">
        <div className="order-book-header">
          <span>Price</span>
          <span>Size</span>
          <span>Total</span>
        </div>
        {/* Asks */}
        {[178.26, 178.27, 178.28].map((price, i) => (
          <div key={price} className="order-book-row order-book-ask">
            <span className="text-trading-danger-500">{price.toFixed(2)}</span>
            <span>1,250</span>
            <span>15,420</span>
          </div>
        ))}
        {/* Spread */}
        <div className="text-center py-2 text-trading-text-muted border-y border-trading-neutral-700">
          Spread: $0.01
        </div>
        {/* Bids */}
        {[178.25, 178.24, 178.23].map((price, i) => (
          <div key={price} className="order-book-row order-book-bid">
            <span className="text-trading-success-500">{price.toFixed(2)}</span>
            <span>1,150</span>
            <span>14,280</span>
          </div>
        ))}
      </div>
    </div>
  );
}