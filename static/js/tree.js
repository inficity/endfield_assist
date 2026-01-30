// Tree visualization with vis.js - Multi-item support
let network = null;
const FIXED_SCALE = 0.65;

// Multi-item state
let selectedItems = [];  // [{id, name, lines}]
let splitPoints = new Set();  // Set of item_ids that are split points

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

    // Auto-load tree
    if (selectedItems.length > 0) {
        loadMultiProductionTree();
    }
}

// Remove item from the list
function removeItem(index) {
    selectedItems.splice(index, 1);
    renderMultiItemList();

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
    }
}

// Adjust item lines
function adjustItemLines(index, delta) {
    const newLines = Math.max(1, selectedItems[index].lines + delta);
    selectedItems[index].lines = newLines;
    renderMultiItemList();
    loadMultiProductionTree();
}

// Set item lines directly
function setItemLines(index, value) {
    const lines = Math.max(1, parseInt(value) || 1);
    selectedItems[index].lines = lines;
    renderMultiItemList();
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
        renderTree(data.tree);
        renderBundles(data.bundles);
        renderSummary(data.summary);
    } catch (error) {
        console.error(error);
        alert('트리를 불러오는데 실패했습니다.');
    }
}

// Render tree with vis.js
function renderTree(treeData) {
    const nodes = new vis.DataSet(treeData.nodes.map(node => {
        const isSplitPoint = splitPoints.has(node.item_id);

        return {
            id: node.id,
            label: node.label,
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
            font: {
                color: '#aaa',
                size: 20,
                background: '#1a1a2e',
                strokeWidth: 0,
            },
            borderWidth: isSplitPoint ? 4 : 2,
            borderWidthSelected: 4,
            shapeProperties: {
                useBorderWithImage: true,
            },
            itemId: node.item_id,
            isRaw: node.is_raw,
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
            hierarchical: {
                direction: 'LR',
                sortMethod: 'directed',
                levelSeparation: 250,
                nodeSpacing: 173,
            },
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

    // Adjust container height based on content after layout is done
    setTimeout(function() {
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
function renderBundles(bundles) {
    if (!bundles || bundles.length === 0) {
        bundlesSection.style.display = 'none';
        return;
    }

    bundlesSection.style.display = 'block';

    bundlesContainer.innerHTML = bundles.map(bundle => {
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
                    <span class="port-total">창고 출력 포트: <strong>${bundle.port_count}개</strong></span>
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
            addItem(item.id, item.name);

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

// Initialize from URL parameters
function initFromUrl() {
    const params = getUrlParams();
    if (params.item) {
        const item = items.find(i => i.id === params.item);
        if (item && !item.is_raw) {
            const lines = params.lines || 1;
            selectedItems = [{
                id: item.id,
                name: item.name,
                lines: lines
            }];
            renderMultiItemList();
            loadMultiProductionTree();
        }
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
