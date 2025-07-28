import { WebSocketMessage } from '@/types/trading';
import { ProtocolError } from '@/types/websocket-service';

/**
 * Protocol Buffer Handler for Binary WebSocket Communication
 * 
 * Features:
 * - Efficient binary serialization/deserialization
 * - Schema versioning and backward compatibility
 * - Compression support (gzip, brotli)
 * - Type-safe message handling
 * - Performance optimizations for trading data
 * - Message validation and error handling
 * - Streaming support for large payloads
 */

export type MessageType = 
  | 'tick'
  | 'orderbook' 
  | 'trade'
  | 'order'
  | 'position'
  | 'portfolio'
  | 'prediction'
  | 'system'
  | 'error';

export interface ProtocolConfig {
  version: number;
  compression: 'none' | 'gzip' | 'brotli';
  validateSchema: boolean;
  maxMessageSize: number; // bytes
  enableStreaming: boolean;
  chunkSize: number; // for streaming large messages
}

export interface MessageHeader {
  version: number;
  type: MessageType;
  timestamp: number;
  messageId: string;
  compressed: boolean;
  size: number;
  checksum?: number;
  isChunk?: boolean;
  chunkIndex?: number;
  totalChunks?: number;
}

export interface BinaryMessage {
  header: MessageHeader;
  payload: Uint8Array;
}

export interface MessageSchema {
  type: MessageType;
  version: number;
  fields: Record<string, FieldDefinition>;
  requiredFields: string[];
}

export interface FieldDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'bytes';
  subType?: string; // for arrays and objects
  optional?: boolean;
  default?: any;
  validation?: {
    min?: number;
    max?: number;
    length?: number;
    pattern?: RegExp;
  };
}

// Performance metrics for binary protocol
export interface ProtocolMetrics {
  totalMessages: number;
  bytesProcessed: number;
  compressionRatio: number;
  averageSerializationTime: number;
  averageDeserializationTime: number;
  errorCount: number;
  schemaValidationTime: number;
  lastActivity: number;
}

// Message streaming state for large payloads
export interface StreamingState {
  messageId: string;
  totalChunks: number;
  receivedChunks: Map<number, Uint8Array>;
  startTime: number;
  timeout: NodeJS.Timeout;
}

export class ProtocolBufferHandler {
  private config: ProtocolConfig;
  private schemas: Map<string, MessageSchema> = new Map();
  private metrics: ProtocolMetrics;
  private streamingMessages: Map<string, StreamingState> = new Map();
  private compressionCache: Map<string, Uint8Array> = new Map();

  constructor(config: Partial<ProtocolConfig> = {}) {
    this.config = {
      version: 1,
      compression: 'none',
      validateSchema: true,
      maxMessageSize: 10 * 1024 * 1024, // 10MB
      enableStreaming: true,
      chunkSize: 64 * 1024, // 64KB chunks
      ...config
    };

    this.metrics = this.initializeMetrics();
    this.registerDefaultSchemas();
  }

