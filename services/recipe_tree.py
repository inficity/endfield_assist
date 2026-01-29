import math
from typing import Optional
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
