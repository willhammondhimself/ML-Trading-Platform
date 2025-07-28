// Trading Domain Entities
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import {
  AggregateRoot,
  Money,
  Price,
  Quantity,
  Symbol,
  OrderSide,
  OrderType,
  OrderStatus,
  TradeStatus,
  DomainEvent,
  BusinessRuleError,
  InsufficientFundsError
} from '../types';

// Value Objects
export class OrderId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('OrderId cannot be empty');
    }
  }

  getValue(): string {
    return this.value;
  }

  equals(other: OrderId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  static generate(): OrderId {
    return new OrderId(uuidv4());
  }
}

export class TradeId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('TradeId cannot be empty');
    }
  }

  getValue(): string {
    return this.value;
  }

  equals(other: TradeId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  static generate(): TradeId {
    return new TradeId(uuidv4());
  }
}

export class PositionId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('PositionId cannot be empty');
    }
  }

  getValue(): string {
    return this.value;
  }

  equals(other: PositionId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  static generate(): PositionId {
    return new PositionId(uuidv4());
  }
}

export class UserId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('UserId cannot be empty');
    }
  }

  getValue(): string {
    return this.value;
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  static generate(): UserId {
    return new UserId(uuidv4());
  }
}

// Domain Events
export class OrderPlaced implements DomainEvent {
  readonly eventId: string;
  readonly eventType = 'OrderPlaced';
  readonly occurredOn: Date;
  readonly version = 1;

  constructor(
    public readonly aggregateId: string,
    public readonly orderId: OrderId,
    public readonly userId: UserId,
    public readonly symbol: Symbol,
    public readonly side: OrderSide,
    public readonly type: OrderType,
    public readonly quantity: Quantity,
    public readonly price?: Price
  ) {
    this.eventId = uuidv4();
    this.occurredOn = new Date();
  }
}

export class OrderExecuted implements DomainEvent {
  readonly eventId: string;
  readonly eventType = 'OrderExecuted';
  readonly occurredOn: Date;
  readonly version = 1;

  constructor(
    public readonly aggregateId: string,
    public readonly orderId: OrderId,
    public readonly executedQuantity: Quantity,
    public readonly executionPrice: Price,
    public readonly tradeId: TradeId
  ) {
    this.eventId = uuidv4();
    this.occurredOn = new Date();
  }
}

export class OrderCancelled implements DomainEvent {
  readonly eventId: string;
  readonly eventType = 'OrderCancelled';
  readonly occurredOn: Date;
  readonly version = 1;

  constructor(
    public readonly aggregateId: string,
    public readonly orderId: OrderId,
    public readonly reason: string
  ) {
    this.eventId = uuidv4();
    this.occurredOn = new Date();
  }
}

export class PositionUpdated implements DomainEvent {
  readonly eventId: string;
  readonly eventType = 'PositionUpdated';
  readonly occurredOn: Date;
  readonly version = 1;

  constructor(
    public readonly aggregateId: string,
    public readonly positionId: PositionId,
    public readonly symbol: Symbol,
    public readonly oldQuantity: Quantity,
    public readonly newQuantity: Quantity,
    public readonly averagePrice: Price
  ) {
    this.eventId = uuidv4();
    this.occurredOn = new Date();
  }
}

// Entities
export class Order extends AggregateRoot<OrderId> {
  private _status: OrderStatus;
  private _filledQuantity: Quantity;
  private _averagePrice?: Price;
  private _placedAt: Date;
  private _updatedAt: Date;

  constructor(
    id: OrderId,
    private readonly _userId: UserId,
    private readonly _symbol: Symbol,
    private readonly _side: OrderSide,
    private readonly _type: OrderType,
    private readonly _quantity: Quantity,
    private readonly _price?: Price,
    private readonly _stopPrice?: Price
  ) {
    super(id);
    this._status = OrderStatus.PENDING;
    this._filledQuantity = new Quantity(new Decimal(0));
    this._placedAt = new Date();
    this._updatedAt = new Date();

    this.validateOrder();
    this.addDomainEvent(
      new OrderPlaced(
        this.id.getValue(),
        this.id,
        this._userId,
        this._symbol,
        this._side,
        this._type,
        this._quantity,
        this._price
      )
    );
  }