  /**
   * Serialize JavaScript object to binary format
   */
  async serialize(message: WebSocketMessage): Promise<Uint8Array> {
    const startTime = performance.now();

    try {
      // Create message header
      const header: MessageHeader = {
        version: this.config.version,
        type: message.type,
        timestamp: message.timestamp,
        messageId: this.generateMessageId(),
        compressed: this.config.compression !== 'none',
        size: 0
      };

      // Validate schema if enabled
      if (this.config.validateSchema) {
        await this.validateMessage(message);
      }

      // Serialize payload
      const payload = await this.serializePayload(message.data, message.type);
      
      // Compress if enabled
      const finalPayload = header.compressed 
        ? await this.compress(payload)
        : payload;

      header.size = finalPayload.length;
      header.checksum = this.calculateChecksum(finalPayload);

      // Combine header and payload
      const headerBytes = this.serializeHeader(header);
      const result = new Uint8Array(headerBytes.length + finalPayload.length);
      result.set(headerBytes, 0);
      result.set(finalPayload, headerBytes.length);

      // Update metrics
      const serializationTime = performance.now() - startTime;
      this.updateSerializationMetrics(result.length, serializationTime);

      return result;

    } catch (error) {
      this.metrics.errorCount++;
      throw new ProtocolError(
        `Failed to serialize message: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        { originalError: error, messageType: message.type }
      );
    }
  }

  /**
   * Deserialize binary data to JavaScript object
   */
  async deserialize(data: Uint8Array): Promise<WebSocketMessage> {
    const startTime = performance.now();

    try {
      // Parse header
      const { header, payloadOffset } = this.deserializeHeader(data);
      
      // Extract payload
      const compressedPayload = data.slice(payloadOffset);
      
      // Verify checksum
      if (header.checksum && this.calculateChecksum(compressedPayload) !== header.checksum) {
        throw new Error('Checksum mismatch - data corruption detected');
      }

      // Handle streaming messages
      if (header.isChunk) {
        return await this.handleStreamingChunk(header, compressedPayload);
      }

      // Decompress if needed
      const payload = header.compressed 
        ? await this.decompress(compressedPayload)
        : compressedPayload;

      // Deserialize payload
      const messageData = await this.deserializePayload(payload, header.type);

      // Create final message
      const message: WebSocketMessage = {
        type: header.type,
        data: messageData,
        timestamp: header.timestamp
      };

      // Validate if enabled
      if (this.config.validateSchema) {
        await this.validateMessage(message);
      }

      // Update metrics
      const deserializationTime = performance.now() - startTime;
      this.updateDeserializationMetrics(data.length, deserializationTime);

      return message;

    } catch (error) {
      this.metrics.errorCount++;
      throw new ProtocolError(
        `Failed to deserialize message: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        { originalError: error }
      );
    }
  }

  /**
   * Check if binary data can be handled by this protocol version
   */
  isCompatible(data: Uint8Array): boolean {
    try {
      if (data.length < 8) return false; // Minimum header size
      
      const version = this.readUint32(data, 0);
      return version <= this.config.version;
    } catch {
      return false;
    }
  }

  /**
   * Register custom message schema
   */
  registerSchema(schema: MessageSchema): void {
    const key = `${schema.type}_v${schema.version}`;
    this.schemas.set(key, schema);
  }

