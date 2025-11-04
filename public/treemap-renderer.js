import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// Render treemap with nested allocations visible (WinDirStat style)
export function renderTreemap(capTable, viewMode, zoomNode, onNodeClick) {
  const container = document.getElementById("treemap");
  const width = container.clientWidth;
  const height = container.clientHeight;

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
    .attr('stdDeviation', 6);  // Increased from 5 to 6 for more blur

  dropShadow.append('feOffset')
    .attr('dx', 5)  // Increased from 4 to 5
    .attr('dy', 5)  // Increased from 4 to 5
    .attr('result', 'offsetblur');

  dropShadow.append('feComponentTransfer')
    .append('feFuncA')
    .attr('type', 'linear')
    .attr('slope', 0.9);  // Increased from 0.7 to 0.9 for much darker shadow

  const feMerge = dropShadow.append('feMerge');
  feMerge.append('feMergeNode');
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Add rectangles with gradient for 3D effect (WinDirStat style)
  leaf
    .append("rect")
    .attr("fill", (d) => {
      const baseColor = d.data.roundColor || "#6b7280";
      // Create a unique gradient ID for each node
      const gradientId = `gradient-${d.data.name.replace(/\s+/g, '-')}-${Math.random().toString(36).substr(2, 9)}`;

      // Parse base color to create lighter/darker variants with more contrast
      const lighter = d3.color(baseColor).brighter(1.0);  // Increased from 0.8 to 1.0
      const darker = d3.color(baseColor).darker(1.2);     // Increased from 0.5 to 1.2 for much darker edges

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
      // Use the click target from the map (allocations click their parent round)
      const target = clickTargetMap.get(d) || d;
      onNodeClick(target);
    });

  // Add text labels - ALWAYS show for rounds (depth 1)
  // For allocations (depth 2), only show if there's space
  leaf
    .append("text")
    .attr("x", 4)
    .attr("y", 13)
    .text((d) => {
      const width = d.x1 - d.x0;
      const height = d.y1 - d.y0;

      // Always show round names if width > 40
      if (d.depth === 1 && width > 40) {
        return d.data.name;
      }

      // Show allocation names if there's enough space
      if (d.depth === 2 && width > 60 && height > 20) {
        return d.data.name;
      }

      return "";
    })
    .attr("fill", "#fff")
    .attr("font-weight", (d) => (d.depth === 1 ? "bold" : "normal"))
    .attr("font-size", (d) => (d.depth === 1 ? "12px" : "10px"))
    .style("pointer-events", "none");

  // Calculate total shares for ownership % from the hierarchy (total issued shares)
  const totalShares = hierarchy.value;
  const fullyDiluted = window._fullyDilutedShares || totalShares;

  // Store totalShares globally for tooltip calculations
  window._totalIssuedShares = totalShares;

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
        const fdOwnership = (d.value / fullyDiluted) * 100;
        const issuedOwnership = (d.value / totalShares) * 100;
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
    .style("pointer-events", "none");

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
    .style("pointer-events", "none");

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
    .style("pointer-events", "none");

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
    .style("pointer-events", "none");

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

  const children = capTable.rounds.map((round) => {
    const roundChildren = round.allocations.map((allocation) => ({
      name: allocation.holderName,
      value: getValue(allocation.shares, round),
      round: round.name,
      roundColor: round.color,
      type: allocation.type,
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

    // For SAFE rounds with targetAmount, show unallocated investment capacity
    if (round.type === "safe" && round.targetAmount) {
      const totalInvested = round.allocations.reduce((sum, a) => sum + (a.investmentAmount || 0), 0);
      const remainingCapacity = round.targetAmount - totalInvested;

      if (remainingCapacity > 0 && round.valuationCap) {
        // Calculate shares for unallocated portion using same formula as allocations
        const ownershipPercent = remainingCapacity / round.valuationCap;
        const totalIssuedExcludingSAFEs = capTable.rounds
          .filter(r => r.type !== 'safe')
          .reduce((sum, r) => sum + r.allocations.reduce((s, a) => s + a.shares, 0), 0);
        const unallocatedShares = Math.round(ownershipPercent * totalIssuedExcludingSAFEs);

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

    // For priced rounds with targetShares, show unallocated shares
    if (round.type === "priced" && round.targetShares) {
      const allocatedShares = round.allocations.reduce((sum, a) => sum + a.shares, 0);
      const unallocatedShares = round.targetShares - allocatedShares;

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
      round: round.name,
      roundColor: round.color,
      roundType: round.type,
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

    const totalShares = d.children ? d.children.reduce((sum, c) => sum + c.data.shares, 0) : 0;
    lines.push(`<div>Shares: ${formatNumber(totalShares)}</div>`);

    const fdOwnership = ((totalShares / fullyDiluted) * 100).toFixed(4);
    const issuedOwnership = ((totalShares / totalIssued) * 100).toFixed(2);
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
    const issuedOwnership = ((d.data.shares / totalIssued) * 100).toFixed(4);
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

