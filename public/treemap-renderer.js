import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// Helper function to truncate text to fit within a given width
function truncateText(text, width, fontSize) {
  // Rough estimate: each character is ~0.6 * fontSize pixels wide
  const charWidth = fontSize * 0.6;
  const maxChars = Math.floor((width - 8) / charWidth); // -8 for padding

  if (text.length <= maxChars) {
    return text;
  }

  // Truncate and add ellipsis
  return text.substring(0, maxChars - 1) + "…";
}

// Render treemap with nested allocations visible (WinDirStat style)
export function renderTreemap(capTable, viewMode, zoomNode, onNodeClick, unallocColorMode = "grey") {
  const container = document.getElementById("treemap");
  const width = container.clientWidth;
  const height = container.clientHeight;

  // Store reference to onNodeClick for double-click handler
  window._onNodeClick = onNodeClick;

  // Clear previous
  container.innerHTML = "";

  // Create SVG
  const svg = d3
    .create("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", width)
    .attr("height", height)
    .style("font", "10px sans-serif");

  // Convert to tree
  const root = capTableToTree(capTable, viewMode);

  // Create treemap layout
  const treemap = d3
    .treemap()
    .size([width, height])
    .paddingOuter(3)
    .paddingTop(19)
    .paddingInner(1)
    .round(true);

  // Compute layout
  const hierarchy = d3
    .hierarchy(root)
    .sum((d) => d.value)
    .sort((a, b) => b.value - a.value);

  treemap(hierarchy);

  // Determine which nodes to show and their click targets
  let nodesToShow;
  let clickTargetMap = new Map(); // Maps node to what should happen when clicked

  if (zoomNode) {
    // When zoomed, find the zoomed node and rescale its children
    const allNodes = hierarchy.descendants();
    const zoomedNode = allNodes.find((n) => n.data.name === zoomNode.data.name);

    if (zoomedNode && zoomedNode.children) {
      const scaleX = width / (zoomedNode.x1 - zoomedNode.x0);
      const scaleY = height / (zoomedNode.y1 - zoomedNode.y0);
      const offsetX = zoomedNode.x0;
      const offsetY = zoomedNode.y0;

      // Rescale all nodes
      allNodes.forEach((node) => {
        node.x0 = (node.x0 - offsetX) * scaleX;
        node.x1 = (node.x1 - offsetX) * scaleX;
        node.y0 = (node.y0 - offsetY) * scaleY;
        node.y1 = (node.y1 - offsetY) * scaleY;
      });

      // Show only the direct children of the zoomed node
      nodesToShow = zoomedNode.children;
      // Each child clicks on itself
      zoomedNode.children.forEach(child => clickTargetMap.set(child, child));
    } else {
      nodesToShow = [];
    }
  } else {
    // When not zoomed, show rounds AND their nested allocations
    // But clicking on any allocation should zoom to its parent round
    const rounds = hierarchy.children || [];
    nodesToShow = [];

    rounds.forEach(round => {
      nodesToShow.push(round);
      clickTargetMap.set(round, round); // Round clicks on itself

      // Add all descendants (allocations)
      if (round.children) {
        round.descendants().slice(1).forEach(descendant => {
          nodesToShow.push(descendant);
          clickTargetMap.set(descendant, round); // Allocation clicks zoom to parent round
        });
      }
    });
  }

  // Create groups for each node
  const leaf = svg
    .selectAll("g")
    .data(nodesToShow)
    .join("g")
    .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

  // Create pronounced drop shadow filter for 3D effect
  const defs = svg.select('defs').empty() ? svg.insert('defs', ':first-child') : svg.select('defs');

  const dropShadow = defs.append('filter')
    .attr('id', 'drop-shadow')
    .attr('height', '150%')
    .attr('width', '150%');

  dropShadow.append('feGaussianBlur')
    .attr('in', 'SourceAlpha')
    .attr('stdDeviation', 8);  // Even more blur for dramatic effect

  dropShadow.append('feOffset')
    .attr('dx', 6)  // More offset
    .attr('dy', 6)  // More offset
    .attr('result', 'offsetblur');

  dropShadow.append('feComponentTransfer')
    .append('feFuncA')
    .attr('type', 'linear')
    .attr('slope', 1.2);  // Much darker, more pronounced shadow

  const feMerge = dropShadow.append('feMerge');
  feMerge.append('feMergeNode');
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Add round header when zoomed (clickable to edit round)
  if (zoomNode && zoomNode.data) {
    const headerGroup = svg.append('g')
      .attr('class', 'round-header')
      .style('cursor', 'pointer')
      .on('click', () => {
        window.dispatchEvent(new CustomEvent('editRound', { detail: { roundId: zoomNode.data.id } }));
      });

    // Background rect for header
    headerGroup.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', 19)
      .attr('fill', zoomNode.data.roundColor || '#334155')
      .attr('opacity', 0.9);

    // Round name text
    headerGroup.append('text')
      .attr('x', 6)
      .attr('y', 13)
      .attr('fill', '#fff')
      .attr('font-weight', 'bold')
      .attr('font-size', '12px')
      .style('pointer-events', 'none')
      .style('user-select', 'none')
      .text(zoomNode.data.name + ' (click to edit)');
  }

  // Add rectangles with gradient for 3D effect (WinDirStat style)
  leaf
    .append("rect")
    .attr("fill", (d) => {
      // Ensure we have a valid color, fallback to grey if not
      let baseColor = (d.data.roundColor && d.data.roundColor.trim()) || "#6b7280";

      // Handle unallocated portions
      if (d.data.isUnallocated) {
        if (unallocColorMode === "grey") {
          baseColor = "#4b5563"; // Dark grey for unallocated
        } else if (unallocColorMode === "tinted") {
          // Use 80% opacity tint of the round color
          const roundColor = d3.color((d.data.roundColor && d.data.roundColor.trim()) || "#6b7280");
          roundColor.opacity = 0.4; // 40% opacity for darker tint
          baseColor = roundColor.formatRgb();
        }
      }

      // Create a unique gradient ID for each node
      // Remove all non-alphanumeric characters except hyphens to ensure valid CSS ID
      const safeName = d.data.name.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-');
      const gradientId = `gradient-${safeName}-${Math.random().toString(36).substr(2, 9)}`;

      // Parse base color to create lighter/darker variants with more contrast
      // Add safety check in case d3.color returns null
      const parsedColor = d3.color(baseColor);
      if (!parsedColor) {
        console.warn('Invalid color:', baseColor, 'for node:', d.data.name);
        return '#6b7280'; // Fallback to grey
      }

      const lighter = parsedColor.brighter(1.0);  // Increased from 0.8 to 1.0
      const darker = parsedColor.darker(1.2);     // Increased from 0.5 to 1.2 for much darker edges

      // Create radial gradient for more pronounced 3D effect
      const gradient = defs.append('radialGradient')
        .attr('id', gradientId)
        .attr('cx', '30%')
        .attr('cy', '30%')
        .attr('r', '80%');

      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', lighter);

      gradient.append('stop')
        .attr('offset', '50%')
        .attr('stop-color', baseColor);

      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', darker);

      return `url(#${gradientId})`;
    })
    .attr("fill-opacity", 1)
    .attr("stroke", "#000")
    .attr("stroke-width", 2)
    .attr("stroke-opacity", 0.3)
    .attr("filter", "url(#drop-shadow)")
    .attr("width", (d) => Math.max(0, d.x1 - d.x0))
    .attr("height", (d) => Math.max(0, d.y1 - d.y0))
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      event.stopPropagation();

      // When zoomed in: allocation clicks open editor
      // When at overview: allocation clicks zoom to parent round
      if (d.depth === 2 && !d.data.isUnallocated) {
        if (zoomNode) {
          // Zoomed in - open allocation editor
          const roundId = d.data.roundId;
          const allocationId = d.data.id;
          window.dispatchEvent(new CustomEvent('editAllocation', { detail: { roundId, allocationId } }));
        } else {
          // At overview - zoom to parent round
          onNodeClick(d.parent);
        }
      }
      // If it's a round (depth 1), zoom in
      else if (d.depth === 1) {
        onNodeClick(d);
      }
    })
    .on("dblclick", (event, d) => {
      event.stopPropagation();
      // Double-click on round (depth 1) opens round editor
      if (d.depth === 1) {
        window.dispatchEvent(new CustomEvent('editRound', { detail: { roundId: d.data.id } }));
      }
      // Double-click on allocation also opens allocation editor (same as single click)
      else if (d.depth === 2) {
        const roundId = d.data.roundId;
        const allocationId = d.data.id;
        window.dispatchEvent(new CustomEvent('editAllocation', { detail: { roundId, allocationId } }));
      }
    });

  // Add text labels - ALWAYS show for rounds (depth 1)
  // For allocations (depth 2), only show if there's space
  // IMPORTANT: pointer-events none so clicks go through to the rect
  leaf
    .append("text")
    .attr("x", 4)
    .attr("y", 13)
    .text((d) => {
      const width = d.x1 - d.x0;
      const height = d.y1 - d.y0;

      // Always show round names if width > 40
      if (d.depth === 1 && width > 40) {
        return truncateText(d.data.name, width, 12);
      }

      // Show allocation names if there's enough space
      if (d.depth === 2 && width > 60 && height > 20) {
        return truncateText(d.data.name, width, 10);
      }

      return "";
    })
    .attr("fill", "#fff")
    .attr("font-weight", (d) => (d.depth === 1 ? "bold" : "normal"))
    .attr("font-size", (d) => (d.depth === 1 ? "12px" : "10px"))
    .style("pointer-events", "none")
    .style("user-select", "none"); // Prevent text selection on click

  // Calculate issued shares (exclude unallocated and SAFEs)
  const issuedTotalShares = hierarchy.leaves()
    .filter((n) => !n.data.isUnallocated && n.parent && (n.parent.data.roundType !== 'safe' || n.parent.data.converted))
    .reduce((sum, n) => sum + n.data.shares, 0);
  const fullyDiluted = window._fullyDilutedShares || issuedTotalShares;

  // Store issued total globally for tooltip calculations
  window._totalIssuedShares = issuedTotalShares;

  // Add ownership % for rounds (second line) - show fully diluted by default
  leaf
    .filter((d) => d.depth === 1)
    .append("text")
    .attr("x", 4)
    .attr("y", 28)
    .text((d) => {
      const width = d.x1 - d.x0;
      const height = d.y1 - d.y0;
      if (width > 60 && height > 35 && viewMode === "shares") {
        // Compute round FD and issued shares correctly
        let roundFDShares;
        if (d.data.roundType === 'equity-pool') {
          roundFDShares = d.value; // includes unallocated pool
        } else {
          roundFDShares = (d.children || []).filter(c => !c.data.isUnallocated).reduce((sum, c) => sum + c.data.shares, 0);
        }
        const fdOwnership = fullyDiluted > 0 ? (roundFDShares / fullyDiluted) * 100 : 0;

        const roundIssuedShares = (d.data.roundType === 'safe' && !d.data.converted)
          ? 0
          : (d.children || []).filter(c => !c.data.isUnallocated).reduce((sum, c) => sum + c.data.shares, 0);
        const issuedOwnership = issuedTotalShares > 0 ? (roundIssuedShares / issuedTotalShares) * 100 : 0;
        // Show fully diluted, with issued in parentheses if different
        if (Math.abs(fdOwnership - issuedOwnership) > 0.01) {
          return `${fdOwnership.toFixed(2)}% FD (${issuedOwnership.toFixed(2)}% issued)`;
        }
        return `${fdOwnership.toFixed(2)}% fully diluted`;
      }
      return "";
    })
    .attr("fill", "#fff")
    .attr("font-size", "10px")
    .attr("opacity", 0.9)
    .style("pointer-events", "none")
    .style("user-select", "none");

  // Add share count and ownership % below name for allocations
  leaf
    .filter((d) => d.depth === 2)
    .append("text")
    .attr("x", 4)
    .attr("y", 26)
    .text((d) => {
      const width = d.x1 - d.x0;
      const height = d.y1 - d.y0;
      if (width > 60 && height > 30) {
        return formatNumber(d.value) + (viewMode === "shares" ? " shares" : "");
      }
      return "";
    })
    .attr("fill", "#fff")
    .attr("font-size", "9px")
    .attr("opacity", 0.9)
    .style("pointer-events", "none")
    .style("user-select", "none");

  // Add ownership % for allocations (third line) - show fully diluted
  leaf
    .filter((d) => d.depth === 2)
    .append("text")
    .attr("x", 4)
    .attr("y", 38)
    .text((d) => {
      const width = d.x1 - d.x0;
      const height = d.y1 - d.y0;
      if (width > 60 && height > 45 && viewMode === "shares") {
        const fdOwnership = (d.value / fullyDiluted) * 100;
        return fdOwnership.toFixed(4) + "% FD";
      }
      return "";
    })
    .attr("fill", "#fff")
    .attr("font-size", "9px")
    .attr("opacity", 0.8)
    .attr("font-weight", "bold")
    .style("pointer-events", "none")
    .style("user-select", "none");

  // Add estimated value for allocations (fourth line)
  leaf
    .filter((d) => d.depth === 2)
    .append("text")
    .attr("x", 4)
    .attr("y", 50)
    .text((d) => {
      const width = d.x1 - d.x0;
      const height = d.y1 - d.y0;
      const effectivePrice = window._effectivePricePerShare || 0;
      if (width > 60 && height > 55 && viewMode === "shares" && effectivePrice > 0) {
        const estimatedValue = d.value * effectivePrice;
        return "$" + formatNumber(Math.round(estimatedValue));
      }
      return "";
    })
    .attr("fill", "#fff")
    .attr("font-size", "9px")
    .attr("opacity", 0.7)
    .style("pointer-events", "none")
    .style("user-select", "none");

  // Tooltip - remove any existing tooltips first
  d3.selectAll(".treemap-tooltip").remove();

  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "treemap-tooltip")
    .style("position", "absolute")
    .style("visibility", "hidden")
    .style("background", "rgba(0, 0, 0, 0.9)")
    .style("color", "#fff")
    .style("padding", "12px")
    .style("border-radius", "4px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("z-index", "1000");

  leaf
    .on("mouseover", (event, d) => {
      tooltip.style("visibility", "visible");
      const html = createTooltipHTML(d, capTable, viewMode);
      tooltip.html(html);
    })
    .on("mousemove", (event) => {
      // Position tooltip with viewport boundary detection
      const tooltipNode = tooltip.node();
      const tooltipHeight = tooltipNode.offsetHeight;
      const tooltipWidth = tooltipNode.offsetWidth;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      let top = event.pageY - 10;
      let left = event.pageX + 10;

      // Check if tooltip would go off bottom of viewport
      if (event.clientY + tooltipHeight + 10 > viewportHeight) {
        top = event.pageY - tooltipHeight - 10;
      }

      // Check if tooltip would go off right of viewport
      if (event.clientX + tooltipWidth + 10 > viewportWidth) {
        left = event.pageX - tooltipWidth - 10;
      }

      tooltip
        .style("top", top + "px")
        .style("left", left + "px");
    })
    .on("mouseout", () => {
      tooltip.style("visibility", "hidden");
    });

  container.appendChild(svg.node());
}

