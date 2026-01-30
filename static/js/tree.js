// Tree visualization with vis.js
let network = null;
let selectedItemId = null;
let selectedItemBaseRate = 0;

// DOM elements
const searchInput = document.getElementById('item-search');
const autocompleteList = document.getElementById('autocomplete-list');
const targetLinesInput = document.getElementById('target-lines');
const rateDisplay = document.getElementById('rate-display');
const calculatedRateSpan = document.getElementById('calculated-rate');
const showTreeBtn = document.getElementById('show-tree-btn');
const treeContainer = document.getElementById('tree-network');
const summarySection = document.getElementById('production-summary-section');
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

// Update rate display
function updateRateDisplay() {
    if (selectedItemId && selectedItemBaseRate > 0) {
        const lines = parseInt(targetLinesInput.value) || 1;
        const rate = selectedItemBaseRate * lines;
        calculatedRateSpan.textContent = `${formatRate(rate)}/min`;
        rateDisplay.style.display = 'block';
    } else {
        rateDisplay.style.display = 'none';
    }
}

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
        if (item) {
            searchInput.value = item.name;
            selectedItemId = item.id;

            const recipe = getRecipeForItem(item.id);
            selectedItemBaseRate = getBaseProductionRate(recipe);

            const lines = params.lines || 1;
            targetLinesInput.value = lines;
            updateRateDisplay();

            const rate = selectedItemBaseRate * lines;
            loadProductionTree(item.id, rate);
        }
    }
}

// Autocomplete functionality
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    autocompleteList.innerHTML = '';

    if (!query) {
        autocompleteList.classList.remove('active');
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
        matches.forEach(item => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.innerHTML = `
                <img src="${getIconUrl(item.id)}" onerror="this.style.display='none'">
                <span>${item.name}</span>
            `;
            div.addEventListener('click', () => {
                searchInput.value = item.name;
                selectedItemId = item.id;

                const recipe = getRecipeForItem(item.id);
                selectedItemBaseRate = getBaseProductionRate(recipe);
                updateRateDisplay();

                autocompleteList.classList.remove('active');

                // Load tree immediately
                const lines = parseInt(targetLinesInput.value) || 1;
                const rate = selectedItemBaseRate * lines;
                const url = new URL(window.location);
                url.searchParams.set('item', item.id);
                url.searchParams.set('lines', lines);
                window.history.pushState({}, '', url);
                loadProductionTree(item.id, rate);
            });
            autocompleteList.appendChild(div);
        });
        autocompleteList.classList.add('active');
    } else {
        autocompleteList.classList.remove('active');
    }
});

// Update rate and tree when lines change
targetLinesInput.addEventListener('input', () => {
    updateRateDisplay();
    if (selectedItemId && selectedItemBaseRate > 0) {
        const lines = parseInt(targetLinesInput.value) || 1;
        const rate = selectedItemBaseRate * lines;
        const url = new URL(window.location);
        url.searchParams.set('item', selectedItemId);
        url.searchParams.set('lines', lines);
        window.history.pushState({}, '', url);
        loadProductionTree(selectedItemId, rate);
    }
});

// Close autocomplete when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.form-group')) {
        autocompleteList.classList.remove('active');
    }
});

// Show tree button
showTreeBtn.addEventListener('click', async () => {
    if (!selectedItemId) {
        alert('아이템을 선택해주세요.');
        return;
    }

    const lines = parseInt(targetLinesInput.value) || 1;
    const rate = selectedItemBaseRate * lines;

    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('item', selectedItemId);
    url.searchParams.set('lines', lines);
    window.history.pushState({}, '', url);

    await loadProductionTree(selectedItemId, rate);
});

// Load and render production tree
async function loadProductionTree(itemId, rate) {
    try {
        const response = await fetch(`/api/production-tree/${itemId}?rate=${rate}`);
        if (!response.ok) {
            throw new Error('트리 로드 실패');
        }

        const data = await response.json();
        renderTree(data);
        renderSummary(data.summary);
    } catch (error) {
        console.error(error);
        alert('트리를 불러오는데 실패했습니다.');
    }
}

// Render tree with vis.js
function renderTree(data) {
    const nodes = new vis.DataSet(data.nodes.map(node => ({
        id: node.id,
        label: node.label,
        image: getIconUrl(node.item_id),
        shape: 'image',
        size: 47,
        color: {
            background: node.color,
            border: node.color,
            highlight: {
                background: node.color,
                border: '#fff',
            },
        },
        font: {
            color: '#aaa',
            size: 20,
            background: '#1a1a2e',
            strokeWidth: 0,
        },
        borderWidth: 2,
        borderWidthSelected: 3,
        shapeProperties: {
            useBorderWithImage: true,
        },
    })));

    const edges = new vis.DataSet(data.edges.map(edge => ({
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
                direction: 'LR',  // Left to Right
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
    prodTbody.innerHTML = productionItems.map(item => `
        <tr>
            <td>
                <img src="${getIconUrl(item.item_id)}" class="item-icon-small" onerror="this.style.display='none'">
                ${item.name}
            </td>
            <td>${item.machine || '-'}</td>
            <td class="${item.lines > 1 ? 'highlight-lines' : ''}">${item.lines}개</td>
            <td>${formatRate(item.rate)}/min</td>
            <td>${formatRate(item.actual_rate)}/min</td>
            <td class="${item.surplus > 0 ? 'highlight-surplus' : ''}">${item.surplus > 0 ? '+' + formatRate(item.surplus) : '-'}</td>
        </tr>
    `).join('');

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

// Adjust lines with +/- buttons
function adjustLines(delta) {
    const current = parseInt(targetLinesInput.value) || 1;
    const newValue = Math.max(1, current + delta);
    targetLinesInput.value = newValue;
    targetLinesInput.dispatchEvent(new Event('input'));
}

// Toggle graph visibility
function toggleGraph() {
    const isHidden = treeContainerParent.style.display === 'none';
    treeContainerParent.style.display = isHidden ? '' : 'none';
    toggleGraphBtn.textContent = isHidden ? '그래프 숨기기' : '그래프 표시';
}

// Quick buttons
document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const itemId = btn.dataset.item;
        const item = items.find(i => i.id === itemId);
        if (item) {
            searchInput.value = item.name;
            selectedItemId = item.id;

            const recipe = getRecipeForItem(item.id);
            selectedItemBaseRate = getBaseProductionRate(recipe);
            updateRateDisplay();

            // Update active state
            document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Load tree
            const lines = parseInt(targetLinesInput.value) || 1;
            const rate = selectedItemBaseRate * lines;
            const url = new URL(window.location);
            url.searchParams.set('item', itemId);
            url.searchParams.set('lines', lines);
            window.history.pushState({}, '', url);
            loadProductionTree(itemId, rate);
        }
    });
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', initFromUrl);
