from PIL import Image
import os

# Create icons directory
os.makedirs("static/icons", exist_ok=True)

# Grid configuration
GRID_START_X = 274
GRID_START_Y = 73
CARD_WIDTH = 103
CARD_HEIGHT = 103
ICON_WIDTH = 96
ICON_HEIGHT = 100
COLS = 9

# Item IDs in order (left to right, top to bottom)
RAW_ITEMS = [
    # Row 1
    "originium_ore", "amethyst_ore", "perium_ore", "buckwheat_flower",
    "buckwheat_seed", "citron", "citron_seed", "sandleaf", "sandleaf_seed",
    # Row 2
    "aketon", "aketon_seed", "wood", "flame_buckwheat", "dark_citron",
    "gray_barley", "bitter_pepper", "gray_barley_seed", "bitter_pepper_seed",
]

CRAFT_ITEMS = [
    # Row 1
    "carbon_chunk", "origo_crust", "amethyst_fiber", "perium_chunk",
    "stable_carbon_chunk", "refined_origo_crust", "crystite_fiber",
    "steel_chunk", "carbon_powder",
    # Row 2
    "originium_powder", "origo_crust_powder", "amethyst_powder",
    "perium_powder", "sandleaf_powder", "aketon_powder",
    "fine_buckwheat_powder", "fine_citron_powder", "fine_carbon_powder",
    # Row 3
    "fine_originium_powder", "fine_origo_crust_powder", "crystite_powder",
    "fine_perium_powder", "amethyst_bottle", "perium_bottle",
    "crystite_bottle", "steel_bottle", "amethyst_part",
    # Row 4
    "perium_part", "crystite_part", "steel_part", "amethyst_equipment_part",
    "perium_equipment_part", "crystite_equipment_part",
    "small_canyon_battery", "medium_canyon_battery", "large_canyon_battery",
]

USE_ITEMS = [
    # Row 1
    "industrial_explosive", "buckwheat_powder", "citron_powder",
    "flame_buckwheat_powder", "dark_citron_powder", "buckwheat_healing_capsule_s",
    "citron_canned", "buckwheat_canned_m", "citron_canned_m",
    # Row 2
    "buckwheat_healing_capsule_l", "citron_canned_l", "buckwheat_potion_s",
    "buckwheat_potion_l", "citron_mixture_s", "arts_engraved_bottle",
    "arts_imbued_bottle", "arts_engraved_metal_bottle", "arts_imbued_metal_bottle",
    # Row 3
    "meat_substitute_buckwheat_stirfry", "strange_handmade_candy", "seshuka_steak",
    "instant_gomtang", "meat_meeting", "honeybee_pudding",
    "opening_day_meat_soup", "jacob_legacy", "cartilage_snack",
    # Row 4
    "edible_hell_furnace", "john_elder_hamburger", "star_fusion_jelly",
    "secret_holy_tea", "simple_pain_relief_ointment", "vitality_recovery_medicine",
    "base_emergency_ration", "spicy_pickled_fruit", "canyon_pie",
    # Row 5
    "spicy_stir_fried_meat",
]

# Machines (facilities)
MACHINES_PRODUCTION = [
    # 기초 생산 (6 machines)
    "refinery", "grinder", "parts_processor", "molder", "cultivator", "seed_extractor",
]

MACHINES_SYNTHESIS = [
    # 합성과 제작 (4 machines)
    "equipment_parts_synthesizer", "filler", "packager", "polisher",
]


def extract_icons(image_path, item_ids, output_dir="static/icons", cols=COLS):
    """Extract icons from a screenshot."""
    img = Image.open(image_path)

    for idx, item_id in enumerate(item_ids):
        row = idx // cols
        col = idx % cols

        # Calculate crop coordinates
        left = GRID_START_X + col * CARD_WIDTH
        top = GRID_START_Y + row * CARD_HEIGHT
        right = left + ICON_WIDTH
        bottom = top + ICON_HEIGHT

        # Crop and save
        icon = img.crop((left, top, right, bottom))
        output_path = os.path.join(output_dir, f"{item_id}.png")
        icon.save(output_path)
        print(f"Extracted: {item_id}")

    print(f"\nTotal: {len(item_ids)} icons extracted")


if __name__ == "__main__":
    print("=== Extracting raw items ===")
    extract_icons("raw_item.jpg", RAW_ITEMS)

    print("\n=== Extracting craft items ===")
    extract_icons("craft_item.jpg", CRAFT_ITEMS)

    print("\n=== Extracting usable items ===")
    extract_icons("use_item.jpeg", USE_ITEMS)

    print("\n=== Extracting machines (production) ===")
    extract_icons("facility_production.jpeg", MACHINES_PRODUCTION)

    print("\n=== Extracting machines (synthesis) ===")
    extract_icons("facility_synthesis.jpeg", MACHINES_SYNTHESIS)

    print("\n✓ Done! Icons saved to static/icons/")
