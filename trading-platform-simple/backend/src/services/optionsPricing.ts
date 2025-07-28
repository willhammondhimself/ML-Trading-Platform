import { logger } from '../utils/logger';

interface OptionInputs {
  stockPrice: number;       // Current stock price (S)
  strikePrice: number;      // Strike price (K)
  timeToExpiration: number; // Time to expiration in years (T)
  riskFreeRate: number;     // Risk-free interest rate (r)
  volatility: number;       // Implied volatility (σ)
  dividendYield?: number;   // Dividend yield (q) - optional
}

interface OptionPricing {
  call: {
    price: number;
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  put: {
    price: number;
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  intrinsicValue: {
    call: number;
    put: number;
  };
  timeValue: {
    call: number;
    put: number;
  };
}

interface ImpliedVolatilityResult {
  impliedVolatility: number;
  iterations: number;
  error: number;
}

export class OptionsPricingService {
  /**
   * Calculate normal cumulative distribution function
   */
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2.0);
    
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    
    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Calculate normal probability density function
   */
  private normalPDF(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  /**
   * Calculate d1 parameter for Black-Scholes formula
   */
  private calculateD1(inputs: OptionInputs): number {
    const { stockPrice, strikePrice, timeToExpiration, riskFreeRate, volatility, dividendYield = 0 } = inputs;
    
    return (Math.log(stockPrice / strikePrice) + 
            (riskFreeRate - dividendYield + 0.5 * volatility * volatility) * timeToExpiration) /
           (volatility * Math.sqrt(timeToExpiration));
  }

  /**
   * Calculate d2 parameter for Black-Scholes formula
   */
  private calculateD2(inputs: OptionInputs): number {
    const d1 = this.calculateD1(inputs);
    return d1 - inputs.volatility * Math.sqrt(inputs.timeToExpiration);
  }

  /**
   * Calculate Black-Scholes option prices and Greeks
   */
  calculateOptionPricing(inputs: OptionInputs): OptionPricing {
    try {
      const { stockPrice, strikePrice, timeToExpiration, riskFreeRate, volatility, dividendYield = 0 } = inputs;
      
      // Validate inputs
      if (stockPrice <= 0 || strikePrice <= 0 || timeToExpiration < 0 || volatility < 0) {
        throw new Error('Invalid option pricing inputs');
      }

      const d1 = this.calculateD1(inputs);
      const d2 = this.calculateD2(inputs);
      
      const nd1 = this.normalCDF(d1);
      const nd2 = this.normalCDF(d2);
      const n_d1 = this.normalCDF(-d1);
      const n_d2 = this.normalCDF(-d2);
      const pdf_d1 = this.normalPDF(d1);
      
      const discountFactor = Math.exp(-riskFreeRate * timeToExpiration);
      const dividendFactor = Math.exp(-dividendYield * timeToExpiration);
      
      // Option prices
      const callPrice = stockPrice * dividendFactor * nd1 - strikePrice * discountFactor * nd2;
      const putPrice = strikePrice * discountFactor * n_d2 - stockPrice * dividendFactor * n_d1;
      
      // Greeks calculations
      const sqrtT = Math.sqrt(timeToExpiration);
      
      // Delta
      const callDelta = dividendFactor * nd1;
      const putDelta = dividendFactor * (nd1 - 1);
      
      // Gamma (same for calls and puts)
      const gamma = (dividendFactor * pdf_d1) / (stockPrice * volatility * sqrtT);
      
      // Theta
      const theta1 = -(stockPrice * dividendFactor * pdf_d1 * volatility) / (2 * sqrtT);
      const theta2Call = riskFreeRate * strikePrice * discountFactor * nd2;
      const theta2Put = -riskFreeRate * strikePrice * discountFactor * n_d2;
      const theta3 = dividendYield * stockPrice * dividendFactor;
      
      const callTheta = (theta1 - theta2Call - theta3 * nd1) / 365; // Per day
      const putTheta = (theta1 + theta2Put + theta3 * n_d1) / 365; // Per day
      
      // Vega (same for calls and puts)
      const vega = (stockPrice * dividendFactor * pdf_d1 * sqrtT) / 100;
      
      // Rho
      const callRho = (strikePrice * timeToExpiration * discountFactor * nd2) / 100;
      const putRho = (-strikePrice * timeToExpiration * discountFactor * n_d2) / 100;
      
      // Intrinsic values
      const callIntrinsic = Math.max(stockPrice - strikePrice, 0);
      const putIntrinsic = Math.max(strikePrice - stockPrice, 0);
      
      // Time values
      const callTimeValue = callPrice - callIntrinsic;
      const putTimeValue = putPrice - putIntrinsic;

      return {
        call: {
          price: callPrice,
          delta: callDelta,
          gamma: gamma,
          theta: callTheta,
          vega: vega,
          rho: callRho
        },
        put: {
          price: putPrice,
          delta: putDelta,
          gamma: gamma,
          theta: putTheta,
          vega: vega,
          rho: putRho
        },
        intrinsicValue: {
          call: callIntrinsic,
          put: putIntrinsic
        },
        timeValue: {
          call: callTimeValue,
          put: putTimeValue
        }
      };
    } catch (error) {
      logger.error('Error calculating option pricing:', error);
      throw error;
    }
  }

  /**
   * Calculate implied volatility using Newton-Raphson method
   */
  calculateImpliedVolatility(
    marketPrice: number,
    optionType: 'call' | 'put',
    inputs: Omit<OptionInputs, 'volatility'>,
    tolerance = 0.0001,
    maxIterations = 100
  ): ImpliedVolatilityResult {
    try {
      let volatility = 0.5; // Initial guess: 50%
      let iterations = 0;
      let error = Infinity;

      while (Math.abs(error) > tolerance && iterations < maxIterations) {
        const pricing = this.calculateOptionPricing({ ...inputs, volatility });
        const theoreticalPrice = optionType === 'call' ? pricing.call.price : pricing.put.price;
        const vega = pricing.call.vega; // Vega is the same for calls and puts
        
        error = theoreticalPrice - marketPrice;
        
        if (Math.abs(vega) < 1e-10) {
          throw new Error('Vega too small, cannot converge');
        }
        
        volatility = volatility - error / (vega * 100); // Vega is per 100 basis points
        
        // Ensure volatility stays positive
        volatility = Math.max(volatility, 0.001);
        
        iterations++;
      }

      if (iterations >= maxIterations) {
        logger.warn(`Implied volatility calculation did not converge after ${maxIterations} iterations`);
      }

      return {
        impliedVolatility: volatility,
        iterations,
        error: Math.abs(error)
      };
    } catch (error) {
      logger.error('Error calculating implied volatility:', error);
      throw error;
    }
  }

  /**
   * Calculate option value at different spot prices (for payoff diagrams)
   */
  calculatePayoffDiagram(
    inputs: OptionInputs,
    spotPriceRange: { min: number; max: number; steps: number }
  ): Array<{
    spotPrice: number;
    callValue: number;
    putValue: number;
    callIntrinsic: number;
    putIntrinsic: number;
  }> {
    const results = [];
    const step = (spotPriceRange.max - spotPriceRange.min) / spotPriceRange.steps;

    for (let i = 0; i <= spotPriceRange.steps; i++) {
      const spotPrice = spotPriceRange.min + i * step;
      const modifiedInputs = { ...inputs, stockPrice: spotPrice };
      
      try {
        const pricing = this.calculateOptionPricing(modifiedInputs);
        
        results.push({
          spotPrice,
          callValue: pricing.call.price,
          putValue: pricing.put.price,
          callIntrinsic: pricing.intrinsicValue.call,
          putIntrinsic: pricing.intrinsicValue.put
        });
      } catch (error) {
        logger.error(`Error calculating payoff for spot price ${spotPrice}:`, error);
      }
    }

    return results;
  }

  /**
   * Get option chain data (mock implementation with realistic pricing)
   */
  getOptionChain(symbol: string, stockPrice: number, expirationDates: string[]): any {
    try {
      const riskFreeRate = 0.05; // 5% risk-free rate
      const volatility = 0.25; // 25% implied volatility
      
      const chain = expirationDates.map(expDate => {
        const daysToExpiration = Math.max(1, Math.ceil((new Date(expDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        const timeToExpiration = daysToExpiration / 365;
        
        // Generate strikes around current price
        const strikes = [];
        const baseStrike = Math.round(stockPrice / 5) * 5; // Round to nearest $5
        
        for (let i = -10; i <= 10; i++) {
          strikes.push(baseStrike + i * 5);
        }
        
        const options = strikes.map(strike => {
          const inputs: OptionInputs = {
            stockPrice,
            strikePrice: strike,
            timeToExpiration,
            riskFreeRate,
            volatility: volatility + (Math.random() - 0.5) * 0.1 // Add some randomness
          };
          
          const pricing = this.calculateOptionPricing(inputs);
          
          return {
            strike,
            call: {
              price: pricing.call.price,
              bid: pricing.call.price * 0.98,
              ask: pricing.call.price * 1.02,
              volume: Math.floor(Math.random() * 1000),
              openInterest: Math.floor(Math.random() * 5000),
              impliedVolatility: volatility,
              delta: pricing.call.delta,
              gamma: pricing.call.gamma,
              theta: pricing.call.theta,
              vega: pricing.call.vega
            },
            put: {
              price: pricing.put.price,
              bid: pricing.put.price * 0.98,
              ask: pricing.put.price * 1.02,
              volume: Math.floor(Math.random() * 1000),
              openInterest: Math.floor(Math.random() * 5000),
              impliedVolatility: volatility,
              delta: pricing.put.delta,
              gamma: pricing.put.gamma,
              theta: pricing.put.theta,
              vega: pricing.put.vega
            }
          };
        });
        
        return {
          expirationDate: expDate,
          daysToExpiration,
          options
        };
      });
      
      return {
        symbol,
        stockPrice,
        timestamp: Date.now(),
        expirations: chain
      };
    } catch (error) {
      logger.error('Error generating option chain:', error);
      throw error;
    }
  }

  /**
   * Calculate risk metrics for option positions
   */
  calculatePortfolioRisk(positions: Array<{
    type: 'call' | 'put';
    quantity: number;
    inputs: OptionInputs;
  }>): {
    totalDelta: number;
    totalGamma: number;
    totalTheta: number;
    totalVega: number;
    totalRho: number;
    maxRisk: number;
    maxReward: number;
  } {
    let totalDelta = 0;
    let totalGamma = 0;
    let totalTheta = 0;
    let totalVega = 0;
    let totalRho = 0;

    for (const position of positions) {
      const pricing = this.calculateOptionPricing(position.inputs);
      const option = position.type === 'call' ? pricing.call : pricing.put;
      
      totalDelta += option.delta * position.quantity;
      totalGamma += option.gamma * position.quantity;
      totalTheta += option.theta * position.quantity;
      totalVega += option.vega * position.quantity;
      totalRho += option.rho * position.quantity;
    }

    // Calculate max risk/reward (simplified)
    const maxRisk = positions.reduce((risk, pos) => {
      const pricing = this.calculateOptionPricing(pos.inputs);
      const optionPrice = pos.type === 'call' ? pricing.call.price : pricing.put.price;
      return risk + (pos.quantity < 0 ? Math.abs(pos.quantity) * optionPrice : 0);
    }, 0);

    const maxReward = positions.reduce((reward, pos) => {
      if (pos.quantity > 0) {
        return reward + pos.quantity * pos.inputs.stockPrice; // Simplified
      }
      return reward;
    }, 0);

    return {
      totalDelta,
      totalGamma,
      totalTheta,
      totalVega,
      totalRho,
      maxRisk,
      maxReward
    };
  }
}