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
 * @param {Array} safeRounds - Array of SAFE rounds
 * @param {number} pricedRoundValuation - Post-money valuation of the priced round
 * @param {number} pricePerShare - Price per share in the priced round
 * @returns {Array} Converted allocations with actual share counts
 */
export function convertSAFEs(safeRounds, pricedRoundValuation, pricePerShare) {
  const conversions = [];
  
  safeRounds.forEach(round => {
    if (round.type !== 'safe' || !round.valuationCap) return;
    
    // SAFE conversion formula:
    // Conversion price = min(valuation cap / post-money valuation, discount) * price per share
    // For simplicity, we'll use: conversion price = (valuation cap / post-money valuation) * price per share
    const conversionDiscount = Math.min(1, round.valuationCap / pricedRoundValuation);
    const conversionPrice = conversionDiscount * pricePerShare;
    
    round.allocations.forEach(alloc => {
      // Assume the SAFE investment amount is stored in a field, or calculate from shares
      // For now, we'll back-calculate the investment from current shares and valuation cap
      const impliedInvestment = alloc.shares * (round.valuationCap / 12893506); // TODO: use actual authorized shares
      const convertedShares = Math.round(impliedInvestment / conversionPrice);
      
      conversions.push({
        holderName: alloc.holderName,
        originalShares: alloc.shares,
        convertedShares: convertedShares,
        conversionPrice: conversionPrice,
        discount: (1 - conversionDiscount) * 100,
        roundName: round.name
      });
    });
  });
  
  return conversions;
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

