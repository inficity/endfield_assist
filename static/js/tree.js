// Tree visualization with vis.js - Multi-item support
let network = null;
const FIXED_SCALE = 0.65;
const STORAGE_KEY = 'endfield_assist_state';

// Site definitions
const SITES = [
    { id: 'main', name: '메인 부지', ports: 52, config: '23+23+6' },
    { id: 'sub1', name: '보조 부지 1', ports: 19, config: '13+6' },
    { id: 'sub2', name: '보조 부지 2', ports: 19, config: '13+6' },
    { id: 'sub3', name: '보조 부지 3', ports: 19, config: '13+6' }
];

// Multi-item state
let selectedItems = [];  // [{id, name, lines}]
let splitPoints = new Set();  // Set of item_ids that are split points
let siteAssignments = {};  // {unit_id: site_id}
let allocatableUnits = [];  // Allocatable units from API (for site allocation)

// ==================== State Persistence ====================

// Save current state to localStorage
function saveState() {
    const state = {
        selectedItems: selectedItems,
        splitPoints: Array.from(splitPoints),
        siteAssignments: siteAssignments
    };
    console.log('Saving state:', state);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        console.log('State saved successfully');
    } catch (e) {
        console.warn('Failed to save state to localStorage:', e);
    }
}

// Load state from localStorage
function loadState() {
    console.log('loadState called');
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        console.log('Saved state from localStorage:', saved);
        if (saved) {
            const state = JSON.parse(saved);
            selectedItems = state.selectedItems || [];
            splitPoints = new Set(state.splitPoints || []);
            siteAssignments = state.siteAssignments || {};
            console.log('State loaded:', { selectedItems, splitPoints: Array.from(splitPoints), siteAssignments });
            return true;
        }
    } catch (e) {
        console.warn('Failed to load state from localStorage:', e);
    }
    return false;
}

// Clear saved state
function clearState() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.warn('Failed to clear state from localStorage:', e);
    }
}

// DOM elements
const multiItemList = document.getElementById('multi-item-list');
const addItemBtn = document.getElementById('add-item-btn');
const addItemForm = document.getElementById('add-item-form');
const newItemSearch = document.getElementById('new-item-search');
const newAutocompleteList = document.getElementById('new-autocomplete-list');
const cancelAddBtn = document.getElementById('cancel-add-btn');
const showMultiTreeBtn = document.getElementById('show-multi-tree-btn');
const treeContainer = document.getElementById('tree-network');
const summarySection = document.getElementById('production-summary-section');
const bundlesSection = document.getElementById('bundles-section');
const bundlesContainer = document.getElementById('bundles-container');
const productionItemsTable = document.getElementById('production-items-table');
const rawMaterialsTable = document.getElementById('raw-materials-table');
const toggleGraphBtn = document.getElementById('toggle-graph-btn');
const treeContainerParent = document.querySelector('.tree-container');

// Get icon URL for an item
function getIconUrl(itemId) {
    return `/static/icons/${itemId}.png`;
}

// Format rate without unnecessary decimals
function formatRate(value) {
    return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
}

// Get recipe for an item
function getRecipeForItem(itemId) {
    return recipes.find(r => r.result === itemId);
}

// Calculate base production rate (items/min)
function getBaseProductionRate(recipe) {
    if (!recipe || recipe.craft_time <= 0) return 0;
    return (recipe.result_count / recipe.craft_time) * 60;
}

// Render the multi-item list
function renderMultiItemList() {
    multiItemList.innerHTML = selectedItems.map((item, index) => `
        <div class="multi-item-row" data-index="${index}">
            <div class="multi-item-info">
                <img src="${getIconUrl(item.id)}" class="item-icon-small" onerror="this.style.display='none'">
                <span class="item-name">${item.name}</span>
            </div>
            <div class="multi-item-controls">
                <span class="lines-label">라인</span>
                <button class="num-btn" onclick="adjustItemLines(${index}, -1)">−</button>
                <input type="text" class="lines-input" value="${item.lines}"
                       onchange="setItemLines(${index}, this.value)">
                <button class="num-btn" onclick="adjustItemLines(${index}, 1)">+</button>
                <button class="btn btn-small btn-delete" onclick="removeItem(${index})">✕</button>
            </div>
        </div>
    `).join('');

    // Update button state
    showMultiTreeBtn.disabled = selectedItems.length === 0;
}

