const axios = require('axios');
const cron = require('node-cron');

class CryptoService {
  constructor() {
    this.baseURL = process.env.BINANCE_API_URL || 'https://api.binance.com/api/v3';
    this.prices = {
      BTCUSDT: { price: 0, change: 0, timestamp: null },
      ETHUSDT: { price: 0, change: 0, timestamp: null },
      USDTUSDT: { price: 1, change: 0, timestamp: null }
    };
    this.io = null;
    this.updateInterval = null;
  }

  // Initialize with Socket.io instance
  init(io) {
    this.io = io;
  }

  // Get current prices from Binance
  async getCurrentPrices() {
    try {
      const symbols = ['BTCUSDT', 'ETHUSDT'];
      const response = await axios.get(`${this.baseURL}/ticker/24hr`, {
        params: {
          symbols: JSON.stringify(symbols)
        },
        timeout: 10000
      });

      const priceData = {};
      
      if (Array.isArray(response.data)) {
        response.data.forEach(ticker => {
          priceData[ticker.symbol] = {
            price: parseFloat(ticker.lastPrice),
            change: parseFloat(ticker.priceChangePercent),
            volume: parseFloat(ticker.volume),
            high: parseFloat(ticker.highPrice),
            low: parseFloat(ticker.lowPrice),
            timestamp: new Date()
          };
        });
      }

      // Add USDT (always 1.00)
      priceData.USDTUSDT = {
        price: 1.00,
        change: 0,
        volume: 0,
        high: 1.00,
        low: 1.00,
        timestamp: new Date()
      };

      return priceData;
    } catch (error) {
      console.error('Error fetching crypto prices:', error.message);
      
      // Return cached prices if API fails
      return this.prices;
    }
  }

  // Get specific coin price
  async getCoinPrice(symbol) {
    try {
      const response = await axios.get(`${this.baseURL}/ticker/price`, {
        params: { symbol: symbol.toUpperCase() },
        timeout: 5000
      });

      return {
        symbol: response.data.symbol,
        price: parseFloat(response.data.price),
        timestamp: new Date()
      };
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error.message);
      
      // Return cached price if available
      if (this.prices[symbol.toUpperCase()]) {
        return {
          symbol: symbol.toUpperCase(),
          price: this.prices[symbol.toUpperCase()].price,
          timestamp: this.prices[symbol.toUpperCase()].timestamp
        };
      }
      
      throw new Error(`Unable to fetch price for ${symbol}`);
    }
  }

  // Update prices and broadcast to connected clients
  async updatePrices() {
    try {
      const newPrices = await this.getCurrentPrices();
      
      // Update cached prices
      Object.keys(newPrices).forEach(symbol => {
        this.prices[symbol] = newPrices[symbol];
      });

      // Broadcast to all connected clients
      if (this.io) {
        this.io.emit('crypto-prices', {
          prices: this.prices,
          timestamp: new Date()
        });
      }

      console.log('Crypto prices updated:', Object.keys(this.prices).map(symbol => 
        `${symbol}: $${this.prices[symbol].price.toFixed(2)}`
      ).join(', '));

    } catch (error) {
      console.error('Error updating crypto prices:', error.message);
    }
  }

  // Start automatic price updates
  startPriceUpdates(io) {
    this.io = io;
    
    // Initial price fetch
    this.updatePrices();

    // Update prices every 30 seconds
    this.updateInterval = setInterval(() => {
      this.updatePrices();
    }, 30000);

    // Also schedule updates using cron (every minute as backup)
    cron.schedule('* * * * *', () => {
      this.updatePrices();
    });

    console.log('Crypto price updates started - updating every 30 seconds');
  }

  // Stop price updates
  stopPriceUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    console.log('Crypto price updates stopped');
  }

  // Get cached prices
  getCachedPrices() {
    return {
      prices: this.prices,
      timestamp: new Date()
    };
  }

  // Convert amount from one currency to another
  async convertCurrency(amount, fromSymbol, toSymbol = 'USDT') {
    try {
      if (fromSymbol === toSymbol) {
        return amount;
      }

      const fromPrice = await this.getCoinPrice(`${fromSymbol}USDT`);
      
      if (toSymbol === 'USDT') {
        return amount * fromPrice.price;
      }

      const toPrice = await this.getCoinPrice(`${toSymbol}USDT`);
      return (amount * fromPrice.price) / toPrice.price;
      
    } catch (error) {
      console.error('Error converting currency:', error.message);
      throw new Error(`Unable to convert ${fromSymbol} to ${toSymbol}`);
    }
  }

  // Get historical price data (simplified - using current price)
  async getHistoricalData(symbol, interval = '1d', limit = 30) {
    try {
      const response = await axios.get(`${this.baseURL}/klines`, {
        params: {
          symbol: symbol.toUpperCase(),
          interval,
          limit
        },
        timeout: 10000
      });

      return response.data.map(kline => ({
        timestamp: new Date(kline[0]),
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5])
      }));
    } catch (error) {
      console.error('Error fetching historical data:', error.message);
      throw new Error(`Unable to fetch historical data for ${symbol}`);
    }
  }

  // Validate crypto address (basic validation)
  validateCryptoAddress(address, currency) {
    const patterns = {
      BTC: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
      ETH: /^0x[a-fA-F0-9]{40}$/,
      USDT: /^0x[a-fA-F0-9]{40}$|^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/ // Can be ERC-20 or Omni
    };

    const pattern = patterns[currency.toUpperCase()];
    if (!pattern) {
      return false;
    }

    return pattern.test(address);
  }

  // Get market summary
  async getMarketSummary() {
    try {
      const prices = await this.getCurrentPrices();
      
      return {
        totalMarketCap: 0, // Would need additional API for this
        totalVolume: Object.values(prices).reduce((sum, coin) => sum + (coin.volume || 0), 0),
        dominance: {
          BTC: 0, // Would need additional calculation
          ETH: 0
        },
        prices: prices,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error('Error getting market summary:', error.message);
      throw new Error('Unable to fetch market summary');
    }
  }

  // Health check for the service
  async healthCheck() {
    try {
      const response = await axios.get(`${this.baseURL}/ping`, { timeout: 5000 });
      return {
        status: 'healthy',
        binanceAPI: response.status === 200 ? 'connected' : 'disconnected',
        lastPriceUpdate: this.prices.BTCUSDT.timestamp,
        cachedPrices: Object.keys(this.prices).length
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        binanceAPI: 'disconnected',
        error: error.message,
        lastPriceUpdate: this.prices.BTCUSDT.timestamp,
        cachedPrices: Object.keys(this.prices).length
      };
    }
  }
}

// Create singleton instance
const cryptoService = new CryptoService();

module.exports = cryptoService;
