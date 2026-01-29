import json
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse

from models import (
    Item, Recipe, Machine, ItemCreate, ItemUpdate, RecipeCreate, RecipeUpdate
)
from services.recipe_tree import RecipeTreeService

app = FastAPI(title="Endfield Recipe Tree")

# Static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Data paths
DATA_DIR = Path("data")
ITEMS_FILE = DATA_DIR / "items.json"
RECIPES_FILE = DATA_DIR / "recipes.json"
MACHINES_FILE = DATA_DIR / "machines.json"


def load_items() -> dict[str, Item]:
    """Load items from JSON file."""
    if not ITEMS_FILE.exists():
        return {}
    with open(ITEMS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {item_id: Item(**item_data) for item_id, item_data in data.items()}


def save_items(items: dict[str, Item]):
    """Save items to JSON file."""
    DATA_DIR.mkdir(exist_ok=True)
    with open(ITEMS_FILE, "w", encoding="utf-8") as f:
        json.dump({k: v.model_dump() for k, v in items.items()}, f, ensure_ascii=False, indent=2)


def load_recipes() -> dict[str, Recipe]:
    """Load recipes from JSON file."""
    if not RECIPES_FILE.exists():
        return {}
    with open(RECIPES_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {recipe_id: Recipe(**recipe_data) for recipe_id, recipe_data in data.items()}


def save_recipes(recipes: dict[str, Recipe]):
    """Save recipes to JSON file."""
    DATA_DIR.mkdir(exist_ok=True)
    with open(RECIPES_FILE, "w", encoding="utf-8") as f:
        json.dump({k: v.model_dump() for k, v in recipes.items()}, f, ensure_ascii=False, indent=2)


def load_machines() -> dict[str, Machine]:
    """Load machines from JSON file."""
    if not MACHINES_FILE.exists():
        return {}
    with open(MACHINES_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {machine_id: Machine(**machine_data) for machine_id, machine_data in data.items()}


# Page routes
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Main page with tree visualization."""
    items = load_items()
    recipes = load_recipes()
    return templates.TemplateResponse("index.html", {
        "request": request,
        "items": [item.model_dump() for item in items.values()],
        "recipes": [recipe.model_dump() for recipe in recipes.values()],
    })


@app.get("/items", response_class=HTMLResponse)
async def items_page(request: Request):
    """Items management page."""
    items = load_items()
    return templates.TemplateResponse("items.html", {
        "request": request,
        "items": [item.model_dump() for item in items.values()],
    })


@app.get("/recipes", response_class=HTMLResponse)
async def recipes_page(request: Request):
    """Recipes management page."""
    items = load_items()
    recipes = load_recipes()
    machines = load_machines()
    # Create lookup dicts for names
    items_dict = {item.id: item.name for item in items.values()}
    machines_dict = {machine.id: machine.name for machine in machines.values()}
    return templates.TemplateResponse("recipes.html", {
        "request": request,
        "items": [item.model_dump() for item in items.values()],
        "recipes": [recipe.model_dump() for recipe in recipes.values()],
        "machines": [machine.model_dump() for machine in machines.values()],
        "items_dict": items_dict,
        "machines_dict": machines_dict,
    })


@app.get("/machines", response_class=HTMLResponse)
async def machines_page(request: Request):
    """Machines list page."""
    machines = load_machines()
    machines_list = [machine.model_dump() for machine in machines.values()]
    categories = sorted(set(m["category"] for m in machines_list))
    return templates.TemplateResponse("machines.html", {
        "request": request,
        "machines": machines_list,
        "categories": categories,
    })


# API routes - Items
@app.get("/api/items")
async def get_items():
    """Get all items."""
    items = load_items()
    return list(items.values())


@app.get("/api/items/{item_id}")
async def get_item(item_id: str):
    """Get a specific item."""
    items = load_items()
    if item_id not in items:
        raise HTTPException(status_code=404, detail="Item not found")
    return items[item_id]


@app.post("/api/items")
async def create_item(item: ItemCreate):
    """Create a new item."""
    items = load_items()
    if item.id in items:
        raise HTTPException(status_code=400, detail="Item already exists")
    new_item = Item(**item.model_dump())
    items[item.id] = new_item
    save_items(items)
    return new_item


@app.put("/api/items/{item_id}")
async def update_item(item_id: str, item: ItemUpdate):
    """Update an existing item."""
    items = load_items()
    if item_id not in items:
        raise HTTPException(status_code=404, detail="Item not found")
    existing = items[item_id]
    update_data = item.model_dump(exclude_unset=True)
    updated = existing.model_copy(update=update_data)
    items[item_id] = updated
    save_items(items)
    return updated


@app.delete("/api/items/{item_id}")
async def delete_item(item_id: str):
    """Delete an item."""
    items = load_items()
    if item_id not in items:
        raise HTTPException(status_code=404, detail="Item not found")
    del items[item_id]
    save_items(items)
    return {"message": "Item deleted"}


# API routes - Machines
@app.get("/api/machines")
async def get_machines():
    """Get all machines."""
    machines = load_machines()
    return list(machines.values())


# API routes - Recipes
@app.get("/api/recipes")
async def get_recipes():
    """Get all recipes."""
    recipes = load_recipes()
    return list(recipes.values())


@app.get("/api/recipes/{recipe_id}")
async def get_recipe(recipe_id: str):
    """Get a specific recipe."""
    recipes = load_recipes()
    if recipe_id not in recipes:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipes[recipe_id]


@app.post("/api/recipes")
async def create_recipe(recipe: RecipeCreate):
    """Create a new recipe."""
    recipes = load_recipes()
    if recipe.id in recipes:
        raise HTTPException(status_code=400, detail="Recipe already exists")
    new_recipe = Recipe(**recipe.model_dump())
    recipes[recipe.id] = new_recipe
    save_recipes(recipes)
    return new_recipe


@app.put("/api/recipes/{recipe_id}")
async def update_recipe(recipe_id: str, recipe: RecipeUpdate):
    """Update an existing recipe."""
    recipes = load_recipes()
    if recipe_id not in recipes:
        raise HTTPException(status_code=404, detail="Recipe not found")
    existing = recipes[recipe_id]
    update_data = recipe.model_dump(exclude_unset=True)
    updated = existing.model_copy(update=update_data)
    recipes[recipe_id] = updated
    save_recipes(recipes)
    return updated


@app.delete("/api/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str):
    """Delete a recipe."""
    recipes = load_recipes()
    if recipe_id not in recipes:
        raise HTTPException(status_code=404, detail="Recipe not found")
    del recipes[recipe_id]
    save_recipes(recipes)
    return {"message": "Recipe deleted"}


# API routes - Tree
@app.get("/api/tree/{item_id}")
async def get_tree(item_id: str, quantity: int = 1):
    """Get recipe tree for an item."""
    items = load_items()
    recipes = load_recipes()

    if item_id not in items:
        raise HTTPException(status_code=404, detail="Item not found")

    service = RecipeTreeService(items, recipes)
    tree = service.build_tree(item_id, quantity)
    raw_materials = service.calculate_raw_materials(item_id, quantity)

    # Convert raw_materials to include item names
    raw_materials_display = []
    for raw_id, qty in raw_materials.items():
        item = items.get(raw_id)
        name = item.name if item else raw_id
        raw_materials_display.append({
            "item_id": raw_id,
            "name": name,
            "quantity": qty,
        })

    return {
        "tree": tree,
        "raw_materials": raw_materials_display,
    }


@app.get("/api/production-tree/{item_id}")
async def get_production_tree(item_id: str, rate: float = 1.0):
    """Get production tree for an item based on target production rate (items/min)."""
    items = load_items()
    recipes = load_recipes()
    machines = load_machines()

    if item_id not in items:
        raise HTTPException(status_code=404, detail="Item not found")

    service = RecipeTreeService(items, recipes, machines)
    result = service.build_production_tree(item_id, rate)

    return result


@app.get("/api/search")
async def search_items(q: str = ""):
    """Search items by name."""
    items = load_items()
    if not q:
        return list(items.values())
    q_lower = q.lower()
    results = [
        item for item in items.values()
        if q_lower in item.name.lower() or q_lower in item.id.lower()
    ]
    return results