// Add item to the list
function addItem(itemId, itemName) {
    // Check if already added
    if (selectedItems.some(i => i.id === itemId)) {
        alert('이미 추가된 아이템입니다.');
        return;
    }

    selectedItems.push({
        id: itemId,
        name: itemName,
        lines: 1
    });

    renderMultiItemList();
    hideAddItemForm();
    saveState();

    // Auto-load tree
    if (selectedItems.length > 0) {
        loadMultiProductionTree();
    }
}

// Remove item from the list
function removeItem(index) {
    selectedItems.splice(index, 1);
    renderMultiItemList();
    saveState();

    if (selectedItems.length > 0) {
        loadMultiProductionTree();
    } else {
        // Clear the display
        if (network) {
            network.destroy();
            network = null;
        }
        summarySection.style.display = 'none';
        bundlesSection.style.display = 'none';
        hideSiteAllocation();
    }
}

// Adjust item lines
function adjustItemLines(index, delta) {
    const newLines = Math.max(1, selectedItems[index].lines + delta);
    selectedItems[index].lines = newLines;
    renderMultiItemList();
    saveState();
    loadMultiProductionTree();
}

// Set item lines directly
function setItemLines(index, value) {
    const lines = Math.max(1, parseInt(value) || 1);
    selectedItems[index].lines = lines;
    renderMultiItemList();
    saveState();
    loadMultiProductionTree();
}

// Show add item form
function showAddItemForm() {
    addItemForm.style.display = 'flex';
    addItemBtn.style.display = 'none';
    newItemSearch.value = '';
    newItemSearch.focus();
}

// Hide add item form
function hideAddItemForm() {
    addItemForm.style.display = 'none';
    addItemBtn.style.display = '';
    newAutocompleteList.classList.remove('active');
}

// Toggle split point
function toggleSplitPoint(itemId) {
    // Don't allow split points on raw materials or target items
    const item = items.find(i => i.id === itemId);
    if (!item || item.is_raw) return;

    // Don't allow split points on target items
    if (selectedItems.some(i => i.id === itemId)) return;

    if (splitPoints.has(itemId)) {
        splitPoints.delete(itemId);
    } else {
        splitPoints.add(itemId);
    }

    // Clear site assignments when split points change (bundles will change)
    siteAssignments = {};
    saveState();

    // Reload tree with updated split points
    loadMultiProductionTree();
}

// Load and render multi-production tree
async function loadMultiProductionTree() {
    if (selectedItems.length === 0) return;

    try {
        const response = await fetch('/api/multi-production-tree', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                items: selectedItems.map(i => ({ id: i.id, lines: i.lines })),
                split_points: Array.from(splitPoints)
            })
        });

        if (!response.ok) {
            throw new Error('트리 로드 실패');
        }

        const data = await response.json();
        console.log('API Response:', data);
        console.log('Bundles:', data.bundles);
        console.log('Allocatable Units:', data.allocatable_units);
        renderTree(data.tree);
        renderBundles(data.bundles, data.allocatable_units);
        renderSummary(data.summary);
    } catch (error) {
        console.error(error);
        alert('트리를 불러오는데 실패했습니다.');
    }
}

// Center branching nodes between their targets
function centerBranchingNodes(nodes, edges) {
    if (!network) return;

    // Build a map of outgoing edges for each node (from -> [to, to, ...])
    const outgoingEdges = {};
    const edgeArray = edges.get();  // Convert vis.DataSet to array
    edgeArray.forEach(edge => {
        const from = edge.from;
        if (!outgoingEdges[from]) {
            outgoingEdges[from] = [];
        }
        outgoingEdges[from].push(edge.to);
    });

    // Find nodes with multiple outgoing edges and center them
    const positions = network.getPositions();
    const updates = [];

    Object.entries(outgoingEdges).forEach(([nodeId, targets]) => {
        if (targets.length >= 2) {
            // This node branches to multiple targets
            const targetPositions = targets
                .map(targetId => positions[targetId])
                .filter(pos => pos !== undefined);

            if (targetPositions.length >= 2) {
                // Calculate average y-position of targets
                const avgY = targetPositions.reduce((sum, pos) => sum + pos.y, 0) / targetPositions.length;
                const currentPos = positions[nodeId];

                if (currentPos && Math.abs(currentPos.y - avgY) > 10) {
                    updates.push({
                        id: parseInt(nodeId),
                        x: currentPos.x,
                        y: avgY,
                    });
                }
            }
        }
    });

    // Apply position updates
    if (updates.length > 0) {
        nodes.update(updates);
    }
}

