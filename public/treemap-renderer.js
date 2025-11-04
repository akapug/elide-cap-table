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
    .attr('stdDeviation', 5);  // Increased from 3 to 5

  dropShadow.append('feOffset')
    .attr('dx', 4)  // Increased from 2 to 4
    .attr('dy', 4)  // Increased from 2 to 4
    .attr('result', 'offsetblur');

  dropShadow.append('feComponentTransfer')
    .append('feFuncA')
    .attr('type', 'linear')
    .attr('slope', 0.7);  // Increased from 0.5 to 0.7 for darker shadow

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

      // Parse base color to create lighter/darker variants
      const lighter = d3.color(baseColor).brighter(0.8);
      const darker = d3.color(baseColor).darker(0.5);

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

  // Store totalShares globally for tooltip calculations
  window._totalIssuedShares = totalShares;

  // Add ownership % for rounds (second line)
  leaf
    .filter((d) => d.depth === 1)
    .append("text")
    .attr("x", 4)
    .attr("y", 28)
    .text((d) => {
      const width = d.x1 - d.x0;
      const height = d.y1 - d.y0;
      if (width > 60 && height > 35 && viewMode === "shares") {
        const ownership = (d.value / totalShares) * 100;
        return ownership.toFixed(2) + "% ownership";
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

  // Add ownership % for allocations (third line)
  leaf
    .filter((d) => d.depth === 2)
    .append("text")
    .attr("x", 4)
    .attr("y", 38)
    .text((d) => {
      const width = d.x1 - d.x0;
      const height = d.y1 - d.y0;
      if (width > 60 && height > 45 && viewMode === "shares") {
        const ownership = (d.value / totalShares) * 100;
        return ownership.toFixed(2) + "%";
      }
      return "";
    })
    .attr("fill", "#fff")
    .attr("font-size", "9px")
    .attr("opacity", 0.8)
    .attr("font-weight", "bold")
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
      tooltip
        .style("top", event.pageY - 10 + "px")
        .style("left", event.pageX + 10 + "px");
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
  
  if (d.depth === 1) {
    // Round
    lines.push(`<div style="font-weight: bold; margin-bottom: 4px;">${d.data.name}</div>`);
    lines.push(`<div>Round: ${d.data.name}</div>`);
    
    const totalShares = d.children ? d.children.reduce((sum, c) => sum + c.data.shares, 0) : 0;
    lines.push(`<div>Shares: ${formatNumber(totalShares)}</div>`);

    const ownership = ((totalShares / window._totalIssuedShares) * 100).toFixed(2);
    lines.push(`<div>Ownership: ${ownership}%</div>`);
    
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

    const ownership = ((d.data.shares / window._totalIssuedShares) * 100).toFixed(2);
    lines.push(`<div>Ownership: ${ownership}%</div>`);
    
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

