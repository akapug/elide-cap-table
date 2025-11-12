// Dilution calculator for cap table scenarios
// Handles ownership %, SAFE conversion, and dilution impact

/**
 * Calculate ownership percentages for all holders
 * @param {Object} capTable - The cap table data
 * @returns {Map} holder name -> ownership %
 */
export function calculateOwnership(capTable) {
  const totalShares = capTable.rounds.reduce((sum, round) => {
    return sum + round.allocations.reduce((rSum, alloc) => rSum + alloc.shares, 0);
  }, 0);

  const ownership = new Map();
  
  capTable.rounds.forEach(round => {
    round.allocations.forEach(alloc => {
      const current = ownership.get(alloc.holderName) || 0;
      ownership.set(alloc.holderName, current + (alloc.shares / totalShares) * 100);
    });
  });

  return ownership;
}

/**
 * Calculate pre-money and post-money valuation for a round
 * @param {number} pricePerShare - Price per share in the round
 * @param {number} sharesBeforeRound - Total shares before this round
 * @param {number} moneyRaised - Amount raised in this round
 * @returns {Object} { preMoney, postMoney, newShares }
 */
export function calculateValuation(pricePerShare, sharesBeforeRound, moneyRaised) {
  const preMoney = pricePerShare * sharesBeforeRound;
  const newShares = moneyRaised / pricePerShare;
  const postMoney = preMoney + moneyRaised;
  
  return { preMoney, postMoney, newShares };
}

/**
 * Convert SAFE notes to shares when a priced round is added
 * @param {Object} capTable - The cap table with all rounds
 * @param {number} postMoneyValuation - Post-money valuation of the priced round
 * @param {number} pricePerShare - Price per share in the priced round
 * @returns {Object} { conversions: Array, updatedRounds: Array }
 */
export function convertSAFEs(capTable, postMoneyValuation, pricePerShare) {
  const conversions = [];
  const updatedRounds = [];

  capTable.rounds.forEach(round => {
    if (round.type !== 'safe' || !round.valuationCap) {
      updatedRounds.push(round);
      return;
    }

    // SAFE conversion price per share is the better of cap-based price and round price:
    // capPrice = valuationCap / preMoneyCapShares; conversionPrice = Math.min(pricePerShare, capPrice)
    // Where preMoneyCapShares includes non-SAFE issued shares PLUS authorized equity pool (market-standard capitalization base)
    const nonPoolIssuedExclSafes = capTable.rounds
      .filter(r => (r.type !== 'safe' || r.converted) && r.type !== 'equity-pool')
      .reduce((sum, r) => sum + r.allocations.reduce((s, a) => s + a.shares, 0), 0);
    const authorizedPool = capTable.rounds
      .filter(r => r.type === 'equity-pool')
      .reduce((sum, r) => sum + (r.authorizedShares || 0), 0);
    const preMoneyCapShares = Math.max(nonPoolIssuedExclSafes + authorizedPool, 1);
    const capPrice = round.valuationCap / preMoneyCapShares;
    const conversionPrice = Math.min(pricePerShare, capPrice);
    const conversionDiscount = Math.max(0, 1 - (conversionPrice / pricePerShare));

    const updatedAllocations = round.allocations.map(alloc => {
      // Use investment amount if available, otherwise estimate from shares and cap
      let investmentAmount = alloc.investmentAmount;
      if (!investmentAmount) {
        // Back-calculate from pre-priced as-if shares formula using the same capitalization base
        investmentAmount = alloc.shares * (round.valuationCap / preMoneyCapShares);
      }

      const convertedShares = Math.round(investmentAmount / conversionPrice);

      conversions.push({
        holderName: alloc.holderName,
        originalShares: alloc.shares,
        convertedShares: convertedShares,
        investmentAmount: investmentAmount,
        conversionPrice: conversionPrice,
        discount: conversionDiscount * 100,
        roundName: round.name
      });

      // Return updated allocation with converted shares
      return {
        ...alloc,
        shares: convertedShares,
        convertedFrom: 'SAFE',
        originalShares: alloc.shares,
        conversionPrice: conversionPrice
      };
    });

    // Mark round as converted
    updatedRounds.push({
      ...round,
      allocations: updatedAllocations,
      converted: true,
      conversionPrice: conversionPrice
    });
  });

  return { conversions, updatedRounds };
}

/**
 * Calculate dilution impact when adding a new round
 * @param {Object} capTable - Current cap table
 * @param {number} moneyRaised - Amount to raise in new round
 * @param {number} pricePerShare - Price per share in new round
 * @returns {Object} Dilution analysis
 */
export function calculateDilution(capTable, moneyRaised, pricePerShare) {
  const currentOwnership = calculateOwnership(capTable);
  
  const currentTotalShares = capTable.rounds.reduce((sum, round) => {
    return sum + round.allocations.reduce((rSum, alloc) => rSum + alloc.shares, 0);
  }, 0);
  
  const newShares = moneyRaised / pricePerShare;
  const postMoneyShares = currentTotalShares + newShares;
  
  const dilutionImpact = new Map();
  currentOwnership.forEach((currentPct, holder) => {
    const currentShares = (currentPct / 100) * currentTotalShares;
    const postMoneyPct = (currentShares / postMoneyShares) * 100;
    const dilutionPct = currentPct - postMoneyPct;
    
    dilutionImpact.set(holder, {
      currentOwnership: currentPct,
      postMoneyOwnership: postMoneyPct,
      dilution: dilutionPct,
      dilutionPercent: (dilutionPct / currentPct) * 100
    });
  });
  
  const valuation = calculateValuation(pricePerShare, currentTotalShares, moneyRaised);
  
  return {
    currentTotalShares,
    newShares,
    postMoneyShares,
    preMoney: valuation.preMoney,
    postMoney: valuation.postMoney,
    dilutionImpact
  };
}

/**
 * Format ownership percentage for display
 */
export function formatOwnership(percentage) {
  if (percentage >= 1) {
    return percentage.toFixed(2) + '%';
  } else if (percentage >= 0.01) {
    return percentage.toFixed(3) + '%';
  } else {
    return percentage.toFixed(4) + '%';
  }
}

/**
 * Format currency for display
 */
export function formatCurrency(amount) {
  if (amount >= 1000000) {
    return '$' + (amount / 1000000).toFixed(2) + 'M';
  } else if (amount >= 1000) {
    return '$' + (amount / 1000).toFixed(0) + 'K';
  } else {
    return '$' + amount.toFixed(0);
  }
}