// Render tree with vis.js
function renderTree(treeData) {
    const nodes = new vis.DataSet(treeData.nodes.map(node => {
        const isSplitPoint = splitPoints.has(node.item_id);

        return {
            id: node.id,
            label: '',  // Empty label - count shown as badge
            image: getIconUrl(node.item_id),
            shape: 'image',
            size: 47,
            color: {
                background: isSplitPoint ? '#9C27B0' : node.color,
                border: isSplitPoint ? '#9C27B0' : node.color,
                highlight: {
                    background: isSplitPoint ? '#9C27B0' : node.color,
                    border: '#fff',
                },
            },
            borderWidth: isSplitPoint ? 4 : 2,
            borderWidthSelected: 4,
            shapeProperties: {
                useBorderWithImage: true,
            },
            itemId: node.item_id,
            isRaw: node.is_raw,
            lines: node.lines || 1,  // Store count for badge
            // Use level for x position, track for y position
            x: node.level !== undefined ? node.level * 250 : undefined,
            y: node.track !== undefined ? node.track * 350 : undefined,
        };
    }));

    const edges = new vis.DataSet(treeData.edges.map(edge => ({
        from: edge.from,
        to: edge.to,
        label: edge.label,
        arrows: edge.arrows,
        color: {
            color: '#666',
            highlight: '#4fc3f7',
        },
        font: {
            color: '#aaa',
            size: 16,
            strokeWidth: 0,
        },
    })));

    const visData = { nodes, edges };

    const options = {
        layout: {
            hierarchical: false,  // Disable hierarchical to use our explicit x,y positions
        },
        physics: false,
        interaction: {
            hover: true,
            zoomView: false,
            dragView: true,
        },
    };

    if (network) {
        network.destroy();
    }

    network = new vis.Network(treeContainer, visData, options);

    // Draw count badges on nodes after rendering
    network.on('afterDrawing', function(ctx) {
        const nodePositions = network.getPositions();
        const scale = network.getScale();

        nodes.forEach(node => {
            const count = node.lines || 1;
            if (count >= 2) {
                const pos = nodePositions[node.id];
                if (!pos) return;

                // Convert to canvas coordinates
                const canvasPos = network.canvasToDOM(pos);

                // Badge position: top-right corner of the icon (text center at corner)
                const nodeSize = 47 * scale;
                const badgeX = canvasPos.x + nodeSize * 0.8;
                const badgeY = canvasPos.y - nodeSize * 0.9;

                // Draw badge text
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);  // Reset transform for screen coordinates
                ctx.font = 'bold 18px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // White text with black outline for visibility
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                ctx.strokeText(`x${count}`, badgeX, badgeY);
                ctx.fillStyle = '#fff';
                ctx.fillText(`x${count}`, badgeX, badgeY);
                ctx.restore();
            }
        });
    });

    // Adjust container height and center branching nodes after layout is done
    setTimeout(function() {
        centerBranchingNodes(nodes, edges);
        adjustGraphHeight();
    }, 100);

    // Handle node clicks for split point toggle
    network.on('click', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            const node = nodes.get(nodeId);
            if (node && !node.isRaw) {
                toggleSplitPoint(node.itemId);
            }
        }
    });

    // Change cursor on hover
    network.on('hoverNode', function(params) {
        const node = nodes.get(params.node);
        if (node && !node.isRaw) {
            treeContainer.style.cursor = 'pointer';
        }
    });

    network.on('blurNode', function() {
        treeContainer.style.cursor = 'default';
    });
}

