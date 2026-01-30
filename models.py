from pydantic import BaseModel
from typing import Optional


class Item(BaseModel):
    id: str
    name: str
    is_raw: bool = False


class Machine(BaseModel):
    id: str
    name: str
    category: str


class Ingredient(BaseModel):
    item_id: str
    count: int


class Recipe(BaseModel):
    id: str
    result: str
    result_count: int = 1
    ingredients: list[Ingredient]
    craft_time: float = 0
    machine: Optional[str] = None


class ItemCreate(BaseModel):
    id: str
    name: str
    is_raw: bool = False


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    is_raw: Optional[bool] = None


class RecipeCreate(BaseModel):
    id: str
    result: str
    result_count: int = 1
    ingredients: list[Ingredient]
    craft_time: float = 0
    machine: Optional[str] = None


class RecipeUpdate(BaseModel):
    result: Optional[str] = None
    result_count: Optional[int] = None
    ingredients: Optional[list[Ingredient]] = None
    craft_time: Optional[float] = None
    machine: Optional[str] = None


class ItemWithLines(BaseModel):
    id: str
    lines: int = 1


class MultiProductionRequest(BaseModel):
    items: list[ItemWithLines]
    split_points: list[str] = []