  private validateOrder(): void {
    if (this._type === OrderType.LIMIT && !this._price) {
      throw new BusinessRuleError('Limit orders must have a price');
    }
    if (this._type === OrderType.STOP && !this._stopPrice) {
      throw new BusinessRuleError('Stop orders must have a stop price');
    }
    if (this._type === OrderType.STOP_LIMIT && (!this._price || !this._stopPrice)) {
      throw new BusinessRuleError('Stop limit orders must have both price and stop price');
    }
  }

  get userId(): UserId {
    return this._userId;
  }

  get symbol(): Symbol {
    return this._symbol;
  }

  get side(): OrderSide {
    return this._side;
  }

  get type(): OrderType {
    return this._type;
  }

  get quantity(): Quantity {
    return this._quantity;
  }

  get price(): Price | undefined {
    return this._price;
  }

  get stopPrice(): Price | undefined {
    return this._stopPrice;
  }

  get status(): OrderStatus {
    return this._status;
  }

  get filledQuantity(): Quantity {
    return this._filledQuantity;
  }

  get remainingQuantity(): Quantity {
    return this._quantity.subtract(this._filledQuantity);
  }

  get averagePrice(): Price | undefined {
    return this._averagePrice;
  }

  get placedAt(): Date {
    return this._placedAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  canExecute(marketPrice: Price): boolean {
    if (this._status !== OrderStatus.OPEN) {
      return false;
    }

    switch (this._type) {
      case OrderType.MARKET:
        return true;
      case OrderType.LIMIT:
        if (this._side === OrderSide.BUY) {
          return marketPrice.isLessThan(this._price!) || marketPrice.equals(this._price!);
        } else {
          return marketPrice.isGreaterThan(this._price!) || marketPrice.equals(this._price!);
        }
      case OrderType.STOP:
        if (this._side === OrderSide.BUY) {
          return marketPrice.isGreaterThan(this._stopPrice!) || marketPrice.equals(this._stopPrice!);
        } else {
          return marketPrice.isLessThan(this._stopPrice!) || marketPrice.equals(this._stopPrice!);
        }
      default:
        return false;
    }
  }

  execute(executionPrice: Price, executedQuantity: Quantity): TradeId {
    if (!this.canExecute(executionPrice)) {
      throw new BusinessRuleError('Order cannot be executed at current market conditions');
    }

    if (executedQuantity.getValue().greaterThan(this.remainingQuantity.getValue())) {
      throw new BusinessRuleError('Cannot execute more than remaining quantity');
    }

    const tradeId = TradeId.generate();
    const newFilledQuantity = this._filledQuantity.add(executedQuantity);

    // Calculate new average price
    if (this._filledQuantity.getValue().isZero()) {
      this._averagePrice = executionPrice;
    } else {
      const totalValue = this._filledQuantity.getValue()
        .mul(this._averagePrice!.getValue())
        .add(executedQuantity.getValue().mul(executionPrice.getValue()));
      const avgPrice = totalValue.div(newFilledQuantity.getValue());
      this._averagePrice = new Price(avgPrice);
    }

    this._filledQuantity = newFilledQuantity;
    this._updatedAt = new Date();

    // Update status
    if (this._filledQuantity.equals(this._quantity)) {
      this._status = OrderStatus.FILLED;
    } else {
      this._status = OrderStatus.PARTIALLY_FILLED;
    }

    this.addDomainEvent(
      new OrderExecuted(
        this.id.getValue(),
        this.id,
        executedQuantity,
        executionPrice,
        tradeId
      )
    );

    return tradeId;
  }

  cancel(reason: string): void {
    if (this._status === OrderStatus.FILLED || this._status === OrderStatus.CANCELLED) {
      throw new BusinessRuleError('Cannot cancel order in current status');
    }

    this._status = OrderStatus.CANCELLED;
    this._updatedAt = new Date();

    this.addDomainEvent(
      new OrderCancelled(this.id.getValue(), this.id, reason)
    );
  }

  markAsOpen(): void {
    if (this._status !== OrderStatus.PENDING) {
      throw new BusinessRuleError('Can only mark pending orders as open');
    }

    this._status = OrderStatus.OPEN;
    this._updatedAt = new Date();
  }

  reject(reason: string): void {
    if (this._status !== OrderStatus.PENDING) {
      throw new BusinessRuleError('Can only reject pending orders');
    }

    this._status = OrderStatus.REJECTED;
    this._updatedAt = new Date();
  }
}

export class Position extends AggregateRoot<PositionId> {
  private _quantity: Quantity;
  private _averagePrice: Price;
  private _updatedAt: Date;