// Adjust graph container height based on content
function adjustGraphHeight() {
    if (!network) return;

    // Get all node positions
    const positions = network.getPositions();
    const nodeIds = Object.keys(positions);

    if (nodeIds.length === 0) {
        treeContainerParent.style.height = '300px';
        return;
    }

    // Calculate content bounds
    let minY = Infinity, maxY = -Infinity;
    nodeIds.forEach(id => {
        const pos = positions[id];
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y);
    });

    // Calculate required height at fixed scale
    const contentHeight = (maxY - minY) * FIXED_SCALE;
    const nodeBuffer = 180;
    const requiredHeight = Math.max(350, contentHeight + nodeBuffer);

    // Set container height first
    treeContainerParent.style.height = requiredHeight + 'px';

    // Wait for container resize, then apply scale and fit
    setTimeout(() => {
        network.setOptions({ });  // Force redraw
        network.fit({ animation: false });

        // Now apply fixed scale while keeping centered
        const currentScale = network.getScale();
        if (currentScale !== FIXED_SCALE) {
            network.moveTo({
                scale: FIXED_SCALE,
                animation: false
            });
        }
    }, 50);
}

// Render bundles summary
function renderBundles(bundles, units) {
    console.log('renderBundles called with:', { bundles, units });

    if (!bundles || bundles.length === 0) {
        bundlesSection.style.display = 'none';
        allocatableUnits = [];
        hideSiteAllocation();
        return;
    }

    // Store allocatable units for site allocation (finer-grained than bundles)
    allocatableUnits = units || [];
    console.log('allocatableUnits set to:', allocatableUnits);

    bundlesSection.style.display = 'block';

    // Clean up invalid assignments (units that no longer exist)
    const validUnitIds = new Set(allocatableUnits.map(u => u.id));
    Object.keys(siteAssignments).forEach(unitId => {
        if (!validUnitIds.has(unitId)) {
            delete siteAssignments[unitId];
        }
    });
    saveState();

    // Render site allocation section
    renderSiteAllocation();

    bundlesContainer.innerHTML = bundles.map((bundle, index) => {
        // Format machines list
        const machinesList = Object.entries(bundle.machines)
            .map(([name, count]) => `<span class="machine-tag">${name} ${count}개</span>`)
            .join('');

        // Format ports list
        const portsList = bundle.ports
            .map(port => {
                const typeClass = port.type === 'raw' ? 'port-raw' : 'port-split';
                return `
                    <div class="port-item ${typeClass}">
                        <img src="${getIconUrl(port.item_id)}" class="item-icon-small" onerror="this.style.display='none'">
                        <span>${port.name}</span>
                        <span class="port-count">${port.count}개</span>
                    </div>
                `;
            })
            .join('');

        return `
            <div class="bundle-card">
                <div class="bundle-header">
                    <h4>${bundle.name}</h4>
                    <span class="port-total">창고 출력 포트: <strong>${bundle.lines > 1 ? `${bundle.port_per_line}개 × ${bundle.lines} = ${bundle.port_count}개` : `${bundle.port_count}개`}</strong></span>
                </div>
                <div class="bundle-content">
                    ${machinesList ? `
                        <div class="bundle-section">
                            <h5>필요 설비</h5>
                            <div class="machines-list">${machinesList}</div>
                        </div>
                    ` : ''}
                    ${portsList ? `
                        <div class="bundle-section">
                            <h5>창고 출력 포트</h5>
                            <div class="ports-list">${portsList}</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Render production summary tables
function renderSummary(summary) {
    if (!summary || summary.length === 0) {
        summarySection.style.display = 'none';
        return;
    }

    summarySection.style.display = 'block';

    // Separate production items and raw materials
    const productionItems = summary.filter(item => !item.is_raw);
    const rawMaterials = summary.filter(item => item.is_raw);

    // Render production items table
    const prodTbody = productionItemsTable.querySelector('tbody');
    prodTbody.innerHTML = productionItems.map(item => {
        const isSplitPoint = splitPoints.has(item.item_id);
        return `
            <tr class="${isSplitPoint ? 'split-point-row' : ''}">
                <td>
                    <img src="${getIconUrl(item.item_id)}" class="item-icon-small" onerror="this.style.display='none'">
                    ${item.name}
                    ${isSplitPoint ? '<span class="split-badge">분할점</span>' : ''}
                </td>
                <td>${item.machine || '-'}</td>
                <td class="${item.lines > 1 ? 'highlight-lines' : ''}">${item.lines}개</td>
                <td>${formatRate(item.rate)}/min</td>
                <td>${formatRate(item.actual_rate)}/min</td>
                <td class="${item.surplus > 0 ? 'highlight-surplus' : ''}">${item.surplus > 0 ? '+' + formatRate(item.surplus) : '-'}</td>
            </tr>
        `;
    }).join('');

    // Render raw materials table
    const rawTbody = rawMaterialsTable.querySelector('tbody');
    rawTbody.innerHTML = rawMaterials.map(item => `
        <tr>
            <td>
                <img src="${getIconUrl(item.item_id)}" class="item-icon-small" onerror="this.style.display='none'">
                ${item.name}
            </td>
            <td>${formatRate(item.rate)}/min</td>
            <td class="${item.lines > 1 ? 'highlight-lines' : ''}">${item.lines}개</td>
            <td>${formatRate(item.actual_rate)}/min</td>
            <td class="${item.surplus > 0 ? 'highlight-surplus' : ''}">${item.surplus > 0 ? '+' + formatRate(item.surplus) : '-'}</td>
        </tr>
    `).join('');
}

// Toggle graph visibility
function toggleGraph() {
    const isHidden = treeContainerParent.style.display === 'none';
    treeContainerParent.style.display = isHidden ? '' : 'none';
    toggleGraphBtn.textContent = isHidden ? '그래프 숨기기' : '그래프 표시';
}

// Event listeners
addItemBtn.addEventListener('click', showAddItemForm);
cancelAddBtn.addEventListener('click', hideAddItemForm);
showMultiTreeBtn.addEventListener('click', loadMultiProductionTree);

// Autocomplete for adding new items
newItemSearch.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    newAutocompleteList.innerHTML = '';

    if (!query) {
        newAutocompleteList.classList.remove('active');
        return;
    }

    // Filter only craftable items (not raw)
    const matches = items.filter(item =>
        !item.is_raw && (
            item.name.toLowerCase().includes(query) ||
            item.id.toLowerCase().includes(query)
        )
    );

    if (matches.length > 0) {
        matches.slice(0, 10).forEach(item => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.innerHTML = `
                <img src="${getIconUrl(item.id)}" onerror="this.style.display='none'">
                <span>${item.name}</span>
            `;
            div.addEventListener('click', () => {
                addItem(item.id, item.name);
            });
            newAutocompleteList.appendChild(div);
        });
        newAutocompleteList.classList.add('active');
    } else {
        newAutocompleteList.classList.remove('active');
    }
});

