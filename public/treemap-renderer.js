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

  // Add rectangles
  leaf
    .append("rect")
    .attr("fill", (d) => d.data.roundColor || "#6b7280")
    .attr("fill-opacity", (d) => {
      // Rounds are more opaque, allocations slightly transparent
      return d.depth === 1 ? 0.9 : 0.7;
    })
    .attr("stroke", "#fff")
    .attr("stroke-width", 1)
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

  // Add share count below name for allocations
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
  const getValue = (shares, pricePerShare) => {
    if (mode === "shares") return shares;
    // For valuation mode, use price if available, otherwise 0
    return shares * (pricePerShare || 0);
  };

  const children = capTable.rounds.map((round) => ({
    name: round.name,
    round: round.name,
    roundColor: round.color,
    roundType: round.type,
    value: 0,
    children: round.allocations.map((allocation) => ({
      name: allocation.holderName,
      value: getValue(allocation.shares, round.pricePerShare),
      round: round.name,
      roundColor: round.color,
      type: allocation.type,
      pricePerShare: round.pricePerShare,
      valuationCap: round.valuationCap,
      holderName: allocation.holderName,
      shares: allocation.shares,
      vestingSchedule: allocation.vestingSchedule,
      notes: allocation.notes,
    })),
  }));

  // Calculate unallocated
  const totalAllocated = capTable.rounds.reduce(
    (sum, round) => sum + round.allocations.reduce((s, a) => s + a.shares, 0),
    0
  );
  const unallocated = capTable.authorizedShares - totalAllocated;

  if (unallocated > 0) {
    children.push({
      name: "Unallocated",
      value: getValue(unallocated, 0),
      round: "Unallocated",
      roundColor: "#6b7280",
      children: [],
    });
  }

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
    
    const ownership = ((totalShares / capTable.authorizedShares) * 100).toFixed(2);
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
    
    const ownership = ((d.data.shares / capTable.authorizedShares) * 100).toFixed(2);
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