  /**
   * Get protocol metrics
   */
  getMetrics(): ProtocolMetrics {
    return { ...this.metrics };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ProtocolConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clear metrics and reset state
   */
  reset(): void {
    this.metrics = this.initializeMetrics();
    this.compressionCache.clear();
    this.clearStreamingMessages();
  }

  // Private methods

  private async serializePayload(data: any, messageType: MessageType): Promise<Uint8Array> {
    // Optimized serialization based on message type
    switch (messageType) {
      case 'tick':
        return this.serializeTickData(data);
      case 'orderbook':
        return this.serializeOrderBookData(data);
      case 'trade':
        return this.serializeTradeData(data);
      case 'order':
        return this.serializeOrderData(data);
      case 'position':
        return this.serializePositionData(data);
      case 'portfolio':
        return this.serializePortfolioData(data);
      case 'prediction':
        return this.serializePredictionData(data);
      default:
        return this.serializeGenericData(data);
    }
  }

  private async deserializePayload(data: Uint8Array, messageType: MessageType): Promise<any> {
    // Optimized deserialization based on message type
    switch (messageType) {
      case 'tick':
        return this.deserializeTickData(data);
      case 'orderbook':
        return this.deserializeOrderBookData(data);
      case 'trade':
        return this.deserializeTradeData(data);
      case 'order':
        return this.deserializeOrderData(data);
      case 'position':
        return this.deserializePositionData(data);
      case 'portfolio':
        return this.deserializePortfolioData(data);
      case 'prediction':
        return this.deserializePredictionData(data);
      default:
        return this.deserializeGenericData(data);
    }
  }

  // Tick data serialization (highly optimized for frequent updates)
  private serializeTickData(data: any): Uint8Array {
    // Optimized binary format for tick data:
    // 8 bytes: timestamp (double)
    // 8 bytes: price (double) 
    // 8 bytes: volume (double)
    // 4 bytes: symbol length
    // N bytes: symbol (UTF-8)
    
    const symbolBytes = new TextEncoder().encode(data.symbol || '');
    const buffer = new ArrayBuffer(28 + symbolBytes.length);
    const view = new DataView(buffer);
    
    let offset = 0;
    view.setFloat64(offset, data.timestamp || Date.now(), true); offset += 8;
    view.setFloat64(offset, parseFloat(data.price) || 0, true); offset += 8;
    view.setFloat64(offset, parseFloat(data.volume) || 0, true); offset += 8;
    view.setUint32(offset, symbolBytes.length, true); offset += 4;
    
    const result = new Uint8Array(buffer);
    result.set(symbolBytes, offset);
    
    return result;
  }

  private deserializeTickData(data: Uint8Array): any {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    
    let offset = 0;
    const timestamp = view.getFloat64(offset, true); offset += 8;
    const price = view.getFloat64(offset, true); offset += 8;
    const volume = view.getFloat64(offset, true); offset += 8;
    const symbolLength = view.getUint32(offset, true); offset += 4;
    
    const symbolBytes = data.slice(offset, offset + symbolLength);
    const symbol = new TextDecoder().decode(symbolBytes);
    
    return {
      timestamp,
      price: price.toString(),
      volume: volume.toString(),
      symbol
    };
  }

  // Order book serialization (delta compression for efficiency)
  private serializeOrderBookData(data: any): Uint8Array {
    // Simplified orderbook serialization
    // In production, this would use delta compression
    return this.serializeGenericData(data);
  }

  private deserializeOrderBookData(data: Uint8Array): any {
    return this.deserializeGenericData(data);
  }

  // Trade data serialization
  private serializeTradeData(data: any): Uint8Array {
    const symbolBytes = new TextEncoder().encode(data.symbol || '');
    const buffer = new ArrayBuffer(32 + symbolBytes.length);
    const view = new DataView(buffer);
    
    let offset = 0;
    view.setFloat64(offset, data.timestamp || Date.now(), true); offset += 8;
    view.setFloat64(offset, parseFloat(data.price) || 0, true); offset += 8;
    view.setFloat64(offset, parseFloat(data.quantity) || 0, true); offset += 8;
    view.setUint8(offset, data.side === 'buy' ? 1 : 0); offset += 1;
    view.setUint8(offset, 0); // padding
    view.setUint16(offset, 0, true); offset += 2; // padding
    view.setUint32(offset, symbolBytes.length, true); offset += 4;
    
    const result = new Uint8Array(buffer);
    result.set(symbolBytes, offset);
    
    return result;
  }

  private deserializeTradeData(data: Uint8Array): any {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    
    let offset = 0;
    const timestamp = view.getFloat64(offset, true); offset += 8;
    const price = view.getFloat64(offset, true); offset += 8;
    const quantity = view.getFloat64(offset, true); offset += 8;
    const side = view.getUint8(offset) === 1 ? 'buy' : 'sell'; offset += 1;
    offset += 3; // skip padding
    const symbolLength = view.getUint32(offset, true); offset += 4;
    
    const symbolBytes = data.slice(offset, offset + symbolLength);
    const symbol = new TextDecoder().decode(symbolBytes);
    
    return {
      timestamp,
      price: price.toString(),
      quantity: quantity.toString(),
      side,
      symbol
    };
  }

  // Generic serialization fallback (uses MessagePack-like format)
  private serializeGenericData(data: any): Uint8Array {
    // Simple JSON-based serialization as fallback
    // In production, this would use MessagePack or similar efficient format
    const jsonString = JSON.stringify(data);
    return new TextEncoder().encode(jsonString);
  }

  private deserializeGenericData(data: Uint8Array): any {
    const jsonString = new TextDecoder().decode(data);
    return JSON.parse(jsonString);
  }

  // Position, portfolio, and prediction serializers (simplified)
  private serializeOrderData(data: any): Uint8Array {
    return this.serializeGenericData(data);
  }

  private deserializeOrderData(data: Uint8Array): any {
    return this.deserializeGenericData(data);
  }

  private serializePositionData(data: any): Uint8Array {
    return this.serializeGenericData(data);
  }

  private deserializePositionData(data: Uint8Array): any {
    return this.deserializeGenericData(data);
  }

  private serializePortfolioData(data: any): Uint8Array {
    return this.serializeGenericData(data);
  }

  private deserializePortfolioData(data: Uint8Array): any {
    return this.deserializeGenericData(data);
  }

  private serializePredictionData(data: any): Uint8Array {
    return this.serializeGenericData(data);
  }

  private deserializePredictionData(data: Uint8Array): any {
    return this.deserializeGenericData(data);
  }

  // Header serialization/deserialization
  private serializeHeader(header: MessageHeader): Uint8Array {
    const messageIdBytes = new TextEncoder().encode(header.messageId);
    const buffer = new ArrayBuffer(40 + messageIdBytes.length); // Fixed size + variable messageId
    const view = new DataView(buffer);
    
    let offset = 0;
    view.setUint32(offset, header.version, true); offset += 4;
    view.setUint32(offset, this.messageTypeToNumber(header.type), true); offset += 4;
    view.setFloat64(offset, header.timestamp, true); offset += 8;
    view.setUint32(offset, header.size, true); offset += 4;
    view.setUint8(offset, header.compressed ? 1 : 0); offset += 1;
    view.setUint8(offset, header.isChunk ? 1 : 0); offset += 1;
    view.setUint16(offset, header.chunkIndex || 0, true); offset += 2;
    view.setUint16(offset, header.totalChunks || 0, true); offset += 2;
    view.setUint32(offset, header.checksum || 0, true); offset += 4;
    view.setUint32(offset, messageIdBytes.length, true); offset += 4;
    
    const result = new Uint8Array(buffer);
    result.set(messageIdBytes, offset);
    
    return result;
  }

  private deserializeHeader(data: Uint8Array): { header: MessageHeader; payloadOffset: number } {
    if (data.length < 36) {
      throw new Error('Invalid header: insufficient data');
    }
    
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    
    let offset = 0;
    const version = view.getUint32(offset, true); offset += 4;
    const type = this.numberToMessageType(view.getUint32(offset, true)); offset += 4;
    const timestamp = view.getFloat64(offset, true); offset += 8;
    const size = view.getUint32(offset, true); offset += 4;
    const compressed = view.getUint8(offset) === 1; offset += 1;
    const isChunk = view.getUint8(offset) === 1; offset += 1;
    const chunkIndex = view.getUint16(offset, true); offset += 2;
    const totalChunks = view.getUint16(offset, true); offset += 2;
    const checksum = view.getUint32(offset, true); offset += 4;
    const messageIdLength = view.getUint32(offset, true); offset += 4;
    
    const messageIdBytes = data.slice(offset, offset + messageIdLength);
    const messageId = new TextDecoder().decode(messageIdBytes);
    offset += messageIdLength;
    
    const header: MessageHeader = {
      version,
      type,
      timestamp,
      messageId,
      compressed,
      size,
      checksum,
      isChunk: isChunk || undefined,
      chunkIndex: chunkIndex || undefined,
      totalChunks: totalChunks || undefined
    };
    
    return { header, payloadOffset: offset };
  }

  // Compression methods
  private async compress(data: Uint8Array): Promise<Uint8Array> {
    // Check cache first
    const cacheKey = this.calculateChecksum(data).toString();
    if (this.compressionCache.has(cacheKey)) {
      return this.compressionCache.get(cacheKey)!;
    }

    let compressed: Uint8Array;

    switch (this.config.compression) {
      case 'gzip':
        compressed = await this.gzipCompress(data);
        break;
      case 'brotli':
        compressed = await this.brotliCompress(data);
        break;
      default:
        compressed = data;
    }

    // Cache compressed data
    if (compressed.length < data.length * 0.8) { // Only cache if significant compression
      this.compressionCache.set(cacheKey, compressed);
    }

    return compressed;
  }

  private async decompress(data: Uint8Array): Promise<Uint8Array> {
    switch (this.config.compression) {
      case 'gzip':
        return await this.gzipDecompress(data);
      case 'brotli':
        return await this.brotliDecompress(data);
      default:
        return data;
    }
  }

  // Simplified compression implementations (would use actual compression libraries)
  private async gzipCompress(data: Uint8Array): Promise<Uint8Array> {
    // Placeholder - would use actual gzip compression
    return data;
  }

  private async gzipDecompress(data: Uint8Array): Promise<Uint8Array> {
    // Placeholder - would use actual gzip decompression
    return data;
  }

  private async brotliCompress(data: Uint8Array): Promise<Uint8Array> {
    // Placeholder - would use actual brotli compression
    return data;
  }

  private async brotliDecompress(data: Uint8Array): Promise<Uint8Array> {
    // Placeholder - would use actual brotli decompression
    return data;
  }

  // Streaming message handling
  private async handleStreamingChunk(header: MessageHeader, chunk: Uint8Array): Promise<WebSocketMessage> {
    const messageId = header.messageId;
    
    if (!this.streamingMessages.has(messageId)) {
      // First chunk
      this.streamingMessages.set(messageId, {
        messageId,
        totalChunks: header.totalChunks!,
        receivedChunks: new Map(),
        startTime: Date.now(),
        timeout: setTimeout(() => {
          this.streamingMessages.delete(messageId);
        }, 30000) // 30 second timeout
      });
    }
    
    const streamState = this.streamingMessages.get(messageId)!;
    streamState.receivedChunks.set(header.chunkIndex!, chunk);
    
    // Check if all chunks received
    if (streamState.receivedChunks.size === streamState.totalChunks) {
      clearTimeout(streamState.timeout);
      
      // Reassemble message
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < streamState.totalChunks; i++) {
        const chunk = streamState.receivedChunks.get(i);
        if (!chunk) {
          throw new Error(`Missing chunk ${i} for message ${messageId}`);
        }
        chunks.push(chunk);
      }
      
      // Combine chunks
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      
      this.streamingMessages.delete(messageId);
      
      // Deserialize complete message
      return await this.deserialize(combined);
    }
    
    // Return partial message indicator
    throw new Error('PARTIAL_MESSAGE'); // Special error to indicate streaming in progress
  }