// Close autocomplete when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.add-item-form')) {
        newAutocompleteList.classList.remove('active');
    }
});

// Quick buttons
document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const itemId = btn.dataset.item;
        const item = items.find(i => i.id === itemId);
        if (item) {
            // Clear existing items and add this one
            selectedItems = [];
            splitPoints.clear();
            siteAssignments = {};
            addItem(item.id, item.name);  // addItem already calls saveState()

            // Update active state
            document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
    });
});

// Parse URL parameters
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        item: params.get('item'),
        lines: params.get('lines') ? parseInt(params.get('lines')) : null,
    };
}

// Initialize from URL parameters or localStorage
function initFromUrl() {
    console.log('initFromUrl called');
    const params = getUrlParams();
    console.log('URL params:', params);

    // URL parameters take priority
    if (params.item) {
        const item = items.find(i => i.id === params.item);
        if (item && !item.is_raw) {
            const lines = params.lines || 1;
            selectedItems = [{
                id: item.id,
                name: item.name,
                lines: lines
            }];
            splitPoints.clear();
            siteAssignments = {};
            renderMultiItemList();
            saveState();
            loadMultiProductionTree();
            return;
        }
    }

    // No URL params - try to restore from localStorage
    console.log('Trying to restore from localStorage...');
    if (loadState() && selectedItems.length > 0) {
        console.log('Restored from localStorage, loading tree...');
        renderMultiItemList();
        loadMultiProductionTree();
    } else {
        console.log('No state to restore');
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initFromUrl);

// Keep fixed scale on window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    if (!network) return;
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        network.moveTo({
            scale: FIXED_SCALE,
            animation: false
        });
    }, 100);
});

// ==================== Site Allocation ====================

const siteAllocationSection = document.getElementById('site-allocation-section');
const siteCardsContainer = document.getElementById('site-cards-container');
const unassignedBundlesContainer = document.getElementById('unassigned-bundles-container');
const autoAllocateBtn = document.getElementById('auto-allocate-btn');
const resetAllocationBtn = document.getElementById('reset-allocation-btn');