// Helper: robust date to timestamp (supports ISO and common locale formats)
function toTime(d) {
  if (!d) return NaN;
  const t = new Date(d).getTime();
  return isNaN(t) ? NaN : t;
}

// Helper: stable sort rounds by date (missing dates last); tie-break by name
function getRoundsSortedByDate(rounds) {
  return [...(rounds || [])].sort((a, b) => {
    const at = toTime(a && a.date);
    const bt = toTime(b && b.date);
    if (isNaN(at) && isNaN(bt)) return (a?.name || '').localeCompare(b?.name || '');
    if (isNaN(at)) return 1;
    if (isNaN(bt)) return -1;
    if (at !== bt) return at - bt;
    return (a?.name || '').localeCompare(b?.name || '');
  });
}

function capTableToTree(capTable, mode) {
  // Helper to get value based on mode
  const getValue = (shares, round) => {
    if (mode === "shares") return shares;

    // For valuation mode:
    // - Priced rounds: use price per share
    // - SAFE rounds: use valuation cap to estimate current value
    // - Equity pools: use 0 (no price yet)
    if (round.type === "priced" && round.pricePerShare) {
      return shares * round.pricePerShare;
    } else if (round.type === "safe" && round.valuationCap) {
      // Estimate SAFE value using valuation cap
      // SAFE converts at: min(valuation cap, next round valuation - money raised)
      // For display purposes, use valuation cap as implied share price
      const impliedPricePerShare = round.valuationCap / capTable.authorizedShares;
      return shares * impliedPricePerShare;
    }
    return 0;
  };

  const sortedRounds = getRoundsSortedByDate(capTable.rounds);
  const children = sortedRounds.map((round) => {
    const roundChildren = round.allocations.map((allocation) => ({
      name: allocation.holderName,
      value: getValue(allocation.shares, round),
      round: round.name,
      roundId: round.id,
      roundColor: round.color,
      type: allocation.type,
      id: allocation.id,
      pricePerShare: round.pricePerShare,
      valuationCap: round.valuationCap,
      holderName: allocation.holderName,
      shares: allocation.shares,
      vestingSchedule: allocation.vestingSchedule,
      notes: allocation.notes,
    }));

    // For equity pool rounds, calculate unallocated shares within the pool
    if (round.type === "equity-pool") {
      const poolAllocated = round.allocations.reduce((sum, a) => sum + a.shares, 0);
      const poolAuthorized = round.authorizedShares || 0;
      const poolUnallocated = poolAuthorized - poolAllocated;

      if (poolUnallocated > 0) {
        roundChildren.push({
          name: "Unallocated",
          value: getValue(poolUnallocated, round),
          round: round.name,
          roundColor: round.color,
          type: "unallocated",
          holderName: "Unallocated",
          shares: poolUnallocated,
          isUnallocated: true,
        });
      }
    }

    // For SAFE rounds with investmentAmount, show unallocated investment capacity
    if (round.type === "safe" && round.investmentAmount) {
      const totalInvested = round.allocations.reduce((sum, a) => sum + (a.investmentAmount || 0), 0);
      const remainingCapacity = round.investmentAmount - totalInvested;

      if (remainingCapacity > 0 && round.valuationCap) {
        // Calculate shares for unallocated portion using same formula as allocations
        const ownershipPercent = remainingCapacity / round.valuationCap;
        const nonPoolIssued = capTable.rounds
          .filter(r => r.type !== 'safe' && r.type !== 'equity-pool')
          .reduce((sum, r) => sum + r.allocations.reduce((s, a) => s + a.shares, 0), 0);
        const poolAuthorized = capTable.rounds
          .filter(r => r.type === 'equity-pool')
          .reduce((sum, r) => sum + (r.authorizedShares || 0), 0);
        const baseCapShares = nonPoolIssued + poolAuthorized;
        const unallocatedShares = Math.round(ownershipPercent * baseCapShares);

        roundChildren.push({
          name: "Unallocated",
          value: getValue(unallocatedShares, round),
          round: round.name,
          roundColor: round.color,
          type: "unallocated",
          holderName: "Unallocated (to raise)",
          shares: unallocatedShares,
          investmentAmount: remainingCapacity,
          isUnallocated: true,
        });
      }
    }

    // For priced rounds with moneyRaised, show unallocated shares
    if (round.type === "priced" && round.moneyRaised && round.pricePerShare) {
      const targetShares = Math.round(round.moneyRaised / round.pricePerShare);
      const allocatedShares = round.allocations.reduce((sum, a) => sum + a.shares, 0);
      const unallocatedShares = targetShares - allocatedShares;

      if (unallocatedShares > 0) {
        roundChildren.push({
          name: "Unallocated",
          value: getValue(unallocatedShares, round),
          round: round.name,
          roundColor: round.color,
          type: "unallocated",
          holderName: "Unallocated (to sell)",
          shares: unallocatedShares,
          isUnallocated: true,
        });
      }
    }

    return {
      name: round.name,
      id: round.id,
      round: round.name,
      roundColor: round.color,
      roundType: round.type,
      converted: !!round.converted,
      value: 0,
      children: roundChildren,
    };
  });

  return {
    name: capTable.companyName,
    value: 0,
    children,
  };
}

