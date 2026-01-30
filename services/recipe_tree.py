import math
from typing import Optional
from collections import defaultdict
from models import Item, Recipe, Machine


class RecipeTreeService:
    def __init__(self, items: dict[str, Item], recipes: dict[str, Recipe], machines: dict[str, Machine] = None):
        self.items = items
        self.recipes = recipes
        self.machines = machines or {}
        self._recipe_by_result: dict[str, Recipe] = {}
        self._build_recipe_index()

    def _build_recipe_index(self):
        """Build index of recipes by result item."""
        self._recipe_by_result = {}
        for recipe in self.recipes.values():
            self._recipe_by_result[recipe.result] = recipe

    def get_recipe_for_item(self, item_id: str) -> Optional[Recipe]:
        """Get the recipe that produces this item."""
        return self._recipe_by_result.get(item_id)

    def build_tree(self, target_item_id: str, quantity: int = 1) -> dict:
        """
        Build a recipe tree for the target item.
        Returns nodes and edges for vis.js visualization.
        """
        nodes = []
        edges = []
        visited = set()
        node_id_counter = [0]

        def get_node_id():
            node_id_counter[0] += 1
            return node_id_counter[0]

        def traverse(item_id: str, required_qty: float, parent_node_id: Optional[int] = None):
            item = self.items.get(item_id)
            if not item:
                return

            current_node_id = get_node_id()
            recipe = self.get_recipe_for_item(item_id)

            # Determine node color based on item type
            if item.is_raw:
                color = "#4CAF50"  # Green for raw materials
            elif recipe:
                color = "#2196F3"  # Blue for craftable items
            else:
                color = "#FF9800"  # Orange for items without recipe

            # Build node label
            label = f"{item.name}\n(x{required_qty:.1f})"
            if recipe:
                if recipe.machine:
                    label += f"\n[{recipe.machine}]"
                if recipe.craft_time > 0:
                    label += f"\n⏱ {recipe.craft_time}s"

            node = {
                "id": current_node_id,
                "label": label,
                "color": color,
                "item_id": item_id,
                "quantity": required_qty,
                "is_raw": item.is_raw,
            }
            nodes.append(node)

            # Add edge from parent
            if parent_node_id is not None:
                edges.append({
                    "from": current_node_id,
                    "to": parent_node_id,
                    "label": f"x{required_qty:.1f}",
                    "arrows": "to",
                })

            # If item is raw or has no recipe, stop traversing
            if item.is_raw or not recipe:
                return

            # Calculate how many crafts needed
            crafts_needed = required_qty / recipe.result_count

            # Traverse ingredients
            for ingredient in recipe.ingredients:
                ingredient_qty = ingredient.count * crafts_needed
                traverse(ingredient.item_id, ingredient_qty, current_node_id)

        traverse(target_item_id, quantity)

        return {
            "nodes": nodes,
            "edges": edges,
        }

    def calculate_raw_materials(self, target_item_id: str, quantity: int = 1) -> dict[str, float]:
        """
        Calculate total raw materials needed for the target item.
        """
        raw_materials: dict[str, float] = {}

        def traverse(item_id: str, required_qty: float):
            item = self.items.get(item_id)
            if not item:
                return

            # If raw material, add to totals
            if item.is_raw:
                raw_materials[item_id] = raw_materials.get(item_id, 0) + required_qty
                return

            recipe = self.get_recipe_for_item(item_id)
            if not recipe:
                # No recipe and not raw, treat as raw
                raw_materials[item_id] = raw_materials.get(item_id, 0) + required_qty
                return

            # Calculate crafts needed
            crafts_needed = required_qty / recipe.result_count

            # Traverse ingredients
            for ingredient in recipe.ingredients:
                ingredient_qty = ingredient.count * crafts_needed
                traverse(ingredient.item_id, ingredient_qty)

        traverse(target_item_id, quantity)

        return raw_materials

    # Raw material supply rate: 1 item per 2 sec = 30 items/min
    RAW_MATERIAL_SUPPLY_RATE = 30.0

    def _format_rate(self, value: float) -> str:
        """Format rate without unnecessary decimals."""
        if value == int(value):
            return str(int(value))
        return f"{value:.1f}"

    def _get_base_production_rate(self, recipe: Recipe) -> float:
        """Get base production rate in items per minute."""
        if recipe.craft_time <= 0:
            return 0
        return (recipe.result_count / recipe.craft_time) * 60

    def build_production_tree(self, target_item_id: str, target_rate: float) -> dict:
        """
        Build a production tree based on target production rate (items/min).
        Returns nodes and edges for vis.js visualization, plus a summary.
        """
        nodes = []
        edges = []
        summary = {}  # item_id -> {rate, lines, machine}
        node_id_counter = [0]

        def get_node_id():
            node_id_counter[0] += 1
            return node_id_counter[0]

        def traverse(item_id: str, required_rate: float, parent_node_id: Optional[int] = None):
            item = self.items.get(item_id)
            if not item:
                return

            current_node_id = get_node_id()
            recipe = self.get_recipe_for_item(item_id)

            # Get machine name
            machine_name = None
            if recipe and recipe.machine:
                machine = self.machines.get(recipe.machine)
                machine_name = machine.name if machine else recipe.machine

            # Calculate lines needed
            lines_needed = 0
            base_rate = 0
            is_raw = item.is_raw or not recipe

            if is_raw:
                # Raw materials: use fixed supply rate
                base_rate = self.RAW_MATERIAL_SUPPLY_RATE
                lines_needed = math.ceil(required_rate / base_rate)
            elif recipe and recipe.craft_time > 0:
                base_rate = self._get_base_production_rate(recipe)
                lines_needed = math.ceil(required_rate / base_rate) if base_rate > 0 else 0

            # Determine node color based on item type and lines
            if is_raw:
                color = "#4CAF50"  # Green for raw materials
            elif lines_needed <= 1:
                color = "#2196F3"  # Blue for single line
            else:
                color = "#FF9800"  # Orange for multiple lines

            # Build node label (rate shown on edges, name on icon)
            if is_raw:
                label = f"공급 {lines_needed}개"
            else:
                if machine_name:
                    label = f"[{machine_name}]\n라인 {lines_needed}개"
                else:
                    label = f"라인 {lines_needed}개"

            node = {
                "id": current_node_id,
                "label": label,
                "color": color,
                "item_id": item_id,
                "rate": required_rate,
                "lines": lines_needed,
                "is_raw": item.is_raw or not recipe,
                "machine": machine_name,
            }
            nodes.append(node)

            # Add edge from parent
            if parent_node_id is not None:
                edges.append({
                    "from": current_node_id,
                    "to": parent_node_id,
                    "label": f"{self._format_rate(required_rate)}/min",
                    "arrows": "to",
                })

            # Aggregate summary
            if item_id not in summary:
                summary[item_id] = {
                    "item_id": item_id,
                    "name": item.name,
                    "rate": 0,
                    "lines": 0,
                    "actual_rate": 0,
                    "surplus": 0,
                    "machine": machine_name,
                    "is_raw": is_raw,
                    "base_rate": base_rate,
                }
            summary[item_id]["rate"] += required_rate
            # Recalculate lines and surplus for aggregated rate
            if summary[item_id]["base_rate"] > 0:
                summary[item_id]["lines"] = math.ceil(summary[item_id]["rate"] / summary[item_id]["base_rate"])
                summary[item_id]["actual_rate"] = summary[item_id]["lines"] * summary[item_id]["base_rate"]
                summary[item_id]["surplus"] = summary[item_id]["actual_rate"] - summary[item_id]["rate"]

            # If item is raw or has no recipe, stop traversing
            if item.is_raw or not recipe:
                return

            # Calculate required input rate for each ingredient
            # required_input_rate = (ingredient_count * target_rate) / result_count
            for ingredient in recipe.ingredients:
                ingredient_rate = (ingredient.count * required_rate) / recipe.result_count
                traverse(ingredient.item_id, ingredient_rate, current_node_id)

        traverse(target_item_id, target_rate)

        return {
            "nodes": nodes,
            "edges": edges,
            "summary": list(summary.values()),
        }

    def build_multi_production_tree(
        self,
        items_with_lines: list[dict],
        split_points: list[str] = None
    ) -> dict:
        """
        Build a production tree for multiple items with split points.

        Args:
            items_with_lines: List of {"id": item_id, "lines": line_count}
            split_points: List of item_ids that act as split points (warehouse boundaries)

        Returns:
            {
                "tree": {"nodes": [], "edges": []},
                "bundles": [{"id", "name", "machines", "ports", "port_count", "items"}],
                "summary": [production items summary]
            }
        """
        split_points_set = set(split_points or [])

        nodes = []
        edges = []
        summary = {}  # item_id -> aggregated info
        node_id_counter = [0]

        # Track which bundle each production item belongs to
        bundle_productions = defaultdict(set)  # bundle_id -> set of item_ids
        bundle_consumptions = defaultdict(set)  # bundle_id -> set of split point item_ids consumed

        # Track rates per bundle per item for accurate port calculation
        bundle_item_rates = defaultdict(lambda: defaultdict(float))  # bundle_id -> item_id -> rate

        def get_node_id():
            node_id_counter[0] += 1
            return node_id_counter[0]

        def traverse(
            item_id: str,
            required_rate: float,
            parent_node_id: Optional[int],
            bundle_id: str,
        ):
            item = self.items.get(item_id)
            if not item:
                return

            is_split = item_id in split_points_set

            # If this item is a split point, it belongs to its own bundle (not parent's)
            # This is the key difference: split point production goes to its own bundle
            current_bundle_id = f"split_{item_id}" if is_split else bundle_id

            current_node_id = get_node_id()
            recipe = self.get_recipe_for_item(item_id)

            machine_name = None
            machine_id = None
            if recipe and recipe.machine:
                machine = self.machines.get(recipe.machine)
                machine_name = machine.name if machine else recipe.machine
                machine_id = recipe.machine

            lines_needed = 0
            base_rate = 0
            is_raw = item.is_raw or not recipe

            if is_raw:
                base_rate = self.RAW_MATERIAL_SUPPLY_RATE
                lines_needed = math.ceil(required_rate / base_rate)
            elif recipe and recipe.craft_time > 0:
                base_rate = self._get_base_production_rate(recipe)
                lines_needed = math.ceil(required_rate / base_rate) if base_rate > 0 else 0

            # Determine node color
            if is_split:
                color = "#9C27B0"  # Purple for split points
            elif is_raw:
                color = "#4CAF50"  # Green for raw materials
            elif lines_needed <= 1:
                color = "#2196F3"  # Blue for single line
            else:
                color = "#FF9800"  # Orange for multiple lines

            # Build node label
            if is_raw:
                label = f"공급 {lines_needed}개"
            else:
                if machine_name:
                    label = f"[{machine_name}]\n라인 {lines_needed}개"
                else:
                    label = f"라인 {lines_needed}개"

            node = {
                "id": current_node_id,
                "label": label,
                "color": color,
                "item_id": item_id,
                "rate": required_rate,
                "lines": lines_needed,
                "is_raw": is_raw,
                "machine": machine_name,
                "is_split_point": is_split,
                "bundle_id": current_bundle_id,
            }
            nodes.append(node)

            if parent_node_id is not None:
                edges.append({
                    "from": current_node_id,
                    "to": parent_node_id,
                    "label": f"{self._format_rate(required_rate)}/min",
                    "arrows": "to",
                })

            # Aggregate summary
            if item_id not in summary:
                summary[item_id] = {
                    "item_id": item_id,
                    "name": item.name,
                    "rate": 0,
                    "lines": 0,
                    "actual_rate": 0,
                    "surplus": 0,
                    "machine": machine_name,
                    "machine_id": machine_id,
                    "is_raw": is_raw,
                    "base_rate": base_rate,
                    "is_split_point": is_split,
                }
            summary[item_id]["rate"] += required_rate
            if summary[item_id]["base_rate"] > 0:
                summary[item_id]["lines"] = math.ceil(
                    summary[item_id]["rate"] / summary[item_id]["base_rate"]
                )
                summary[item_id]["actual_rate"] = (
                    summary[item_id]["lines"] * summary[item_id]["base_rate"]
                )
                summary[item_id]["surplus"] = (
                    summary[item_id]["actual_rate"] - summary[item_id]["rate"]
                )

            # Track bundle membership - item goes to its determined bundle
            bundle_productions[current_bundle_id].add(item_id)

            # Track rate for this item in this bundle
            bundle_item_rates[current_bundle_id][item_id] += required_rate

            # Track which bundles consume from split points
            if is_split:
                # The parent bundle consumes this split point
                bundle_consumptions[bundle_id].add(item_id)

            # Stop traversing if raw or no recipe
            if is_raw or not recipe:
                return

            # Traverse ingredients - they belong to current_bundle_id (not the original bundle_id)
            for ingredient in recipe.ingredients:
                ingredient_rate = (ingredient.count * required_rate) / recipe.result_count
                ing_id = ingredient.item_id

                traverse(ing_id, ingredient_rate, current_node_id, current_bundle_id)

        # Process each target item
        for item_spec in items_with_lines:
            item_id = item_spec["id"]
            lines = item_spec.get("lines", 1)

            item = self.items.get(item_id)
            if not item:
                continue

            recipe = self.get_recipe_for_item(item_id)
            if not recipe:
                continue

            base_rate = self._get_base_production_rate(recipe)
            target_rate = base_rate * lines

            # Each target item starts its own bundle
            bundle_id = f"target_{item_id}"
            traverse(item_id, target_rate, None, bundle_id)

        # Build bundles information
        bundles = self._build_bundles(
            bundle_productions, bundle_consumptions, bundle_item_rates,
            summary, split_points_set, items_with_lines
        )

        return {
            "tree": {"nodes": nodes, "edges": edges},
            "bundles": bundles,
            "summary": list(summary.values()),
        }

    def _build_bundles(
        self,
        bundle_productions: dict,
        bundle_consumptions: dict,
        bundle_item_rates: dict,
        summary: dict,
        split_points: set,
        target_items: list[dict]
    ) -> list[dict]:
        """
        Build bundle information with machines and port counts.

        Port calculation uses bundle-specific rates, not global summary.
        """
        target_item_ids = {item["id"] for item in target_items}
        bundles = []

        # Merge bundles with identical item sets
        bundle_groups = {}
        for bundle_id, item_ids in bundle_productions.items():
            items_key = tuple(sorted(item_ids))
            if items_key not in bundle_groups:
                bundle_groups[items_key] = {
                    "ids": [bundle_id],
                    "items": set(item_ids),
                    "consumes": set(),
                    "rates": defaultdict(float),
                }
            else:
                bundle_groups[items_key]["ids"].append(bundle_id)

            # Add consumed split points for this bundle
            if bundle_id in bundle_consumptions:
                bundle_groups[items_key]["consumes"].update(bundle_consumptions[bundle_id])

            # Merge rates
            for item_id, rate in bundle_item_rates[bundle_id].items():
                bundle_groups[items_key]["rates"][item_id] += rate

        bundle_index = 1
        for items_key, group_data in bundle_groups.items():
            bundle_ids = group_data["ids"]
            item_ids = group_data["items"]
            consumed_splits = group_data["consumes"]
            bundle_rates = group_data["rates"]

            # Determine bundle name based on what's in it
            target_names = []
            split_names = []
            for bid in bundle_ids:
                if bid.startswith("target_"):
                    actual_id = bid[7:]  # Remove "target_" prefix
                    if actual_id in target_item_ids:
                        item = self.items.get(actual_id)
                        if item:
                            target_names.append(item.name)
                elif bid.startswith("split_"):
                    actual_id = bid[6:]  # Remove "split_" prefix
                    if actual_id in split_points:
                        item = self.items.get(actual_id)
                        if item:
                            split_names.append(item.name)

            if target_names:
                bundle_name = f"묶음 {bundle_index}: " + ", ".join(target_names)
            elif split_names:
                bundle_name = f"묶음 {bundle_index}: " + ", ".join(split_names) + "까지"
            else:
                bundle_name = f"묶음 {bundle_index}"

            # Calculate machines and ports using bundle-specific rates
            machines = defaultdict(int)
            ports = []
            port_count = 0

            for item_id in item_ids:
                if item_id not in summary:
                    continue

                item_summary = summary[item_id]
                is_raw = item_summary["is_raw"]
                base_rate = item_summary["base_rate"]

                # Use bundle-specific rate for this item
                bundle_rate = bundle_rates.get(item_id, 0)
                if base_rate > 0:
                    lines = math.ceil(bundle_rate / base_rate)
                else:
                    lines = 0

                if is_raw:
                    # Raw materials need warehouse output ports
                    if lines > 0:
                        ports.append({
                            "item_id": item_id,
                            "name": item_summary["name"],
                            "count": lines,
                            "type": "raw",
                        })
                        port_count += lines
                elif item_summary["machine"] and lines > 0:
                    # Production machines
                    machine_name = item_summary["machine"]
                    machines[machine_name] += lines

            # Add ports for consumed split points (items from other bundles)
            for split_id in consumed_splits:
                if split_id in summary:
                    split_summary = summary[split_id]
                    # For split points consumed, we need the rate that THIS bundle consumes
                    # This is tracked in the parent bundle that triggered consumption
                    # Use the global summary lines as approximation for now
                    lines = split_summary["lines"]
                    ports.append({
                        "item_id": split_id,
                        "name": split_summary["name"],
                        "count": lines,
                        "type": "split",
                    })
                    port_count += lines

            bundles.append({
                "id": bundle_ids[0],
                "name": bundle_name,
                "machines": dict(machines),
                "ports": ports,
                "port_count": port_count,
                "item_ids": list(item_ids),
            })

            bundle_index += 1

        return bundles
