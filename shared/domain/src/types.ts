// Core Domain Types for ML Trading Platform
import Decimal from 'decimal.js';

// Value Objects
export class Money {
  constructor(private readonly amount: Decimal, private readonly currency: string) {
    if (amount.isNegative()) {
      throw new Error('Money amount cannot be negative');
    }
  }

  getAmount(): Decimal {
    return this.amount;
  }

  getCurrency(): string {
    return this.currency;
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('Cannot add money with different currencies');
    }
    return new Money(this.amount.add(other.amount), this.currency);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('Cannot subtract money with different currencies');
    }
    const result = this.amount.sub(other.amount);
    if (result.isNegative()) {
      throw new Error('Subtraction would result in negative amount');
    }
    return new Money(result, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(this.amount.mul(factor), this.currency);
  }

  equals(other: Money): boolean {
    return this.amount.equals(other.amount) && this.currency === other.currency;
  }

  toString(): string {
    return `${this.currency} ${this.amount.toFixed(2)}`;
  }
}

export class Price {
  constructor(private readonly value: Decimal) {
    if (value.isNegative()) {
      throw new Error('Price cannot be negative');
    }
  }

  getValue(): Decimal {
    return this.value;
  }

  equals(other: Price): boolean {
    return this.value.equals(other.value);
  }

  isGreaterThan(other: Price): boolean {
    return this.value.greaterThan(other.value);
  }

  isLessThan(other: Price): boolean {
    return this.value.lessThan(other.value);
  }

  toString(): string {
    return this.value.toFixed(4);
  }
}

export class Quantity {
  constructor(private readonly value: Decimal) {
    if (value.isNegative()) {
      throw new Error('Quantity cannot be negative');
    }
  }

  getValue(): Decimal {
    return this.value;
  }

  add(other: Quantity): Quantity {
    return new Quantity(this.value.add(other.value));
  }

  subtract(other: Quantity): Quantity {
    const result = this.value.sub(other.value);
    if (result.isNegative()) {
      throw new Error('Subtraction would result in negative quantity');
    }
    return new Quantity(result);
  }

  multiply(factor: number): Quantity {
    return new Quantity(this.value.mul(factor));
  }

  equals(other: Quantity): boolean {
    return this.value.equals(other.value);
  }

  toString(): string {
    return this.value.toString();
  }
}

export class Symbol {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('Symbol cannot be empty');
    }
    if (!/^[A-Z0-9._-]+$/.test(value)) {
      throw new Error('Symbol must contain only uppercase letters, numbers, dots, underscores, and hyphens');
    }
  }

  getValue(): string {
    return this.value;
  }

  equals(other: Symbol): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

// Enums
export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL'
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  STOP = 'STOP',
  STOP_LIMIT = 'STOP_LIMIT'
}

export enum OrderStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED'
}

export enum TradeStatus {
  PENDING = 'PENDING',
  EXECUTED = 'EXECUTED',
  FAILED = 'FAILED'
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum MarketDataType {
  TICK = 'TICK',
  QUOTE = 'QUOTE',
  TRADE = 'TRADE',
  OHLCV = 'OHLCV',
  ORDER_BOOK = 'ORDER_BOOK'
}

export enum AlertType {
  PRICE = 'PRICE',
  VOLUME = 'VOLUME',
  RISK = 'RISK',
  NEWS = 'NEWS',
  TECHNICAL = 'TECHNICAL',
  ML_PREDICTION = 'ML_PREDICTION'
}

export enum ModelType {
  MOMENTUM = 'MOMENTUM',
  MEAN_REVERSION = 'MEAN_REVERSION',
  SENTIMENT = 'SENTIMENT',
  VOLATILITY = 'VOLATILITY',
  TREND = 'TREND'
}

// Entity Base Classes
export abstract class Entity<T> {
  protected constructor(public readonly id: T) {}

  equals(other: Entity<T>): boolean {
    return this.id === other.id;
  }
}

export abstract class AggregateRoot<T> extends Entity<T> {
  private _domainEvents: DomainEvent[] = [];

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  public clearEvents(): void {
    this._domainEvents = [];
  }

  public getUncommittedEvents(): DomainEvent[] {
    return [...this._domainEvents];
  }
}

// Domain Events
export interface DomainEvent {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly occurredOn: Date;
  readonly version: number;
}

// Common Interfaces
export interface Repository<T extends AggregateRoot<any>, K> {
  findById(id: K): Promise<T | null>;
  save(aggregate: T): Promise<void>;
  delete(id: K): Promise<void>;
}

export interface DomainService {
  // Marker interface for domain services
}

export interface ApplicationService {
  // Marker interface for application services
}

// Error Types
export class DomainError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class BusinessRuleError extends DomainError {
  constructor(message: string, public readonly rule?: string) {
    super(message, 'BUSINESS_RULE_ERROR');
    this.name = 'BusinessRuleError';
  }
}

export class InsufficientFundsError extends BusinessRuleError {
  constructor(requiredAmount: Money, availableAmount: Money) {
    super(
      `Insufficient funds: required ${requiredAmount.toString()}, available ${availableAmount.toString()}`,
      'INSUFFICIENT_FUNDS'
    );
    this.name = 'InsufficientFundsError';
  }
}

export class RiskLimitExceededError extends BusinessRuleError {
  constructor(limitType: string, currentValue: number, limitValue: number) {
    super(
      `Risk limit exceeded: ${limitType} current=${currentValue}, limit=${limitValue}`,
      'RISK_LIMIT_EXCEEDED'
    );
    this.name = 'RiskLimitExceededError';
  }
}