// Hide site allocation section
function hideSiteAllocation() {
    if (siteAllocationSection) {
        siteAllocationSection.style.display = 'none';
    }
}

// siteAssignments structure: {unit_id: {site_id: count, ...}}
// This allows distributing lines of a single unit across multiple sites

// Get total assigned count for a unit
function getAssignedCount(unitId) {
    const assignments = siteAssignments[unitId] || {};
    return Object.values(assignments).reduce((sum, count) => sum + count, 0);
}

// Get remaining unassigned count for a unit
function getUnassignedCount(unitId) {
    const unit = allocatableUnits.find(u => u.id === unitId);
    if (!unit) return 0;
    return unit.total_lines - getAssignedCount(unitId);
}

// Get used ports for a site
function getSiteUsedPorts(siteId) {
    let used = 0;
    Object.entries(siteAssignments).forEach(([unitId, assignments]) => {
        const count = assignments[siteId] || 0;
        if (count > 0) {
            const unit = allocatableUnits.find(u => u.id === unitId);
            if (unit) {
                used += unit.port_per_line * count;
            }
        }
    });
    return used;
}

// Get units assigned to a site with their counts
function getSiteUnits(siteId) {
    const result = [];
    allocatableUnits.forEach(unit => {
        const assignments = siteAssignments[unit.id] || {};
        const count = assignments[siteId] || 0;
        if (count > 0) {
            result.push({
                ...unit,
                assigned_count: count,
                assigned_ports: unit.port_per_line * count
            });
        }
    });
    return result;
}

// Get units with remaining unassigned lines
function getUnassignedUnits() {
    return allocatableUnits
        .map(unit => ({
            ...unit,
            remaining: getUnassignedCount(unit.id)
        }))
        .filter(unit => unit.remaining > 0);
}

// Assign lines of a unit to a site
function assignUnit(unitId, siteId, count = 1) {
    if (!siteAssignments[unitId]) {
        siteAssignments[unitId] = {};
    }
    const current = siteAssignments[unitId][siteId] || 0;
    siteAssignments[unitId][siteId] = current + count;
    saveState();
    renderSiteAllocation();
}

// Unassign a unit from a site (remove all lines)
function unassignUnit(unitId, siteId) {
    if (siteAssignments[unitId]) {
        delete siteAssignments[unitId][siteId];
        if (Object.keys(siteAssignments[unitId]).length === 0) {
            delete siteAssignments[unitId];
        }
    }
    saveState();
    renderSiteAllocation();
}

// Reset all assignments
function resetAllocation() {
    siteAssignments = {};
    saveState();
    renderSiteAllocation();
}

// Auto-allocate units using Best Fit Decreasing algorithm
function autoAllocateUnits() {
    // Reset current assignments
    siteAssignments = {};

    // Create a list of individual lines to allocate
    const linesToAllocate = [];
    allocatableUnits.forEach(unit => {
        for (let i = 0; i < unit.total_lines; i++) {
            linesToAllocate.push({
                unitId: unit.id,
                portPerLine: unit.port_per_line
            });
        }
    });

    // Sort by port per line (descending)
    linesToAllocate.sort((a, b) => b.portPerLine - a.portPerLine);

    // Track remaining capacity for each site
    const remainingCapacity = {};
    SITES.forEach(site => {
        remainingCapacity[site.id] = site.ports;
    });

    // Allocate each line to the best fitting site
    linesToAllocate.forEach(line => {
        let bestSite = null;
        let bestFit = Infinity;

        SITES.forEach(site => {
            const remaining = remainingCapacity[site.id];
            if (remaining >= line.portPerLine) {
                const fit = remaining - line.portPerLine;
                if (fit < bestFit) {
                    bestFit = fit;
                    bestSite = site.id;
                }
            }
        });

        if (bestSite) {
            if (!siteAssignments[line.unitId]) {
                siteAssignments[line.unitId] = {};
            }
            siteAssignments[line.unitId][bestSite] = (siteAssignments[line.unitId][bestSite] || 0) + 1;
            remainingCapacity[bestSite] -= line.portPerLine;
        }
    });

    saveState();
    renderSiteAllocation();

    // Check for unassigned units
    const unassigned = getUnassignedUnits();
    if (unassigned.length > 0) {
        const totalUnassignedPorts = unassigned.reduce((sum, u) => sum + u.port_per_line * u.remaining, 0);
        const totalUnassignedLines = unassigned.reduce((sum, u) => sum + u.remaining, 0);
        alert(`${totalUnassignedLines}개의 라인(총 ${totalUnassignedPorts}포트)을 배치할 수 없습니다. 부지 용량을 초과합니다.`);
    }
}