function createTooltipHTML(d, capTable, viewMode) {
  const lines = [];
  const totalIssued = window._totalIssuedShares || 1;
  const fullyDiluted = window._fullyDilutedShares || totalIssued;

  if (d.depth === 1) {
    // Round
    lines.push(`<div style="font-weight: bold; margin-bottom: 4px;">${d.data.name}</div>`);
    lines.push(`<div>Round: ${d.data.name}</div>`);

    const allocatedShares = d.children ? d.children.filter(c => !c.data.isUnallocated).reduce((sum, c) => sum + c.data.shares, 0) : 0;
    const totalRoundShares = d.children ? d.children.reduce((sum, c) => sum + c.data.shares, 0) : 0;
    const displayShares = d.data.roundType === 'equity-pool' ? totalRoundShares : allocatedShares;
    lines.push(`<div>Shares: ${formatNumber(displayShares)}</div>`);

    const roundFDShares = d.data.roundType === 'equity-pool' ? totalRoundShares : allocatedShares;
    const fdOwnership = ((roundFDShares / fullyDiluted) * 100).toFixed(4);
    const roundIssuedShares = (d.data.roundType === 'safe' && !d.data.converted) ? 0 : allocatedShares;
    const issuedOwnership = ((roundIssuedShares / totalIssued) * 100).toFixed(2);
    lines.push(`<div style="font-weight: bold;">${fdOwnership}% fully diluted</div>`);
    if (Math.abs(parseFloat(fdOwnership) - parseFloat(issuedOwnership)) > 0.01) {
      lines.push(`<div style="opacity: 0.8; font-size: 11px;">(${issuedOwnership}% of issued)</div>`);
    }

    if (d.data.roundType === 'safe' && d.data.valuationCap) {
      lines.push(`<div>Valuation Cap: $${formatNumber(d.data.valuationCap)}</div>`);
    } else if (d.data.pricePerShare) {
      lines.push(`<div>Price/Share: $${d.data.pricePerShare}</div>`);
    }
  } else if (d.depth === 2) {
    // Allocation
    lines.push(`<div style="font-weight: bold; margin-bottom: 4px;">${d.data.holderName}</div>`);
    lines.push(`<div>Round: ${d.data.round}</div>`);
    lines.push(`<div>Type: ${d.data.type}</div>`);
    lines.push(`<div>Shares: ${formatNumber(d.data.shares)}</div>`);

    const fdOwnership = ((d.data.shares / fullyDiluted) * 100).toFixed(4);
    const isSafe = d.parent && d.parent.data && d.parent.data.roundType === 'safe' && !d.parent.data.converted;
    const issuedOwnership = isSafe ? '0.0000' : ((d.data.shares / totalIssued) * 100).toFixed(4);
    lines.push(`<div style="font-weight: bold;">${fdOwnership}% fully diluted</div>`);
    if (Math.abs(parseFloat(fdOwnership) - parseFloat(issuedOwnership)) > 0.01) {
      lines.push(`<div style="opacity: 0.8; font-size: 11px;">(${issuedOwnership}% of issued)</div>`);
    }

    // Add estimated value if effective price is available
    const effectivePrice = window._effectivePricePerShare || 0;
    if (effectivePrice > 0) {
      const estimatedValue = d.data.shares * effectivePrice;
      lines.push(`<div style="color: #4ade80;">Est. Value: $${formatNumber(Math.round(estimatedValue))}</div>`);
    }

    if (d.data.vestingSchedule) {
      lines.push(`<div>Vesting: ${d.data.vestingSchedule}</div>`);
    }
    if (d.data.notes) {
      lines.push(`<div style="font-style: italic; margin-top: 4px;">${d.data.notes}</div>`);
    }
  }

  return lines.join('');
}

function formatNumber(num) {
  return num.toLocaleString();
}