  constructor(
    id: PositionId,
    private readonly _userId: UserId,
    private readonly _symbol: Symbol,
    quantity: Quantity,
    averagePrice: Price
  ) {
    super(id);
    this._quantity = quantity;
    this._averagePrice = averagePrice;
    this._updatedAt = new Date();
  }

  get userId(): UserId {
    return this._userId;
  }

  get symbol(): Symbol {
    return this._symbol;
  }

  get quantity(): Quantity {
    return this._quantity;
  }

  get averagePrice(): Price {
    return this._averagePrice;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get marketValue(): (currentPrice: Price) => Money {
    return (currentPrice: Price) => {
      const value = this._quantity.getValue().mul(currentPrice.getValue());
      return new Money(value, 'USD'); // Assuming USD for now
    };
  }

  get unrealizedPnL(): (currentPrice: Price) => Money {
    return (currentPrice: Price) => {
      const currentValue = this._quantity.getValue().mul(currentPrice.getValue());
      const costBasis = this._quantity.getValue().mul(this._averagePrice.getValue());
      const pnl = currentValue.sub(costBasis);
      return new Money(pnl, 'USD'); // Assuming USD for now
    };
  }

  updatePosition(trade: Trade): void {
    const oldQuantity = this._quantity;
    
    if (trade.side === OrderSide.BUY) {
      // Adding to position
      const totalValue = this._quantity.getValue()
        .mul(this._averagePrice.getValue())
        .add(trade.quantity.getValue().mul(trade.price.getValue()));
      
      this._quantity = this._quantity.add(trade.quantity);
      this._averagePrice = new Price(totalValue.div(this._quantity.getValue()));
    } else {
      // Reducing position
      if (trade.quantity.getValue().greaterThan(this._quantity.getValue())) {
        throw new BusinessRuleError('Cannot sell more than current position');
      }
      
      this._quantity = this._quantity.subtract(trade.quantity);
      // Average price remains the same when reducing position
    }

    this._updatedAt = new Date();

    this.addDomainEvent(
      new PositionUpdated(
        this.id.getValue(),
        this.id,
        this._symbol,
        oldQuantity,
        this._quantity,
        this._averagePrice
      )
    );
  }

  isLong(): boolean {
    return this._quantity.getValue().greaterThan(0);
  }

  isShort(): boolean {
    return this._quantity.getValue().lessThan(0);
  }

  isFlat(): boolean {
    return this._quantity.getValue().isZero();
  }
}

export class Trade {
  constructor(
    public readonly id: TradeId,
    public readonly orderId: OrderId,
    public readonly userId: UserId,
    public readonly symbol: Symbol,
    public readonly side: OrderSide,
    public readonly quantity: Quantity,
    public readonly price: Price,
    public readonly executedAt: Date = new Date()
  ) {}

  get notionalValue(): Money {
    const value = this.quantity.getValue().mul(this.price.getValue());
    return new Money(value, 'USD'); // Assuming USD for now
  }
}