// Render site allocation UI
function renderSiteAllocation() {
    console.log('renderSiteAllocation called, allocatableUnits:', allocatableUnits);
    console.log('siteAllocationSection element:', siteAllocationSection);

    if (!siteAllocationSection || allocatableUnits.length === 0) {
        console.log('Hiding site allocation - section:', !!siteAllocationSection, 'units:', allocatableUnits.length);
        hideSiteAllocation();
        return;
    }

    siteAllocationSection.style.display = 'block';
    console.log('Showing site allocation section');

    // Render site cards
    siteCardsContainer.innerHTML = SITES.map(site => {
        const usedPorts = getSiteUsedPorts(site.id);
        const percentage = Math.min(100, (usedPorts / site.ports) * 100);
        const isOverflow = usedPorts > site.ports;
        const isWarning = percentage > 80 && !isOverflow;

        const siteUnits = getSiteUnits(site.id);
        const unassignedUnits = getUnassignedUnits();

        return `
            <div class="site-card">
                <div class="site-card-header">
                    <h4>${site.name}</h4>
                    <span class="site-config">${site.config}</span>
                </div>
                <div class="port-usage">
                    <div class="port-usage-bar">
                        <div class="port-usage-fill ${isOverflow ? 'overflow' : isWarning ? 'warning' : ''}"
                             style="width: ${Math.min(100, percentage)}%"></div>
                    </div>
                    <div class="port-usage-text ${isOverflow ? 'overflow' : ''}">
                        <span>${usedPorts}/${site.ports} 포트</span>
                        ${isOverflow ? '<span>초과!</span>' : ''}
                    </div>
                </div>
                <div class="site-card-content">
                    <div class="site-bundle-list">
                        ${siteUnits.map(unit => `
                            <div class="site-bundle-item">
                                <span class="bundle-name">${unit.name}</span>
                                <span class="bundle-ports">${unit.port_per_line}p × ${unit.assigned_count}</span>
                                <button class="remove-bundle-btn" onclick="unassignUnit('${unit.id}', '${site.id}')">&times;</button>
                            </div>
                        `).join('')}
                    </div>
                    ${unassignedUnits.length > 0 ? `
                        <div class="site-add-bundle">
                            <select onchange="if(this.value) { assignUnit(this.value, '${site.id}'); this.value=''; }">
                                <option value="">+ 생산 단위 추가...</option>
                                ${unassignedUnits.map(unit => `
                                    <option value="${unit.id}">${unit.name} (${unit.port_per_line}p × ${unit.remaining})</option>
                                `).join('')}
                            </select>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    // Render unassigned units
    const unassigned = getUnassignedUnits();
    if (unassigned.length > 0) {
        unassignedBundlesContainer.innerHTML = `
            <h4>미할당 생산 단위</h4>
            <div class="unassigned-bundles-list">
                ${unassigned.map(unit => `
                    <div class="unassigned-bundle">
                        <span>${unit.name}</span>
                        <span class="bundle-ports">${unit.port_per_line}p × ${unit.remaining}</span>
                        <select onchange="if(this.value) { assignUnit('${unit.id}', this.value); }">
                            <option value="">부지 선택...</option>
                            ${SITES.map(site => `
                                <option value="${site.id}">${site.name}</option>
                            `).join('')}
                        </select>
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        unassignedBundlesContainer.innerHTML = allocatableUnits.length > 0 ?
            '<div class="no-unassigned">모든 생산 단위가 부지에 할당되었습니다.</div>' : '';
    }
}

// Event listeners for site allocation
if (autoAllocateBtn) {
    autoAllocateBtn.addEventListener('click', autoAllocateUnits);
}

if (resetAllocationBtn) {
    resetAllocationBtn.addEventListener('click', resetAllocation);
}
