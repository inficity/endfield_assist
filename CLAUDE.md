# Endfield Assist - Claude Code 가이드

## 환경 설정

### Python
- Python 실행: `python3` (not `python`)
- 서버 실행: `python3 -m uvicorn main:app --reload`

### 프로젝트 구조
- `main.py` - FastAPI 앱 및 API 엔드포인트
- `models.py` - Pydantic 모델 (Item, Recipe, Machine 등)
- `services/recipe_tree.py` - 레시피 트리 계산 로직
- `templates/` - Jinja2 HTML 템플릿
- `static/` - CSS, JS, 아이콘 파일
- `data/` - JSON 데이터 파일 (items, recipes, machines)

### 주요 API
- `/api/items` - 아이템 CRUD
- `/api/recipes` - 레시피 CRUD
- `/api/machines` - 기계 목록
- `/api/tree/{item_id}` - 수량 기반 레시피 트리
- `/api/production-tree/{item_id}` - 생산률 기반 트리 (개/분)