  // Utility methods
  private messageTypeToNumber(type: MessageType): number {
    const typeMap: Record<MessageType, number> = {
      'tick': 1, 'orderbook': 2, 'trade': 3, 'order': 4, 
      'position': 5, 'portfolio': 6, 'prediction': 7, 'system': 8, 'error': 9
    };
    return typeMap[type] || 0;
  }

  private numberToMessageType(num: number): MessageType {
    const typeMap: Record<number, MessageType> = {
      1: 'tick', 2: 'orderbook', 3: 'trade', 4: 'order',
      5: 'position', 6: 'portfolio', 7: 'prediction', 8: 'system', 9: 'error'
    };
    return typeMap[num] || 'tick';
  }

  private calculateChecksum(data: Uint8Array): number {
    let checksum = 0;
    for (let i = 0; i < data.length; i++) {
      checksum = (checksum + data[i]) & 0xFFFFFFFF;
    }
    return checksum;
  }

  private readUint32(data: Uint8Array, offset: number): number {
    const view = new DataView(data.buffer, data.byteOffset + offset, 4);
    return view.getUint32(0, true);
  }

  private generateMessageId(): string {
    return `pb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async validateMessage(message: WebSocketMessage): Promise<void> {
    const schemaKey = `${message.type}_v${this.config.version}`;
    const schema = this.schemas.get(schemaKey);
    
    if (!schema) {
      return; // No schema to validate against
    }
    
    const startTime = performance.now();
    
    try {
      // Validate required fields
      for (const field of schema.requiredFields) {
        if (!(field in message.data)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
      
      // Validate field types and constraints
      for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
        const value = message.data[fieldName];
        
        if (value === undefined || value === null) {
          if (!fieldDef.optional && !schema.requiredFields.includes(fieldName)) {
            throw new Error(`Field ${fieldName} cannot be null/undefined`);
          }
          continue;
        }
        
        // Type validation
        if (!this.validateFieldType(value, fieldDef)) {
          throw new Error(`Invalid type for field ${fieldName}: expected ${fieldDef.type}`);
        }
        
        // Constraint validation
        if (fieldDef.validation && !this.validateFieldConstraints(value, fieldDef.validation)) {
          throw new Error(`Field ${fieldName} violates constraints`);
        }
      }
      
    } finally {
      this.metrics.schemaValidationTime += performance.now() - startTime;
    }
  }

  private validateFieldType(value: any, fieldDef: FieldDefinition): boolean {
    switch (fieldDef.type) {
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number' && !isNaN(value);
      case 'boolean': return typeof value === 'boolean';
      case 'array': return Array.isArray(value);
      case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'bytes': return value instanceof Uint8Array;
      default: return true;
    }
  }

  private validateFieldConstraints(value: any, validation: NonNullable<FieldDefinition['validation']>): boolean {
    if (validation.min !== undefined && value < validation.min) return false;
    if (validation.max !== undefined && value > validation.max) return false;
    if (validation.length !== undefined && value.length !== validation.length) return false;
    if (validation.pattern && !validation.pattern.test(value)) return false;
    return true;
  }

  private registerDefaultSchemas(): void {
    // Register schema for tick data
    this.registerSchema({
      type: 'tick',
      version: 1,
      fields: {
        symbol: { type: 'string' },
        price: { type: 'string' },
        volume: { type: 'string' },
        timestamp: { type: 'number' }
      },
      requiredFields: ['symbol', 'price', 'timestamp']
    });

    // Register schema for trade data
    this.registerSchema({
      type: 'trade',
      version: 1,
      fields: {
        symbol: { type: 'string' },
        price: { type: 'string' },
        quantity: { type: 'string' },
        side: { type: 'string' },
        timestamp: { type: 'number' }
      },
      requiredFields: ['symbol', 'price', 'quantity', 'side', 'timestamp']
    });
  }

  private initializeMetrics(): ProtocolMetrics {
    return {
      totalMessages: 0,
      bytesProcessed: 0,
      compressionRatio: 1.0,
      averageSerializationTime: 0,
      averageDeserializationTime: 0,
      errorCount: 0,
      schemaValidationTime: 0,
      lastActivity: Date.now()
    };
  }

  private updateSerializationMetrics(bytes: number, time: number): void {
    this.metrics.totalMessages++;
    this.metrics.bytesProcessed += bytes;
    this.metrics.averageSerializationTime = 
      (this.metrics.averageSerializationTime * 0.9) + (time * 0.1);
    this.metrics.lastActivity = Date.now();
  }

  private updateDeserializationMetrics(bytes: number, time: number): void {
    this.metrics.bytesProcessed += bytes;
    this.metrics.averageDeserializationTime = 
      (this.metrics.averageDeserializationTime * 0.9) + (time * 0.1);
    this.metrics.lastActivity = Date.now();
  }

  private clearStreamingMessages(): void {
    this.streamingMessages.forEach(state => {
      clearTimeout(state.timeout);
    });
    this.streamingMessages.clear();
  }
}